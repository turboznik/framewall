/**
 * Element picker, running inside every embedded frame.
 *
 * In select mode it takes over pointer input: hovering outlines the element
 * under the cursor with a label (component · file:line), a click reports the
 * element to the canvas, a drag pans the canvas. It always draws the outlines of
 * the selections that live in this frame, keeps them glued to their elements as
 * the layout changes, and finds them again after hot updates and reloads.
 *
 * Source locations come from the `data-fw-src` stamps (plugins/stamp.ts), read
 * from React fibers: a DOM node's fiber, then up the `return` chain to the
 * frame's root component, gives the component breadcrumb, the "defined in"
 * location (the element's own JSX) and the "used at" location (the nearest JSX
 * in the frame's own files).
 *
 * It also keeps finding the elements comments point at ("tracks"): it reports
 * their new locations after edits (or that they are gone), their boxes for the
 * comment pins the canvas draws, and outlines one when a reference chip is
 * hovered on the canvas.
 *
 * The canvas owns the selection and the comments; this module only draws and reports.
 */

import {
  STAMP_ATTR,
  formatLoc,
  isFrameOwnFile,
  parseStamp,
  type CanvasMessage,
  type ElementInfo,
  type ElementKey,
  type ElementTarget,
  type FrameRect,
  type FrameSelection,
  type NavDir,
  type SourceLoc,
  type TrackSpec,
} from "../../shared/selection"
import { postToCanvas } from "./bridge"

// ---------------------------------------------------------------------------
// React fibers (internal, but stable across React 17-19)

interface Fiber {
  tag: number
  type: unknown
  memoizedProps: Record<string, unknown> | null
  return: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  alternate: Fiber | null
  stateNode: unknown
}

const FUNCTION = 0
const CLASS = 1
const HOST_ROOT = 3
const HOST = 5
const FORWARD_REF = 11
const SIMPLE_MEMO = 15
const HOST_HOISTABLE = 26
const HOST_SINGLETON = 27

const isHostTag = (tag: number) => tag === HOST || tag === HOST_HOISTABLE || tag === HOST_SINGLETON
// MemoComponent (14) is skipped: its inner fiber carries the same props and the name.
const isComponentTag = (tag: number) => tag === FUNCTION || tag === CLASS || tag === FORWARD_REF || tag === SIMPLE_MEMO

let fiberKey: string | null = null
let propsKey: string | null = null

/** The current host fiber of a DOM element (the cached one may be the stale alternate). */
function hostFiber(el: Element): Fiber | null {
  const rec = el as unknown as Record<string, unknown>
  if (!fiberKey || !(fiberKey in el)) {
    const keys = Object.keys(el)
    const fk = keys.find((k) => k.startsWith("__reactFiber$"))
    if (!fk) return null
    fiberKey = fk
    propsKey = keys.find((k) => k.startsWith("__reactProps$")) ?? null
  }
  const fiber = rec[fiberKey] as Fiber | undefined
  if (!fiber) return null
  const props = propsKey ? rec[propsKey] : undefined
  if (props && fiber.memoizedProps !== props && fiber.alternate?.memoizedProps === props) return fiber.alternate
  return fiber
}

function typeName(type: unknown): string {
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string }
    return fn.displayName || fn.name || "Anonymous"
  }
  if (type && typeof type === "object") {
    const t = type as { displayName?: string; render?: unknown; type?: unknown }
    if (t.displayName) return t.displayName
    if (t.render) return typeName(t.render)
    if (t.type) return typeName(t.type)
  }
  return "Anonymous"
}

/** FrameErrorBoundary (frame-host.tsx) marks where the frame's own tree starts. */
const isBoundary = (f: Fiber) => !!(f.type as { framewallBoundary?: boolean } | null)?.framewallBoundary

interface Level {
  fiber: Fiber
  host: boolean
  stamp: string | null
  name: string
}

