import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronRightIcon, CopyIcon, FolderIcon, FolderOpenIcon, FrameIcon, MessageSquareIcon } from "lucide-react"

import type { BoardItem } from "../../shared/board"
import { formatRef } from "../../shared/refs"
import { frameStatusStore, selectionStore, type FrameStatus } from "@/board/board-store"
import { commentStore, showPanel } from "@/board/comment-store"
import { zoomToItem } from "@/canvas/actions"
import { useStore } from "@/lib/store"
import { copyText } from "@/lib/toast"
import { cn } from "@/lib/utils"

/** Comments per frame (on the frame itself or on one of its elements). */
function useCommentCounts(): Map<string, number> {
  const { comments } = useStore(commentStore)
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of comments) counts.set(c.target.frame, (counts.get(c.target.frame) ?? 0) + 1)
    return counts
  }, [comments])
}

/** The board's folder tree. Clicking an item selects it and moves the canvas to it. */
export function BoardTree({ items, onNavigate }: { items: BoardItem[]; onNavigate?: () => void }) {
  const selected = useStore(selectionStore)
  const statuses = useStore(frameStatusStore)
  const commentCounts = useCommentCounts()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Reveal a newly selected item (from the canvas, say) by expanding its ancestors.
  const [revealed, setRevealed] = useState(selected)
  if (selected !== revealed) {
    setRevealed(selected)
    if (selected) {
      const parts = selected.split("/")
      const ancestors = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"))
      if (ancestors.some((a) => collapsed.has(a))) {
        const next = new Set(collapsed)
        for (const a of ancestors) next.delete(a)
        setCollapsed(next)
      }
    }
  }

  return (
    <div role="tree" aria-label="Board" className="flex flex-col gap-px p-1.5">
      {items.map((item) => (
        <TreeRow
          key={item.id}
          item={item}
          depth={0}
          selected={selected}
          statuses={statuses}
          commentCounts={commentCounts}
          collapsed={collapsed}
          onToggle={toggle}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function TreeRow({
  item,
  depth,
  selected,
  statuses,
  commentCounts,
  collapsed,
  onToggle,
  onNavigate,
}: {
  item: BoardItem
  depth: number
  selected: string | null
  statuses: Record<string, FrameStatus>
  commentCounts: Map<string, number>
  collapsed: Set<string>
  onToggle: (id: string) => void
  onNavigate?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isSelected = selected === item.id
  const hasChildren = item.children.length > 0
  const open = hasChildren && !collapsed.has(item.id)
  const isFrame = item.kind === "frame"
  const error = isFrame && statuses[item.id]?.status === "error"
  const Icon = isFrame ? FrameIcon : open ? FolderOpenIcon : FolderIcon
  const comments = commentCounts.get(item.id) ?? 0

  useEffect(() => {
    if (isSelected) ref.current?.scrollIntoView({ block: "nearest" })
  }, [isSelected])

  return (
    <>
      <div
        ref={ref}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? open : undefined}
        tabIndex={0}
        title={item.id}
        className={cn(
          "group/row flex h-7 cursor-default items-center gap-1 rounded-md pr-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          isSelected
            ? "bg-selection/12 text-foreground"
            : "text-foreground/80 hover:bg-accent hover:text-foreground"
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => {
          zoomToItem(item.id)
          onNavigate?.()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            zoomToItem(item.id)
            onNavigate?.()
          } else if (e.key === "ArrowRight" && hasChildren && !open) {
            onToggle(item.id)
          } else if (e.key === "ArrowLeft" && open) {
            onToggle(item.id)
          }
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/10"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(item.id)
            }}
          >
            <ChevronRightIcon className={cn("size-3 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            isFrame ? (isSelected ? "text-selection" : "text-foreground/70") : "text-muted-foreground"
          )}
        />
        <span className={cn("min-w-0 truncate", !isFrame && "text-muted-foreground", isSelected && "font-medium")}>
          {item.title ?? item.name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          {error && <span className="size-1.5 rounded-full bg-destructive" aria-label="Error" />}
          {comments > 0 && (
            <button
              type="button"
              data-tree-comments
              className="inline-flex h-5 items-center gap-0.5 rounded-sm px-0.5 text-[11px] text-comment-ink tabular-nums hover:bg-comment/10"
              title={comments === 1 ? "1 comment" : `${comments} comments`}
              aria-label={`${comments === 1 ? "1 comment" : `${comments} comments`}: show comments`}
              onClick={(e) => {
                e.stopPropagation()
                showPanel("comments")
              }}
            >
              <MessageSquareIcon className="size-3" />
              {comments}
            </button>
          )}
          {isFrame && (
            <button
              type="button"
              data-tree-copy
              aria-label="Copy reference"
              title="Copy reference"
              className="hidden size-5 items-center justify-center rounded-sm text-muted-foreground group-focus-within/row:inline-flex group-hover/row:inline-flex hover:bg-foreground/10 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                void copyText(formatRef({ kind: "frame", frame: item.id }))
              }}
            >
              <CopyIcon className="size-3" />
            </button>
          )}
          {isFrame ? (
            <span className="text-[11px] text-muted-foreground tabular-nums group-focus-within/row:hidden group-hover/row:hidden">
              {item.width}×{item.height}
            </span>
          ) : item.children.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/70">empty</span>
          ) : null}
        </span>
      </div>
      {open && (
        <div role="group" className="flex flex-col gap-px">
          {item.children.map((child) => (
            <TreeRow
              key={child.id}
              item={child}
              depth={depth + 1}
              selected={selected}
              statuses={statuses}
              commentCounts={commentCounts}
              collapsed={collapsed}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </>
  )
}
