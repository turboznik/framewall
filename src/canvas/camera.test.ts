import { describe, expect, it } from "vitest"

import { fitRect, visibleArea } from "./camera"

/** Where `rect` lands on screen under a camera. */
function onScreen(
  rect: { x: number; y: number; w: number; h: number },
  cam: { x: number; y: number; z: number }
) {
  return {
    left: rect.x * cam.z + cam.x,
    top: rect.y * cam.z + cam.y,
    right: (rect.x + rect.w) * cam.z + cam.x,
    bottom: (rect.y + rect.h) * cam.z + cam.y,
  }
}

describe("fitRect", () => {
  it("never zooms past maxZoom", () => {
    const cam = fitRect(
      { x: 100, y: 100, w: 200, h: 100 },
      { width: 1000, height: 800 },
      { padding: 50, maxZoom: 1 }
    )
    expect(cam.z).toBe(1)
    expect(onScreen({ x: 100, y: 100, w: 200, h: 100 }, cam)).toEqual({
      left: 400,
      top: 350,
      right: 600,
      bottom: 450,
    })
  })

  it("fits a big rect inside an offset area, padding and the reserved top included", () => {
    const rect = { x: 2000, y: 3000, w: 1280, h: 800 }
    const area = { x: 0, y: 0, width: 800, height: 900 }
    const cam = fitRect(rect, area, { padding: 40, maxZoom: 1, top: 28 })
    const s = onScreen(rect, cam)
    expect(cam.z).toBeCloseTo(720 / 1280)
    expect(s.left).toBeCloseTo(40)
    expect(s.right).toBeCloseTo(760)
    expect(s.top).toBeGreaterThanOrEqual(40 + 28 - 1e-9)
    expect(s.bottom).toBeLessThanOrEqual(860 + 1e-9)
  })

  it("centers in the area, not the viewport", () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 }
    const cam = fitRect(
      rect,
      { x: 0, y: 0, width: 600, height: 400 },
      { padding: 0 }
    )
    const s = onScreen(rect, cam)
    expect((s.left + s.right) / 2).toBe(300)
    expect((s.top + s.bottom) / 2).toBe(200)
  })
})

describe("visibleArea", () => {
  const viewport = { width: 1200, height: 800 }

  it("is the whole viewport without covers", () => {
    expect(visibleArea(viewport, [])).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    })
  })

  it("leaves the strip beside a side panel", () => {
    expect(visibleArea(viewport, [{ x: 812, y: 8, w: 380, h: 784 }])).toEqual({
      x: 0,
      y: 0,
      width: 812,
      height: 800,
    })
  })

  it("leaves the strip above a bottom sheet", () => {
    const phone = { width: 390, height: 760 }
    expect(visibleArea(phone, [{ x: 8, y: 372, w: 374, h: 380 }])).toEqual({
      x: 0,
      y: 0,
      width: 390,
      height: 372,
    })
  })

  it("prefers the larger strip below a collapsed panel", () => {
    expect(visibleArea(viewport, [{ x: 812, y: 8, w: 380, h: 38 }])).toEqual({
      x: 0,
      y: 46,
      width: 1200,
      height: 754,
    })
  })

  it("ignores covers outside the viewport, and covers that would leave a sliver", () => {
    expect(visibleArea(viewport, [{ x: 1300, y: 0, w: 200, h: 800 }])).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    })
    expect(visibleArea(viewport, [{ x: 100, y: 0, w: 1100, h: 800 }])).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    })
  })
})