/** Host and component fibers from `el` up to the frame root; null outside the frame's tree. */
function levelsOf(el: Element): Level[] | null {
  const host = hostFiber(el)
  if (!host || !isHostTag(host.tag)) return null
  const levels: Level[] = []
  for (let f: Fiber | null = host; f; f = f.return) {
    if (f.tag === HOST_ROOT) return null
    if (isBoundary(f)) return levels.length ? levels : null
    const isHost = isHostTag(f.tag)
    if (isHost || isComponentTag(f.tag)) {
      const stamp = f.memoizedProps?.[STAMP_ATTR]
      levels.push({
        fiber: f,
        host: isHost,
        stamp: typeof stamp === "string" ? stamp : null,
        name: isHost ? String(f.type) : typeName(f.type),
      })
    }
  }
  return null
}

/**
 * Components shown in the breadcrumb: those written as JSX on the board
 * (stamped) plus the frame's root component. Library internals are left out.
 */
const isCrumb = (level: Level, i: number, levels: Level[]) => !level.host && (!!level.stamp || i === levels.length - 1)

// ---------------------------------------------------------------------------
// Describing elements

interface Basic {
  el: Element
  levels: Level[]
  tag: string
  name: string
  crumbs: string[]
  usedAt: SourceLoc | null
  definedIn: SourceLoc | null
  usedAtStamp: string
  srcStamp: string
  exact: string
  loose: string
}

let frameId = ""

function basic(el: Element): Basic | null {
  const levels = levelsOf(el)
  if (!levels) return null
  const tag = el.tagName.toLowerCase()
  // The innermost breadcrumb component that renders this node directly (no host in between).
  let owner: string | null = null
  for (let i = 1; i < levels.length && !levels[i].host; i++) {
    if (isCrumb(levels[i], i, levels)) {
      owner = levels[i].name
      break
    }
  }
  const crumbs = levels.filter(isCrumb).map((l) => l.name).reverse()
  if (!owner) crumbs.push(tag)
  const def = levels.find((l) => l.stamp)
  const used = levels.find((l) => l.stamp && isFrameOwnFile(frameId, parseStamp(l.stamp)?.file ?? "")) ?? def
  const srcStamp = def?.stamp ?? ""
  const usedAtStamp = used?.stamp ?? ""
  const definedIn = parseStamp(srcStamp)
  const usedAt = parseStamp(usedAtStamp)
  const name = owner ?? tag
  return {
    el,
    levels,
    tag,
    name,
    crumbs,
    usedAt,
    definedIn,
    usedAtStamp,
    srcStamp,
    exact: `${srcStamp}|${usedAtStamp}`,
    loose: `${tag}|${name}|${definedIn?.file ?? ""}|${usedAt?.file ?? ""}`,
  }
}

/** Every element in the frame with this tag name, described, in document order. */
function sameTag(tag: string): Basic[] {
  const out: Basic[] = []
  for (const el of Array.from(document.getElementsByTagName(tag))) {
    const b = basic(el)
    if (b) out.push(b)
  }
  return out
}

function describe(el: Element): ElementInfo | null {
  const b = basic(el)
  if (!b) return null
  const all = sameTag(b.tag)
  const exact = all.filter((c) => c.exact === b.exact)
  const loose = all.filter((c) => c.loose === b.loose)
  const index = Math.max(0, exact.findIndex((c) => c.el === el))
  const key: ElementKey = {
    src: b.srcStamp,
    usedAt: b.usedAtStamp,
    index,
    loose: b.loose,
    looseIndex: Math.max(0, loose.findIndex((c) => c.el === el)),
    looseCount: loose.length,
  }
  return {
    frameId,
    name: b.name,
    tag: b.tag,
    crumbs: b.crumbs,
    usedAt: b.usedAt,
    definedIn: b.definedIn,
    nth: index + 1,
    count: Math.max(1, exact.length),
    key,
  }
}

/**
 * Find the element a key points at: the same JSX locations and position, or,
 * when line numbers moved, the same files, tag and component at the same position
 * among an unchanged number of look-alikes.
 */
