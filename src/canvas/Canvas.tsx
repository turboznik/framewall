import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import type { FrameMessage } from "../../shared/board"
import { frameStatusStore, selectionStore } from "@/board/board-store"
import {
  cancelDraft,
  commentStore,
  copyCurrentReference,
  handleCommentMessage,
  setBoardFrames,
  startComment,
  startComments,
} from "@/board/comment-store"
import type { BoardLayout } from "@/board/layout"
import {
  clearSelection,
  handlePickerMessage,
  markMissingFrames,
  navigateActive,
  pickStore,
  setPickMode,
  setPickZoom,
  startPicking,
  togglePickMode,
} from "@/board/pick-store"
import { useStore } from "@/lib/store"

import { fitAll, focusSelection, setActiveLayout, zoomToItem } from "./actions"
import {
  cameraStore,
  stopCameraAnimation,
  steppedZoom,
  viewportStore,
  zoomAt,
  zoomCenter,
} from "./camera"
import { CommentPins } from "./CommentPins"
import { FrameCard } from "./FrameCard"
import { GroupSection } from "./GroupSection"

const CLICK_SLOP = 4
const DOUBLE_CLICK_MS = 350

/** ctrl+wheel / pinch delta -> zoom factor. Clamped so a mouse wheel notch stays gentle. */
function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-Math.max(-40, Math.min(40, deltaY)) * 0.01)
}

/** Keep DOM order append-only: moving an iframe in the DOM reloads it. */
function stableOrder(prev: string[], ids: string[]): string[] {
  const present = new Set(ids)
  const next = prev.filter((id) => present.has(id))
  const kept = new Set(next)
  for (const id of ids) if (!kept.has(id)) next.push(id)
  return next
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable='true']")
}

interface Gesture {
  startX: number
  startY: number
  cam0: { x: number; y: number }
  moved: boolean
  targetId: string | null
}

