import { formatRef, refName, type Ref } from "../../shared/refs"
import { highlightRef } from "@/board/comment-store"
import { revealRef } from "@/canvas/actions"
import { cn } from "@/lib/utils"

/**
 * A reference shown inline: `Button · checkout/compact` or `checkout/mobile`.
 * Hovering outlines the target on the canvas, clicking moves the canvas to it.
 * The composer builds the same chip as plain DOM (see `chipNode`).
 */

const CHIP =
  "inline-flex max-w-full cursor-pointer items-baseline gap-1 rounded-[4px] px-1 align-baseline text-[11px] leading-4 font-medium whitespace-nowrap transition-colors select-none"
const LIVE = "bg-comment/12 text-comment-ink hover:bg-comment/20"
const STALE = "bg-muted text-muted-foreground line-through decoration-muted-foreground/60 hover:bg-muted/80"

export function chipClass(stale?: boolean): string {
  return cn(CHIP, stale ? STALE : LIVE)
}

function chipTitle(ref: Ref): string {
  const what = ref.stale ? (ref.kind === "frame" ? "Frame not on the board" : "Element not found") : "Click to show it on the canvas"
  return `${what}\n${formatRef(ref)}`
}

function ChipLabel({ target }: { target: Ref }) {
  if (target.kind === "frame") return <span className="truncate font-mono text-[10.5px]">{target.frame}</span>
  return (
    <>
      <span className="shrink-0">{refName(target)}</span>
      <span className="truncate font-normal opacity-70">· {target.frame}</span>
    </>
  )
}

export function RefChip({ target, className }: { target: Ref; className?: string }) {
  return (
    <button
      type="button"
      data-chip
      className={cn(chipClass(target.stale), "min-w-0 focus-visible:outline-2 focus-visible:outline-ring", className)}
      title={chipTitle(target)}
      onMouseEnter={() => highlightRef(target)}
      onMouseLeave={() => highlightRef(null)}
      onFocus={() => highlightRef(target)}
      onBlur={() => highlightRef(null)}
      onClick={() => void revealRef(target)}
    >
      <ChipLabel target={target} />
    </button>
  )
}

/** The chip as a non-editable node inside the composer. */
export function chipNode(ref: Ref, id: string): HTMLSpanElement {
  const chip = document.createElement("span")
  chip.contentEditable = "false"
  chip.dataset.chip = ""
  chip.dataset.ref = JSON.stringify(ref)
  chip.dataset.refId = id
  chip.className = cn(chipClass(ref.stale), "mx-px")
  chip.title = chipTitle(ref)
  if (ref.kind === "frame") {
    const id = document.createElement("span")
    id.className = "font-mono text-[10.5px]"
    id.textContent = ref.frame
    chip.append(id)
  } else {
    const name = document.createElement("span")
    name.textContent = refName(ref)
    const frame = document.createElement("span")
    frame.className = "font-normal opacity-70"
    frame.textContent = `· ${ref.frame}`
    chip.append(name, frame)
  }
  return chip
}