function resolve(key: ElementKey): Element | null {
  const tag = key.loose.split("|")[0]
  if (!tag) return null
  const all = sameTag(tag)
  const exact = all.filter((c) => c.exact === `${key.src}|${key.usedAt}`)
  if (exact[key.index]) return exact[key.index].el
  const loose = all.filter((c) => c.loose === key.loose)
  if (loose.length === key.looseCount && loose[key.looseIndex]) return loose[key.looseIndex].el
  return null
}

/** `file:line` or `file:line:col` (a reference's `at` / `defined-in`). */
function parseLoc(text: string | undefined): { file: string; line: number; col: number | null } | null {
  if (!text) return null
  const full = parseStamp(text)
  if (full) return full
  const m = /^(.*):(\d+)$/.exec(text)
  return m && m[1] ? { file: m[1], line: Number(m[2]), col: null } : null
}

const locMatches = (loc: SourceLoc | null, want: ReturnType<typeof parseLoc>) =>
  !!loc && !!want && loc.file === want.file && loc.line === want.line && (want.col === null || loc.col === want.col)

/**
 * Find an element from a pasted reference tag: the element whose "used at" is
 * `at` and whose "defined in" is `defined-in` (or `at` when the tag has none),
 * the `instance`-th of them.
 */
function resolveHint(hint: NonNullable<ElementTarget["hint"]>): Element | null {
  const used = parseLoc(hint.at)
  const defined = parseLoc(hint.definedIn ?? hint.at)
  if (!defined) return null
  const matches: Element[] = []
  const scan = (els: Iterable<Element>) => {
    for (const el of els) {
      const b = basic(el)
      if (b && locMatches(b.definedIn, defined) && (!used || locMatches(b.usedAt, used))) matches.push(el)
    }
  }
  // Stamped host elements carry their "defined in" stamp as a DOM attribute: try those first.
  scan(document.querySelectorAll(`[${STAMP_ATTR}]`))
  if (!matches.length) scan(document.body.getElementsByTagName("*"))
  return matches[(hint.instance ?? 1) - 1] ?? null
}

function resolveTarget(target: ElementTarget): Element | null {
  if (target.key) return resolve(target.key)
  return target.hint ? resolveHint(target.hint) : null
}

/** The nearest pickable element at or above `node`. */
function pickable(node: Node | null): Element | null {
  for (let n = node; n && n !== document.body && n !== document.documentElement; n = n.parentNode) {
    if (n instanceof Element && basic(n)) return n
  }
  return null
}

function firstHostDom(fiber: Fiber): Element | null {
  const stack: Fiber[] = [fiber]
  while (stack.length) {
    const f = stack.pop()!
    if (isHostTag(f.tag) && f.stateNode instanceof Element) return f.stateNode
    // Depth first, children in order.
    const kids: Fiber[] = []
    for (let c = f.child; c; c = c.sibling) kids.push(c)
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i])
  }
  return null
}

// ---------------------------------------------------------------------------
// Overlay (shadow DOM, outside the React root, styles of its own)

