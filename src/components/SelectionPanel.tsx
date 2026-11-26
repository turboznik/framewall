import { useEffect, useRef } from "react"
import { CopyIcon, MessageSquarePlusIcon, Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react"

import { formatRef, formatSelection, refFromInfo } from "../../shared/refs"
import { formatLoc, ordinal, sameLoc, type SelectionItem, type SourceLoc } from "../../shared/selection"
import { startComment } from "@/board/comment-store"
import { clearSelection, pickStore, removeItem, selectCrumb, setActive } from "@/board/pick-store"
import { focusItem } from "@/canvas/actions"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useStore } from "@/lib/store"
import { copyText } from "@/lib/toast"
import { cn } from "@/lib/utils"

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border bg-muted px-1 font-sans text-[10px] leading-none font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

export function SmallIconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} className={className}>
            {children}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

const isTagName = (name: string) => /^[a-z]/.test(name)

function Crumbs({ item }: { item: SelectionItem }) {
  const last = item.crumbs.length - 1
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-5">
      <button
        type="button"
        className="rounded-sm font-mono text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        title="Show this frame on the canvas"
        onClick={() => focusItem(item.frameId)}
      >
        {item.frameId}
      </button>
      {item.crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-muted-foreground/50">›</span>
          {i === last ? (
            <span className={cn("font-semibold text-foreground", isTagName(crumb) && "font-mono text-[11px]")}>{crumb}</span>
          ) : (
            <button
              type="button"
              className={cn(
                "rounded-sm text-foreground/75 hover:text-selection hover:underline focus-visible:outline-2 focus-visible:outline-ring",
                isTagName(crumb) && "font-mono text-[11px]"
              )}
              title={`Select the element ${crumb} renders`}
              onClick={() => selectCrumb(item.uid, i)}
            >
              {crumb}
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

/** `label  dir/file.tsx:12`: the folder part gives way first when the row is narrow. */
function LocRow({ label, loc, withCol }: { label: string; loc: SourceLoc; withCol: boolean }) {
  const text = formatLoc(loc, withCol)
  const cut = loc.file.lastIndexOf("/") + 1
  return (
    <div className="flex gap-2" title={text}>
      <span className="w-16 shrink-0 font-sans text-muted-foreground">{label}</span>
      <span className="flex min-w-0">
        <span className="min-w-0 truncate text-muted-foreground">{loc.file.slice(0, cut)}</span>
        <span className="shrink-0 text-foreground/90">{text.slice(cut)}</span>
      </span>
    </div>
  )
}

function ItemCard({ item, n, active }: { item: SelectionItem; n: number; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const showDefined = item.definedIn && !sameLoc(item.definedIn, item.usedAt)
  // Columns only when both locations sit on the same line, as in the reference tag.
  const withCol =
    !!showDefined && !!item.definedIn && !!item.usedAt && item.definedIn.file === item.usedAt.file && item.definedIn.line === item.usedAt.line

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    <div
      ref={ref}
      data-active={active || undefined}
      data-uid={item.uid}
      className={cn(
        "group/item relative rounded-md border bg-background px-2.5 pt-2 pb-2 transition-colors",
        active ? "border-selection shadow-[inset_0_0_0_1px_var(--selection)]" : "hover:border-foreground/20"
      )}
      onPointerDown={() => !active && setActive(item.uid)}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[4px] px-1 text-[10px] font-semibold tabular-nums",
            item.stale ? "bg-muted text-muted-foreground" : "bg-selection text-white"
          )}
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <Crumbs item={item} />
        </div>
        <span className="-mt-0.5 -mr-1 flex shrink-0 items-center opacity-60 group-hover/item:opacity-100 group-data-active/item:opacity-100">
          {!item.stale && (
            <SmallIconButton label="Comment on this element (C)" onClick={() => startComment(refFromInfo(item))}>
              <MessageSquarePlusIcon />
            </SmallIconButton>
          )}
          <SmallIconButton label="Copy reference" onClick={() => void copyText(formatRef(refFromInfo(item)))}>
            <CopyIcon />
          </SmallIconButton>
          <SmallIconButton label="Remove from selection" onClick={() => removeItem(item.uid)}>
            <XIcon />
          </SmallIconButton>
        </span>
      </div>

      <div className="mt-1.5 space-y-0.5 pl-6 font-mono text-[11px] leading-4">
        {(item.count > 1 || item.stale) && (
          <div className="flex flex-wrap items-center gap-1.5 pb-0.5 font-sans">
            {item.count > 1 && (
              <span className="rounded-[4px] bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground tabular-nums">
                {ordinal(item.nth)} of {item.count}
              </span>
            )}
            {item.stale && (
              <span
                className="inline-flex items-center gap-1 rounded-[4px] bg-amber-500/12 px-1.5 text-[10px] leading-4 font-medium text-amber-700 dark:text-amber-400"
                title="This element wasn't found in its frame after the last edit. Its locations may be out of date."
              >
                <TriangleAlertIcon className="size-2.5" />
                Stale
              </span>
            )}
          </div>
        )}
        {item.usedAt && <LocRow label="used at" loc={item.usedAt} withCol={withCol} />}
        {showDefined && item.definedIn && <LocRow label="defined in" loc={item.definedIn} withCol={withCol} />}
        {item.snippet && (
          <div className="mt-1 truncate rounded-[4px] bg-muted/70 px-1.5 py-0.5 text-foreground/80" title={item.snippet}>
            {item.snippet}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="px-3 pt-1 pb-3 text-xs leading-relaxed text-muted-foreground">
      <p className="text-foreground/85">Click an element in any frame to select it.</p>
      <p>Hover shows the component and where its JSX lives.</p>
    </div>
  )
}

function Shortcuts() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Kbd>⇧</Kbd> click add
      </span>
      <span className="flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> parent / child
      </span>
      <span className="flex items-center gap-1">
        <Kbd>C</Kbd> comment
      </span>
      <span className="flex items-center gap-1">
        <Kbd>Esc</Kbd> clear
      </span>
    </div>
  )
}

/** The selection tab's header actions. */
export function SelectionActions() {
  const { items } = useStore(pickStore)
  if (!items.length) return null
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="Copy all references"
        title="Copy a reference for every selected element (⌘⇧C / Ctrl+Shift+C)"
        onClick={() => void copyText(formatSelection(items), items.length > 1 ? `Copied ${items.length} references` : "Copied")}
      >
        <CopyIcon />
        <span className="hidden min-[400px]:inline">Copy all</span>
      </Button>
      <SmallIconButton label="Clear selection" onClick={clearSelection} className="size-6">
        <Trash2Icon className="size-3" />
      </SmallIconButton>
    </>
  )
}

/** The picked elements: where they live, with Comment and Copy reference per element. */
export function SelectionList() {
  const { mode, items, active } = useStore(pickStore)
  return (
    <>
      {items.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
          {items.map((item, i) => (
            <ItemCard key={item.uid} item={item} n={i + 1} active={item.uid === active} />
          ))}
        </div>
      ) : (
        <EmptyHint />
      )}
      {mode && <Shortcuts />}
    </>
  )
}
