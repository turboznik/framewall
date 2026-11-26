import { memo } from "react"
import { CopyIcon, ExternalLinkIcon, FocusIcon, MessageSquarePlusIcon, TriangleAlertIcon } from "lucide-react"

import { frameUrl } from "../../shared/board"
import { formatRef } from "../../shared/refs"
import { selectionStore, type FrameStatus } from "@/board/board-store"
import { startComment } from "@/board/comment-store"
import type { LayoutBox } from "@/board/layout"
import { copyText } from "@/lib/toast"
import { cn } from "@/lib/utils"

import { zoomToItem } from "./actions"

function LabelButton({
  label,
  onClick,
  href,
  extra,
  children,
}: {
  label: string
  onClick?: () => void
  href?: string
  /** Hidden on narrow labels (low zoom), where only Zoom to frame stays. */
  extra?: boolean
  children: React.ReactNode
}) {
  const className = cn(
    "inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
    extra && "fw-label-extra"
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className={className}>
      {children}
    </a>
  ) : (
    <button type="button" aria-label={label} title={label} className={className} onClick={onClick}>
      {children}
    </button>
  )
}

export const FrameCard = memo(function FrameCard({
  box,
  selected,
  interactive,
  status,
}: {
  box: LayoutBox
  selected: boolean
  /** Pointer input goes to the frame (selected frame, or select mode for every frame). */
  interactive: boolean
  status?: FrameStatus
}) {
  const { item } = box
  const hasError = status?.status === "error"
  return (
    <div
      data-item-id={box.id}
      data-selected={selected || undefined}
      data-error={hasError || undefined}
      className="fw-frame group/frame absolute"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div className="fw-label flex items-center gap-1.5 pb-1 text-xs leading-5" style={{ "--w": box.w } as React.CSSProperties}>
        <span className={cn("min-w-0 truncate font-medium", selected ? "text-selection" : "text-foreground/85")}>
          {item.title ?? item.name}
        </span>
        <span className="fw-label-id min-w-0 shrink-[100] truncate font-mono text-[11px] text-muted-foreground">{box.id}</span>
        {hasError && (
          <span
            className="shrink-0 rounded-sm bg-destructive/12 px-1 text-[10px] leading-4 font-medium text-destructive"
            title={status?.message}
          >
            Error
          </span>
        )}
        {item.configError && (
          <TriangleAlertIcon className="size-3.5 shrink-0 text-amber-500" aria-label={item.configError}>
            <title>{item.configError}</title>
          </TriangleAlertIcon>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <span className="fw-label-size pr-1 text-[11px] text-muted-foreground tabular-nums">
            {item.width}×{item.height}
          </span>
          <span
            data-no-pan
            className={cn(
              "items-center gap-0.5",
              // Hidden (not just transparent) so narrow labels keep the room for the title.
              selected ? "flex" : "hidden group-hover/frame:flex"
            )}
          >
            <LabelButton label="Zoom to frame (⇧2)" onClick={() => zoomToItem(box.id)}>
              <FocusIcon className="size-3" />
            </LabelButton>
            <LabelButton
              extra
              label="Comment on this frame (C)"
              onClick={() => {
                selectionStore.set(box.id)
                startComment({ kind: "frame", frame: box.id })
              }}
            >
              <MessageSquarePlusIcon className="size-3" />
            </LabelButton>
            <LabelButton extra label="Copy reference" onClick={() => void copyText(formatRef({ kind: "frame", frame: box.id }))}>
              <CopyIcon className="size-3" />
            </LabelButton>
            <LabelButton extra label="Open frame in a new tab" href={frameUrl(box.id)}>
              <ExternalLinkIcon className="size-3" />
            </LabelButton>
          </span>
        </span>
      </div>
      <iframe
        src={frameUrl(box.id)}
        data-frame-id={box.id}
        title={item.title ?? box.id}
        className="block size-full border-0 bg-white"
        style={{ pointerEvents: interactive ? "auto" : "none" }}
      />
    </div>
  )
})