const BLUE = "37 99 235"
const VIOLET = "124 58 237"
const CSS = `
:host { all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; --s: 1; }
.box { position: absolute; left: 0; top: 0; box-sizing: border-box; display: none; border-radius: 1px; }
.hover { background: rgb(${BLUE} / 0.12); box-shadow: 0 0 0 calc(1px * var(--s)) rgb(${BLUE} / 0.95); }
.sel { box-shadow: 0 0 0 calc(2px * var(--s)) rgb(${BLUE}); }
.sel.active { background: rgb(${BLUE} / 0.07); }
.hl { background: rgb(${VIOLET} / 0.12); box-shadow: 0 0 0 calc(2px * var(--s)) rgb(${VIOLET}), 0 0 0 calc(5px * var(--s)) rgb(${VIOLET} / 0.2); }
.label, .badge {
  position: absolute; left: 0; top: 0; display: none; transform-origin: 0 0; transform: scale(var(--s));
  font: 500 11px/16px "Geist Variable", ui-sans-serif, system-ui, sans-serif; white-space: nowrap;
  -webkit-font-smoothing: antialiased;
}
.label {
  align-items: center; gap: 5px; padding: 2px 6px; border-radius: 4px; overflow: hidden; box-sizing: border-box;
  background: #18181b; color: #fafafa; box-shadow: 0 1px 3px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(255 255 255 / 0.08);
}
.label .name { font-weight: 600; flex: none; }
.label .loc { font-family: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.label .dim { color: #71717a; font-variant-numeric: tabular-nums; flex: none; }
.label.selected { background: rgb(${BLUE}); }
.label.selected .loc { color: rgb(255 255 255 / 0.8); }
.label.selected .dim { color: rgb(255 255 255 / 0.6); }
.badge {
  min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 4px; text-align: center;
  background: rgb(${BLUE}); color: white; font-weight: 600; font-size: 10px; line-height: 16px; font-variant-numeric: tabular-nums;
}
`

interface Sel {
  uid: string
  n: number
  active: boolean
  key: ElementKey
  el: Element | null
  /** Last info reported to the canvas (JSON), null while stale. */
  reported: string | null
  stale: boolean
  pendingSince: number
  nextTry: number
  history: Element[]
  box: HTMLDivElement
  badge: HTMLDivElement
}

/** An element the canvas keeps track of (a comment target or a reference in a comment). */
interface Track {
  id: string
  target: ElementTarget
  pin: boolean
  el: Element | null
  /** Last info reported to the canvas (JSON), null while stale or not yet reported. */
  reported: string | null
  stale: boolean
  pendingSince: number
  nextTry: number
  /** Last pin box sent ("" before the first, "-" for none). */
  rect: string
}

let shadow: ShadowRoot
let overlayHost: HTMLElement
let highlightBox: HTMLDivElement
let hoverBox: HTMLDivElement
let hoverLabel: HTMLDivElement
let activeLabel: HTMLDivElement
let cursorStyle: HTMLStyleElement | null = null

let picking = false
let zoom = 1
let hoverEl: Element | null = null
let sels: Sel[] = []
let tracks: Track[] = []
let highlight: { target: ElementTarget; el: Element | null; nextTry: number } | null = null

function div(className: string): HTMLDivElement {
  const el = document.createElement("div")
  el.className = className
  shadow.appendChild(el)
  return el
}

function mountOverlay() {
  overlayHost = document.createElement("framewall-overlay")
  shadow = overlayHost.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = CSS
  shadow.appendChild(style)
  highlightBox = div("box hl")
  hoverBox = div("box hover")
  hoverLabel = div("label")
  activeLabel = div("label selected")
  // Outside <body>, so the frame's React tree and body styles never touch it.
  document.documentElement.appendChild(overlayHost)
}

function setScale() {
  overlayHost.style.setProperty("--s", String(1 / Math.max(zoom, 0.01)))
}

const shown = (el: HTMLElement, on: boolean) => {
  el.style.display = on ? (el.classList.contains("label") ? "flex" : "block") : "none"
}

function placeBox(box: HTMLElement, r: DOMRect) {
  box.style.transform = `translate(${r.left}px, ${r.top}px)`
  box.style.width = `${r.width}px`
  box.style.height = `${r.height}px`
}

/** Put a counter-scaled tag above the rect (or below, or inside), kept within the viewport. */
function placeTag(tag: HTMLElement, r: DOMRect, gap: number) {
  const s = 1 / Math.max(zoom, 0.01)
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  tag.style.maxWidth = `${Math.max(40, (vw - 8 * s) / s)}px`
  const w = tag.offsetWidth * s
  const h = tag.offsetHeight * s
  let top = r.top - h - gap * s
  if (top < 0) top = r.bottom + gap * s + h <= vh ? r.bottom + gap * s : Math.max(0, r.top) + gap * s
  const left = Math.min(Math.max(0, r.left), Math.max(0, vw - w))
  tag.style.left = `${left}px`
  tag.style.top = `${top}px`
}

