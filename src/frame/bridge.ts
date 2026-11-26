import type { FrameMessage } from "../../shared/board"

type Outgoing = FrameMessage extends infer M ? (M extends FrameMessage ? Omit<M, "source"> : never) : never

const embedded = window.parent !== window

/** Post a message to the canvas page that embeds this frame (no-op when opened alone). */
export function postToCanvas(message: Outgoing): void {
  if (!embedded) return
  window.parent.postMessage({ source: "framewall", ...message }, location.origin)
}

/** Can `start` or one of its ancestors scroll further in the wheel's direction? */
function canScroll(start: EventTarget | null, dx: number, dy: number): boolean {
  let el = start instanceof Element ? start : document.documentElement
  for (; el; el = el.parentElement!) {
    const style = getComputedStyle(el)
    const isRoot = el === document.documentElement || el === document.body
    const scrollY = isRoot || /(auto|scroll|overlay)/.test(style.overflowY)
    const scrollX = isRoot || /(auto|scroll|overlay)/.test(style.overflowX)
    if (dy !== 0 && scrollY && el.scrollHeight > el.clientHeight + 1) {
      if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true
    }
    if (dx !== 0 && scrollX && el.scrollWidth > el.clientWidth + 1) {
      if (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true
    }
    if (el === document.documentElement) break
  }
  return false
}

/**
 * Forward canvas gestures that happen over an (interactive, selected) frame:
 * ctrl/cmd+wheel and trackpad pinch zoom the canvas instead of the page, wheel
 * the frame can't use pans the canvas, and Escape deselects the frame.
 */
export function installBridge(id: string): void {
  if (!embedded) return
  window.addEventListener(
    "wheel",
    (event) => {
      const unit = event.deltaMode === 1 ? 16 : 1
      const zoom = event.ctrlKey || event.metaKey
      if (!zoom && canScroll(event.target, event.deltaX, event.deltaY)) return
      event.preventDefault()
      postToCanvas({
        type: "wheel",
        id,
        zoom,
        deltaX: event.deltaX * unit,
        deltaY: event.deltaY * unit,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    },
    { passive: false }
  )
  window.addEventListener("keydown", (event) => {
    // The picker handles (and forwards) keys itself while select mode is on.
    if (event.key === "Escape" && !event.defaultPrevented) postToCanvas({ type: "key", id, key: "Escape" })
  })
}
