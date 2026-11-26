import { commentStore, openComment, pinStore, pinTitle, targetTrackId } from "@/board/comment-store"
import type { BoardLayout } from "@/board/layout"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * Numbered pins for the buffered comments, in the camera's world layer: on a
 * commented element's top-right corner (its box comes from the frame's picker,
 * which re-reports it after layout changes and hot updates), or just outside a
 * commented frame's top-right corner. Stale comments get no pin.
 */

interface PinGroup {
  key: string
  x: number
  y: number
  /** Element pins overlap the element's corner; frame pins sit beside the frame. */
  inset: boolean
  pins: { id: string; n: number; title: string }[]
}

export function CommentPins({ layout }: { layout: BoardLayout }) {
  const { comments, focused } = useStore(commentStore)
  const rects = useStore(pinStore)

  const groups = new Map<string, PinGroup>()
  comments.forEach((comment, i) => {
    const target = comment.target
    if (target.stale) return
    const box = layout.byId.get(target.frame)
    if (!box || box.kind !== "frame") return
    let x = box.x + box.w
    let y = box.y
    let inset = false
    if (target.kind === "element") {
      const rect = rects[targetTrackId(comment.id)]
      if (!rect) return
      // Keep the pin on the frame when the element runs past its edge.
      x = box.x + Math.min(rect.x + rect.w, box.w)
      y = box.y + Math.max(rect.y, 0)
      inset = true
    }
    const key = `${target.kind}:${Math.round(x)}:${Math.round(y)}`
    const group = groups.get(key) ?? { key, x, y, inset, pins: [] }
    group.pins.push({ id: comment.id, n: i + 1, title: pinTitle(comment, i + 1) })
    groups.set(key, group)
  })

  return (
    <>
      {[...groups.values()].map((group) => (
        <div
          key={group.key}
          className={cn("fw-pins", group.inset && "fw-pins-inset")}
          style={{ left: group.x, top: group.y }}
        >
          {group.pins.map((pin) => (
            <button
              key={pin.id}
              type="button"
              data-no-pan
              data-pin={pin.n}
              data-comment-pin={pin.id}
              data-focused={focused === pin.id || undefined}
              className="fw-pin"
              title={pin.title}
              aria-label={`Comment ${pin.n}`}
              onClick={() => openComment(pin.id)}
            >
              {pin.n}
            </button>
          ))}
        </div>
      ))}
    </>
  )
}