function fillLabel(label: HTMLElement, el: Element, r: DOMRect) {
  const b = basic(el)
  if (!b) return
  const loc = b.usedAt ? formatLoc(b.usedAt) : ""
  const text = `${b.name}|${loc}|${Math.round(r.width)}×${Math.round(r.height)}`
  if (label.dataset.text === text) return
  label.dataset.text = text
  label.replaceChildren()
  const span = (cls: string, value: string) => {
    const s = document.createElement("span")
    s.className = cls
    s.textContent = value
    label.appendChild(s)
  }
  span("name", b.name)
  if (loc) span("loc", loc)
  span("dim", `${Math.round(r.width)}×${Math.round(r.height)}`)
}

// ---------------------------------------------------------------------------
// Drawing loop: runs while something is drawn, re-measures every frame

let raf = 0
let lastRefresh = 0

function schedule() {
  if (!raf) raf = requestAnimationFrame(tick)
}

function tick(now: number) {
  raf = 0
  const active = sels.find((s) => s.active && s.el)

  if (picking && hoverEl && hoverEl.isConnected) {
    const r = hoverEl.getBoundingClientRect()
    placeBox(hoverBox, r)
    shown(hoverBox, true)
    const sameAsActive = active?.el === hoverEl
    if (!sameAsActive) {
      fillLabel(hoverLabel, hoverEl, r)
      shown(hoverLabel, true)
      placeTag(hoverLabel, r, 4)
    } else shown(hoverLabel, false)
  } else {
    shown(hoverBox, false)
    shown(hoverLabel, false)
  }

  const changed: { uid: string; info: ElementInfo | null }[] = []
  for (const sel of sels) {
    if (sel.el && !sel.el.isConnected) {
      sel.el = null
      sel.pendingSince = now
      sel.nextTry = 0
    }
    if (!sel.el && now >= sel.nextTry) {
      sel.nextTry = now + 250
      const el = resolve(sel.key)
      if (el) {
        sel.el = el
        sel.history = []
        const update = report(sel)
        if (update) changed.push(update)
      } else if (!sel.stale && now - sel.pendingSince > 1500) {
        sel.stale = true
        sel.reported = null
        changed.push({ uid: sel.uid, info: null })
      }
    }
    if (sel.el) {
      const r = sel.el.getBoundingClientRect()
      placeBox(sel.box, r)
      sel.box.classList.toggle("active", sel.active)
      shown(sel.box, true)
      sel.badge.textContent = String(sel.n)
      shown(sel.badge, true)
      placeTag(sel.badge, r, 3)
    } else {
      shown(sel.box, false)
      shown(sel.badge, false)
    }
  }

  const trackChanges: { id: string; info: ElementInfo | null }[] = []
  const pinRects: { id: string; rect: FrameRect | null }[] = []
  for (const t of tracks) {
    if (t.el && !t.el.isConnected) {
      t.el = null
      t.pendingSince = now
      t.nextTry = 0
    }
    if (!t.el && now >= t.nextTry) {
      // Stale ones are retried less often (a hint lookup can scan the whole frame).
      t.nextTry = now + (t.stale ? 1000 : 250)
      const el = resolveTarget(t.target)
      if (el) {
        t.el = el
        const update = reportTrack(t)
        if (update) trackChanges.push(update)
      } else if (!t.stale && now - t.pendingSince > 1500) {
        t.stale = true
        t.reported = null
        trackChanges.push({ id: t.id, info: null })
      }
    }
    if (t.pin) {
      const rect = t.el ? visibleRect(t.el.getBoundingClientRect()) : null
      const sig = rect ? `${rect.x},${rect.y},${rect.w},${rect.h}` : "-"
      if (sig !== t.rect) {
        t.rect = sig
        pinRects.push({ id: t.id, rect })
      }
    }
  }

  if (highlight) {
    if ((!highlight.el || !highlight.el.isConnected) && now >= highlight.nextTry) {
      highlight.nextTry = now + 250
      highlight.el = resolveTarget(highlight.target)
    }
    if (highlight.el?.isConnected) {
      placeBox(highlightBox, highlight.el.getBoundingClientRect())
      shown(highlightBox, true)
    } else shown(highlightBox, false)
  } else shown(highlightBox, false)

  if (picking && active?.el) {
    const r = active.el.getBoundingClientRect()
    fillLabel(activeLabel, active.el, r)
    shown(activeLabel, true)
    // Next to the badge, which sits at the corner.
    placeTag(activeLabel, r, 3)
    activeLabel.style.left = `${parseFloat(activeLabel.style.left) + (active.badge.offsetWidth + 3) / Math.max(zoom, 0.01)}px`
  } else shown(activeLabel, false)

  // Line numbers or positions can change without a hot update (state, data): re-check now and then.
  if (now - lastRefresh > 1000) {
    lastRefresh = now
    for (const sel of sels) {
      if (!sel.el) continue
      const update = report(sel)
      if (update && !changed.some((c) => c.uid === update.uid)) changed.push(update)
    }
    for (const t of tracks) {
      if (!t.el) continue
      const update = reportTrack(t)
      if (update && !trackChanges.some((c) => c.id === update.id)) trackChanges.push(update)
    }
  }
  if (changed.length) postToCanvas({ type: "resolved", id: frameId, items: changed })
  if (trackChanges.length) postToCanvas({ type: "tracked", id: frameId, items: trackChanges })
  if (pinRects.length) postToCanvas({ type: "pins", id: frameId, rects: pinRects })

  if ((picking && hoverEl) || sels.length || tracks.length || highlight) schedule()
}

