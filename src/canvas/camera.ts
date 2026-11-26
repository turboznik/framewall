import type { Rect } from "@/board/layout"
import { createStore } from "@/lib/store"

/** screen = world * z + (x, y), in CSS pixels relative to the canvas viewport. */
export interface Camera {
  x: number
  y: number
  z: number
}

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 4
const ZOOM_STEPS = [0.02, 0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export const cameraStore = createStore<Camera>({ x: 0, y: 0, z: 0.25 })
export const viewportStore = createStore({ width: 0, height: 0 })

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/** Zoom by `factor` keeping the world point under (sx, sy) fixed. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const z = clampZoom(cam.z * factor)
  const k = z / cam.z
  return { z, x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k }
}

/** A part of the viewport, in viewport pixels. `x` and `y` default to 0. */
export interface Area {
  x?: number
  y?: number
  width: number
  height: number
}

/** Camera that shows `rect` centered in `area` (the whole viewport, or the part of it left visible). */
export function fitRect(
  rect: Rect,
  area: Area,
  { padding = 48, maxZoom = 1, top = 0 }: { padding?: number; maxZoom?: number; top?: number } = {}
): Camera {
  const { x: ax = 0, y: ay = 0, width, height } = area
  const availW = Math.max(1, width - padding * 2)
  // `top`: screen pixels reserved above the rect (its counter-scaled label).
  const availH = Math.max(1, height - padding * 2 - top)
  const z = clampZoom(Math.min(maxZoom, availW / Math.max(1, rect.w), availH / Math.max(1, rect.h)))
  return {
    z,
    x: ax + (width - rect.w * z) / 2 - rect.x * z,
    y: ay + top + (height - top - rect.h * z) / 2 - rect.y * z,
  }
}

/**
 * The largest part of the viewport that `covers` (panels floating over the canvas, in
 * viewport pixels) leave free: the biggest strip beside, above or below them. Panels
 * that would leave less than a quarter of the canvas (a narrow window) are ignored
 * rather than leaving a sliver.
 */
export function visibleArea(viewport: { width: number; height: number }, covers: Rect[]): Required<Area> {
  let area = { x: 0, y: 0, width: viewport.width, height: viewport.height }
  for (const c of covers) {
    const left = Math.max(area.x, Math.min(area.x + area.width, c.x))
    const right = Math.min(area.x + area.width, Math.max(area.x, c.x + c.w))
    const top = Math.max(area.y, Math.min(area.y + area.height, c.y))
    const bottom = Math.min(area.y + area.height, Math.max(area.y, c.y + c.h))
    if (right <= left || bottom <= top) continue
    const strips = [
      { x: area.x, y: area.y, width: left - area.x, height: area.height },
      { x: right, y: area.y, width: area.x + area.width - right, height: area.height },
      { x: area.x, y: area.y, width: area.width, height: top - area.y },
      { x: area.x, y: bottom, width: area.width, height: area.y + area.height - bottom },
    ]
    const best = strips.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
    if (best.width * best.height >= area.width * area.height * 0.25) area = best
  }
  return area
}

/** Next preset zoom level up or down from `z`. */
export function steppedZoom(z: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((s) => s > z * 1.001) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((s) => s < z * 0.999) ?? MIN_ZOOM
}

let animation = 0

export function stopCameraAnimation(): void {
  cancelAnimationFrame(animation)
  animation = 0
}

/**
 * Move the camera, optionally with an ease-out animation. Zoom changes geometrically and
 * the `anchor` world point (by default, whatever ends up at the viewport center) travels
 * in a straight line on screen, so a zoom onto a frame heads straight for it instead of
 * swinging through the world origin.
 */
export function moveCamera(target: Camera, animate = false, anchor?: { x: number; y: number }): void {
  stopCameraAnimation()
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const from = cameraStore.get()
  if (!animate || reduced || (from.x === target.x && from.y === target.y && from.z === target.z)) {
    cameraStore.set(target)
    return
  }
  const { width, height } = viewportStore.get()
  const a = anchor ?? { x: (width / 2 - target.x) / target.z, y: (height / 2 - target.y) / target.z }
  const s0 = { x: a.x * from.z + from.x, y: a.y * from.z + from.y }
  const s1 = { x: a.x * target.z + target.x, y: a.y * target.z + target.y }
  // A little longer for big zoom changes, so they don't feel like a jump.
  const duration = Math.min(480, 260 + 70 * Math.abs(Math.log2(target.z / from.z)))
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    const e = 1 - Math.pow(1 - t, 3)
    if (t >= 1) {
      cameraStore.set(target)
      animation = 0
      return
    }
    const z = from.z * Math.pow(target.z / from.z, e)
    cameraStore.set({ z, x: s0.x + (s1.x - s0.x) * e - a.x * z, y: s0.y + (s1.y - s0.y) * e - a.y * z })
    animation = requestAnimationFrame(step)
  }
  animation = requestAnimationFrame(step)
}

/** Zoom around the viewport center. */
export function zoomCenter(nextZoom: number, animate = true): void {
  const { width, height } = viewportStore.get()
  const cam = cameraStore.get()
  moveCamera(zoomAt(cam, width / 2, height / 2, clampZoom(nextZoom) / cam.z), animate)
}