export function Canvas({ layout, emptyHint }: { layout: BoardLayout; emptyHint: React.ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const selected = useStore(selectionStore)
  const statuses = useStore(frameStatusStore)
  const picking = useStore(pickStore).mode

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const lastClick = useRef<{ id: string; t: number } | null>(null)

  useEffect(() => setActiveLayout(layout), [layout])

  useEffect(() => {
    startPicking()
    startComments()
  }, [])

  // Selected elements and comments of frames that disappeared can't be found any more.
  useEffect(() => {
    const frames = new Set(layout.boxes.filter((b) => b.kind === "frame").map((b) => b.id))
    markMissingFrames(frames)
    setBoardFrames(frames)
  }, [layout])

  // Drop a selection whose folder disappeared.
  useEffect(() => {
    if (selected && !layout.byId.has(selected)) selectionStore.set(null)
  }, [layout, selected])

  // Camera -> DOM, outside React so panning doesn't re-render the board.
  useLayoutEffect(() => {
    const apply = () => {
      const { x, y, z } = cameraStore.get()
      const world = worldRef.current
      const viewport = viewportRef.current
      if (!world || !viewport) return
      world.style.transform = `translate(${x}px, ${y}px) scale(${z})`
      world.style.setProperty("--z", String(z))
      let grid = 24 * z
      while (grid < 12) grid *= 2
      viewport.style.backgroundSize = `${grid}px ${grid}px`
      viewport.style.backgroundPosition = `${x}px ${y}px`
      setPickZoom(z)
    }
    apply()
    return cameraStore.subscribe(apply)
  }, [])

  // Track the viewport size.
  useLayoutEffect(() => {
    const el = viewportRef.current!
    const update = () => viewportStore.set({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Fit the board once, when there is something to fit.
  const didFit = useRef(false)
  useEffect(() => {
    const tryFit = () => {
      if (didFit.current || !layout.bounds || !viewportStore.get().width) return
      didFit.current = true
      fitAll(false)
    }
    tryFit()
    return viewportStore.subscribe(tryFit)
  }, [layout])

  // Wheel: pan, or zoom with ctrl/cmd (trackpad pinch arrives as ctrl+wheel). Safari pinch: gesture events.
  useEffect(() => {
    const el = viewportRef.current!
    const local = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      return [clientX - r.left, clientY - r.top] as const
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      stopCameraAnimation()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1
      if (event.ctrlKey || event.metaKey) {
        const [sx, sy] = local(event.clientX, event.clientY)
        cameraStore.set((cam) => zoomAt(cam, sx, sy, wheelZoomFactor(event.deltaY * unit)))
      } else {
        let dx = event.deltaX * unit
        let dy = event.deltaY * unit
        if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0]
        cameraStore.set((cam) => ({ ...cam, x: cam.x - dx, y: cam.y - dy }))
      }
    }
    let gestureZoom = 1
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number }
    const onGestureStart = (event: Event) => {
      event.preventDefault()
      gestureZoom = cameraStore.get().z
    }
    const onGestureChange = (event: Event) => {
      event.preventDefault()
      const g = event as GestureEvent
      const [sx, sy] = local(g.clientX, g.clientY)
      cameraStore.set((cam) => zoomAt(cam, sx, sy, (gestureZoom * g.scale) / cam.z))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("gesturestart", onGestureStart)
    el.addEventListener("gesturechange", onGestureChange)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("gesturestart", onGestureStart)
      el.removeEventListener("gesturechange", onGestureChange)
    }
  }, [])

  // Messages from frames: status, forwarded wheel/pinch and keys, element picking.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return
      const msg = event.data as FrameMessage
      if (!msg || msg.source !== "framewall") return
      if (handlePickerMessage(msg) || handleCommentMessage(msg)) return
      if (msg.type === "status") {
        frameStatusStore.set((prev) => {
          const old = prev[msg.id]
          if (old && old.status === msg.status && old.message === msg.message) return prev
          return { ...prev, [msg.id]: { status: msg.status, message: msg.message } }
        })
      } else if (msg.type === "key") {
        // A key pressed inside a frame: handle it like one pressed on the canvas.
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: msg.key,
            code: msg.code ?? "",
            shiftKey: !!msg.shiftKey,
            altKey: !!msg.altKey,
            ctrlKey: !!msg.ctrlKey,
            metaKey: !!msg.metaKey,
            cancelable: true,
          })
        )
      } else if (msg.type === "pan") {
        // Dragging inside a frame in select mode.
        stopCameraAnimation()
        cameraStore.set((cam) => ({ ...cam, x: cam.x + msg.dx, y: cam.y + msg.dy }))
      } else if (msg.type === "wheel") {
        const iframe = Array.from(document.querySelectorAll("iframe")).find(
          (f) => f.contentWindow === event.source
        )
        const el = viewportRef.current
        if (!iframe || !el) return
        stopCameraAnimation()
        if (msg.zoom) {
          const r = iframe.getBoundingClientRect()
          const scale = r.width / Math.max(1, iframe.offsetWidth)
          const v = el.getBoundingClientRect()
          const sx = r.left + msg.clientX * scale - v.left
          const sy = r.top + msg.clientY * scale - v.top
          cameraStore.set((cam) => zoomAt(cam, sx, sy, wheelZoomFactor(msg.deltaY)))
        } else {
          cameraStore.set((cam) => ({ ...cam, x: cam.x - msg.deltaX, y: cam.y - msg.deltaY }))
        }
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      const z = cameraStore.get().z
      const plain = !mod && !event.altKey
      const pickState = pickStore.get()
      const key = event.key.toLowerCase()
      if (mod && event.shiftKey && !event.altKey && key === "c") {
        // Copy the selected elements' references (else the selected frame's).
        event.preventDefault()
        copyCurrentReference()
      } else if (plain && !event.shiftKey && key === "c") {
        event.preventDefault()
        startComment()
      } else if (event.key === "Escape") {
        // An empty composer closes first. In select mode: clear the picked elements, then leave
        // select mode. Else deselect the frame.
        const draft = commentStore.get().draft
        if (draft && !draft.body.length) cancelDraft()
        else if (pickState.mode && pickState.items.length) clearSelection()
        else if (pickState.mode) setPickMode(false)
        else selectionStore.set(null)
      } else if (plain && !event.shiftKey && key === "s") {
        event.preventDefault()
        togglePickMode()
      } else if (plain && event.key.startsWith("Arrow") && pickState.active) {
        const dir = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "prev", ArrowRight: "next" } as const)[
          event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
        ]
        if (dir && navigateActive(dir)) event.preventDefault()
      } else if (event.key === "=" || event.key === "+") {
        event.preventDefault()
        zoomCenter(steppedZoom(z, 1))
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault()
        zoomCenter(steppedZoom(z, -1))
      } else if ((mod && event.key === "0") || (event.shiftKey && event.code === "Digit0")) {
        event.preventDefault()
        zoomCenter(1)
      } else if (event.shiftKey && event.code === "Digit1") {
        fitAll()
      } else if (event.shiftKey && event.code === "Digit2") {
        // Zoom to the selected frame (fit the board when nothing is selected).
        event.preventDefault()
        focusSelection()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const onClickItem = (id: string | null) => {
    if (!id) {
      selectionStore.set(null)
      lastClick.current = null
      return
    }
    // A double click (or double tap) on a frame or its label zooms to it.
    const now = performance.now()
    const last = lastClick.current
    if (last && last.id === id && now - last.t < DOUBLE_CLICK_MS) {
      zoomToItem(id)
      lastClick.current = null
    } else {
      lastClick.current = { id, t: now }
      selectionStore.set(id)
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target as Element
    if (target.closest("[data-no-pan]")) return
    event.preventDefault()
    stopCameraAnimation()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      const cam = cameraStore.get()
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        cam0: { x: cam.x, y: cam.y },
        moved: event.button === 1,
        targetId: target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId ?? null,
      }
    } else if (gesture.current) {
      gesture.current.moved = true
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const map = pointers.current
    const prev = map.get(event.pointerId)
    const g = gesture.current
    if (!prev || !g) return
    if (map.size === 1) {
      const dx = event.clientX - g.startX
      const dy = event.clientY - g.startY
      if (!g.moved && Math.hypot(dx, dy) > CLICK_SLOP) g.moved = true
      if (g.moved) cameraStore.set((cam) => ({ ...cam, x: g.cam0.x + dx, y: g.cam0.y + dy }))
    } else if (map.size === 2) {
      // Pinch: zoom by the change in finger distance around the midpoint, pan by its movement.
      const other = [...map.entries()].find(([id]) => id !== event.pointerId)![1]
      const v = viewportRef.current!.getBoundingClientRect()
      const mid0 = { x: (prev.x + other.x) / 2 - v.left, y: (prev.y + other.y) / 2 - v.top }
      const mid1 = { x: (event.clientX + other.x) / 2 - v.left, y: (event.clientY + other.y) / 2 - v.top }
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y)
      const d1 = Math.hypot(event.clientX - other.x, event.clientY - other.y)
      cameraStore.set((cam) => {
        const zoomed = d0 > 0 ? zoomAt(cam, mid0.x, mid0.y, d1 / d0) : cam
        return { ...zoomed, x: zoomed.x + mid1.x - mid0.x, y: zoomed.y + mid1.y - mid0.y }
      })
    }
    map.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const map = pointers.current
    if (!map.delete(event.pointerId)) return
    const g = gesture.current
    if (map.size === 0) {
      if (g && !g.moved && event.type === "pointerup") onClickItem(g.targetId)
      gesture.current = null
    } else if (map.size === 1 && g) {
      // One finger lifted after a pinch: continue as a pan from here.
      const [rest] = map.values()
      const cam = cameraStore.get()
      gesture.current = { ...g, startX: rest.x, startY: rest.y, cam0: { x: cam.x, y: cam.y } }
    }
  }

  // Render frames in first-seen order so existing iframes never move in the DOM.
  const frameBoxes = layout.boxes.filter((b) => b.kind === "frame")
  const frameIds = frameBoxes.map((b) => b.id)
  const [order, setOrder] = useState<string[]>(frameIds)
  const nextOrder = stableOrder(order, frameIds)
  if (!sameList(nextOrder, order)) setOrder(nextOrder)

  return (
    <div
      ref={viewportRef}
      className="fw-viewport relative h-full w-full touch-none overflow-hidden select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onAuxClick={(e) => e.preventDefault()}
    >
      <div ref={worldRef} data-world className="absolute top-0 left-0 origin-top-left">
        {layout.boxes
          .filter((b) => b.kind === "group")
          .map((box) => (
            <GroupSection key={box.id} box={box} selected={selected === box.id} />
          ))}
        {nextOrder.map((id) => {
          const box = layout.byId.get(id)!
          return (
            <FrameCard
              key={id}
              box={box}
              selected={selected === id}
              interactive={selected === id || picking}
              status={statuses[id]}
            />
          )
        })}
        <CommentPins layout={layout} />
      </div>
      {!layout.bounds && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          {emptyHint}
        </div>
      )}
    </div>
  )
}