const round = (v: number) => Math.round(v * 10) / 10

/** The element's box when it is (partly) inside the frame's viewport and has a size. */
function visibleRect(r: DOMRect): FrameRect | null {
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  if (r.width + r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return null
  return { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) }
}

/** Describe a tracked element; returns an update when it differs from what the canvas has. */
function reportTrack(t: Track): { id: string; info: ElementInfo } | null {
  if (!t.el) return null
  const info = describe(t.el)
  if (!info) return null
  // Follow the element by its key from now on (a pasted tag only had locations).
  t.target = { key: info.key, hint: null }
  const json = JSON.stringify(info)
  if (json === t.reported && !t.stale) return null
  t.reported = json
  t.stale = false
  return { id: t.id, info }
}

/** Describe a selection's element; returns an update when it differs from what the canvas has. */
function report(sel: Sel): { uid: string; info: ElementInfo } | null {
  if (!sel.el) return null
  const info = describe(sel.el)
  if (!info) return null
  sel.key = info.key
  const json = JSON.stringify(info)
  if (json === sel.reported && !sel.stale) return null
  sel.reported = json
  sel.stale = false
  return { uid: sel.uid, info }
}

function refreshAll() {
  const changed = sels.map(report).filter((u) => u !== null)
  if (changed.length) postToCanvas({ type: "resolved", id: frameId, items: changed })
  const tracked = tracks.map(reportTrack).filter((u) => u !== null)
  if (tracked.length) postToCanvas({ type: "tracked", id: frameId, items: tracked })
  schedule()
}

/**
 * The tracked elements, as the canvas wants them. An existing track keeps its
 * own (newer) idea of where its element is; only new ones start from the spec.
 */
function applyTracks(items: TrackSpec[]) {
  const now = performance.now()
  tracks = items.map((spec) => {
    const t = tracks.find((x) => x.id === spec.id)
    if (t) {
      t.pin = spec.pin
      return t
    }
    return {
      id: spec.id,
      target: { key: spec.key, hint: spec.hint },
      pin: spec.pin,
      el: null,
      reported: null,
      stale: false,
      pendingSince: now,
      nextTry: 0,
      rect: "",
    }
  })
  schedule()
}

