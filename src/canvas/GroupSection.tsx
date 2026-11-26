import { memo } from "react"
import { FolderIcon, FolderOpenIcon } from "lucide-react"

import type { LayoutBox } from "@/board/layout"
import { cn } from "@/lib/utils"

function countFrames(box: LayoutBox): number {
  let n = 0
  const walk = (items: LayoutBox["item"]["children"]) => {
    for (const item of items) {
      if (item.kind === "frame") n++
      walk(item.children)
    }
  }
  walk(box.item.children)
  return n
}

export const GroupSection = memo(function GroupSection({
  box,
  selected,
}: {
  box: LayoutBox
  selected: boolean
}) {
  const { item } = box
  const empty = item.children.length === 0
  const frames = countFrames(box)
  const Icon = empty ? FolderIcon : FolderOpenIcon
  return (
    <div
      data-item-id={box.id}
      data-selected={selected || undefined}
      className="fw-group absolute"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div className="fw-label flex items-center gap-1.5 pb-1 text-xs leading-5" style={{ "--w": box.w } as React.CSSProperties}>
        <Icon className={cn("size-3.5 shrink-0", selected ? "text-selection" : "text-muted-foreground")} />
        <span className={cn("min-w-0 truncate font-medium", selected ? "text-selection" : "text-foreground/85")}>
          {item.title ?? item.name}
        </span>
        <span className="fw-label-id min-w-0 shrink-[100] truncate font-mono text-[11px] text-muted-foreground">{box.id}</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {empty ? "empty" : `${frames} ${frames === 1 ? "frame" : "frames"}`}
        </span>
      </div>
      {empty && (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-[22px] font-medium text-foreground/70">Empty folder</p>
          <p className="max-w-80 text-[16px] leading-snug text-muted-foreground">
            Add <code className="font-mono">index.tsx</code> to make it a frame, or subfolders to fill
            the group.
          </p>
        </div>
      )}
    </div>
  )
})
