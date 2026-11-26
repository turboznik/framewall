import type { Ref } from "../../shared/refs"
import { highlightRef, locateRef } from "@/board/comment-store"
import type { BoardLayout, Rect } from "@/board/layout"
import { selectionStore } from "@/board/board-store"
import { showToast } from "@/lib/toast"

import { cameraStore, fitRect, moveCamera, viewportStore, visibleArea } from "./camera"

/** Canvas commands shared by the canvas, the sidebar and the top bar. */

let activeLayout: BoardLayout | null = null

export function setActiveLayout(layout: BoardLayout): void {
  activeLayout = layout
}

/** Screen height of a counter-scaled label above a frame or group (constant at every zoom). */
const LABEL_PX = 28

/**
 * The part of the canvas nothing floats over, in viewport pixels: the viewport minus the
 * panels marked `data-canvas-cover` (the side panel, or the bottom sheet on phones).
 */
function canvasArea() {
  const viewport = viewportStore.get()
  const el = document.querySelector(".fw-viewport")
  if (!el) return visibleArea(viewport, [])
  const v = el.getBoundingClientRect()
  const covers: Rect[] = []
  for (const cover of document.querySelectorAll("[data-canvas-cover]")) {
    const r = cover.getBoundingClientRect()
    if (r.width && r.height) covers.push({ x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height })
  }
  return visibleArea(viewport, covers)
}

/** Room around what we zoom to: 56px on a desktop canvas, less on a phone. */
function paddingFor(area: { width: number; height: number }): number {
  return Math.round(Math.min(56, Math.max(16, Math.min(area.width, area.height) * 0.065)))
}

export function fitAll(animate = true): void {
  const bounds = activeLayout?.bounds
  if (!bounds || !viewportStore.get().width) return
  const area = canvasArea()
  moveCamera(fitRect(bounds, area, { padding: paddingFor(area), maxZoom: 1 }), animate)
}

/**
 * Zoom to a frame or group: the whole box and its label inside the visible canvas
 * (beside the side panel, above the phone sheet), with padding, never past 100%.
 */
export function focusItem(id: string, animate = true): void {
  const box = activeLayout?.byId.get(id)
  if (!box || !viewportStore.get().width) return
  const area = canvasArea()
  const rect = { x: box.x, y: box.y, w: box.w, h: box.h }
  const target = fitRect(rect, area, { padding: paddingFor(area), maxZoom: 1, top: LABEL_PX })
  moveCamera(target, animate, { x: box.x + box.w / 2, y: box.y + box.h / 2 })
}

/** Select a frame (or group) and zoom to it: the label button, a double-click, the tree, Shift+2. */
export function zoomToItem(id: string): void {
  selectionStore.set(id)
  focusItem(id)
}

/** Shift+2: zoom to the selected frame, or fit the board when nothing is selected. */
export function focusSelection(): void {
  const id = selectionStore.get()
  if (id) zoomToItem(id)
  else fitAll()
}

export function currentZoom(): number {
  return cameraStore.get().z
}

/** Move the canvas to what a reference points at (a chip was clicked). */
export async function revealRef(ref: Ref): Promise<void> {
  const box = activeLayout?.byId.get(ref.frame)
  if (!box || box.kind !== "frame") {
    showToast(`${ref.frame} isn't on the board any more`)
    return
  }
  if (ref.kind === "frame") {
    focusItem(ref.frame)
    return
  }
  const rect = await locateRef(ref)
  if (!rect) {
    focusItem(ref.frame)
    showToast("That element isn't in the frame any more")
    return
  }
  // The element with room around it: at most 100%, and never closer than its whole frame needs.
  const world = { x: box.x + rect.x, y: box.y + rect.y, w: rect.w, h: rect.h }
  const pad = Math.max(world.w, world.h) * 0.75 + 40
  const area = { x: world.x - pad, y: world.y - pad, w: world.w + pad * 2, h: world.h + pad * 2 }
  moveCamera(fitRect(area, canvasArea(), { padding: 48, maxZoom: 1 }), true, {
    x: world.x + world.w / 2,
    y: world.y + world.h / 2,
  })
  // Outline it briefly, unless a chip hover took the highlight since.
  highlightRef(ref)
  setTimeout(() => {
    if (!document.querySelector("[data-chip]:hover")) highlightRef(null)
  }, 1400)
}