// ---------------------------------------------------------------------------
// Canvas messages

function applyState(items: FrameSelection[]) {
  const next: Sel[] = []
  for (const item of items) {
    let sel = sels.find((s) => s.uid === item.uid)
    if (!sel) {
      const now = performance.now()
      const el = resolve(item.key)
      sel = {
        uid: item.uid,
        n: item.n,
        active: item.active,
        key: item.key,
        el,
        reported: null,
        stale: false,
        pendingSince: now,
        nextTry: now + 250,
        history: [],
        box: div("box sel"),
        badge: div("badge"),
      }
      // Tell the canvas the current lines right away (they may have moved since the save).
      if (el) {
        const update = report(sel)
        if (update) postToCanvas({ type: "resolved", id: frameId, items: [update] })
      }
    }
    sel.n = item.n
    sel.active = item.active
    next.push(sel)
  }
  for (const old of sels) {
    if (!next.includes(old)) {
      old.box.remove()
      old.badge.remove()
    }
  }
  sels = next
  schedule()
}

function replaceWith(sel: Sel, el: Element, keepHistory = false) {
  const info = describe(el)
  if (!info) return
  if (!keepHistory) sel.history = []
  sel.el = el
  sel.key = info.key
  sel.stale = false
  sel.reported = JSON.stringify(info)
  postToCanvas({ type: "replace", id: frameId, uid: sel.uid, info })
  schedule()
}

function navigate(sel: Sel, dir: NavDir) {
  const el = sel.el
  if (!el) return
  if (dir === "up") {
    const parent = pickable(el.parentNode)
    if (!parent) return
    sel.history.push(el)
    replaceWith(sel, parent, true)
  } else if (dir === "down") {
    const back = sel.history.pop()
    if (back && back.isConnected && el.contains(back)) return replaceWith(sel, back, true)
    sel.history = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (basic(n as Element)) return replaceWith(sel, n as Element)
    }
  } else {
    for (let n = dir === "next" ? el.nextElementSibling : el.previousElementSibling; n; n = dir === "next" ? n.nextElementSibling : n.previousElementSibling) {
      if (basic(n)) return replaceWith(sel, n)
    }
  }
}

function selectCrumb(sel: Sel, index: number) {
  if (!sel.el) return
  const levels = levelsOf(sel.el)
  if (!levels) return
  const crumbLevels = levels.filter(isCrumb).reverse()
  const level = crumbLevels[index]
  if (!level) return // the trailing tag crumb: the element itself
  const target = firstHostDom(level.fiber)
  if (target && target !== sel.el) replaceWith(sel, target)
}

function onCanvasMessage(event: MessageEvent) {
  if (event.source !== window.parent || event.origin !== location.origin) return
  const msg = event.data as CanvasMessage
  if (!msg || msg.source !== "framewall-canvas") return
  if (msg.type === "pick-state") {
    setPicking(msg.pick)
    if (msg.zoom !== zoom) {
      zoom = msg.zoom
      setScale()
    }
    applyState(msg.items)
  } else if (msg.type === "zoom") {
    zoom = msg.zoom
    setScale()
    schedule()
  } else if (msg.type === "navigate") {
    const sel = sels.find((s) => s.uid === msg.uid)
    if (sel) navigate(sel, msg.dir)
  } else if (msg.type === "crumb") {
    const sel = sels.find((s) => s.uid === msg.uid)
    if (sel) selectCrumb(sel, msg.index)
  } else if (msg.type === "tracks") {
    applyTracks(msg.items)
  } else if (msg.type === "highlight") {
    highlight = msg.target ? { target: msg.target, el: null, nextTry: 0 } : null
    schedule()
  } else if (msg.type === "locate") {
    const el = resolveTarget(msg.target)
    const r = el?.getBoundingClientRect()
    const rect = r ? { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) } : null
    postToCanvas({ type: "located", id: frameId, req: msg.req, rect })
  }
}

// ---------------------------------------------------------------------------
// Input in select mode

function setPicking(on: boolean) {
  if (on === picking) return
  picking = on
  if (on) {
    cursorStyle = document.createElement("style")
    cursorStyle.textContent = "*, *::before, *::after { cursor: default !important; user-select: none !important; -webkit-user-select: none !important; }"
    document.head.appendChild(cursorStyle)
  } else {
    cursorStyle?.remove()
    cursorStyle = null
    hoverEl = null
    drag = null
  }
  schedule()
}

const CLICK_SLOP = 4
let drag: { id: number; x0: number; y0: number; x: number; y: number; moved: boolean } | null = null

function setHover(el: Element | null) {
  if (el === hoverEl) return
  hoverEl = el
  schedule()
}

const swallow = (event: Event) => {
  if (!picking) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function onPointerDown(event: PointerEvent) {
  if (!picking) return
  swallow(event)
  if (event.button !== 0) return
  drag = { id: event.pointerId, x0: event.screenX, y0: event.screenY, x: event.screenX, y: event.screenY, moved: false }
  try {
    document.documentElement.setPointerCapture(event.pointerId)
  } catch {
    /* not capturable (synthetic event) */
  }
}

function onPointerMove(event: PointerEvent) {
  if (!picking) return
  swallow(event)
  if (drag && drag.id === event.pointerId) {
    if (!drag.moved && Math.hypot(event.screenX - drag.x0, event.screenY - drag.y0) > CLICK_SLOP) {
      drag.moved = true
      setHover(null)
    }
    if (drag.moved) {
      postToCanvas({ type: "pan", id: frameId, dx: event.screenX - drag.x, dy: event.screenY - drag.y })
    }
    drag.x = event.screenX
    drag.y = event.screenY
    return
  }
  setHover(pickable(document.elementFromPoint(event.clientX, event.clientY)))
}

function onPointerUp(event: PointerEvent) {
  if (!picking) return
  swallow(event)
  const d = drag
  drag = null
  if (!d || d.id !== event.pointerId || d.moved) return
  const el = pickable(document.elementFromPoint(event.clientX, event.clientY))
  setHover(el)
  const info = el && describe(el)
  if (info) postToCanvas({ type: "pick", id: frameId, info, shift: event.shiftKey })
}

function onKeyDown(event: KeyboardEvent) {
  if (!picking) return
  const t = event.target
  if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable='true']")) return
  event.stopPropagation()
  event.stopImmediatePropagation()
  if (/^(Arrow|Escape$| $|Tab$)/.test(event.key)) event.preventDefault()
  postToCanvas({
    type: "key",
    id: frameId,
    key: event.key,
    code: event.code,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  })
}

const BLOCKED = [
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
  "pointerover",
  "pointerout",
  "touchstart",
  "touchend",
  "dragstart",
  "selectstart",
]

/** Install the picker in an embedded frame (no-op when the frame is opened on its own). */
export function installPicker(id: string): void {
  if (window.parent === window) return
  frameId = id
  mountOverlay()
  window.addEventListener("message", onCanvasMessage)
  window.addEventListener("pointerdown", onPointerDown, { capture: true })
  window.addEventListener("pointermove", onPointerMove, { capture: true })
  window.addEventListener("pointerup", onPointerUp, { capture: true })
  window.addEventListener("pointercancel", () => (drag = null), { capture: true })
  window.addEventListener("keydown", onKeyDown, { capture: true })
  for (const type of BLOCKED) window.addEventListener(type, swallow, { capture: true, passive: false })
  document.documentElement.addEventListener("pointerleave", () => setHover(null))

  // After a hot update React re-renders shortly after; re-read the stamps then.
  if (import.meta.hot) {
    import.meta.hot.on("vite:afterUpdate", () => {
      setTimeout(refreshAll, 120)
      setTimeout(refreshAll, 600)
    })
  }
  postToCanvas({ type: "picker", id })
}
