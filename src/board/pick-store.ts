/**
 * Element selection on the canvas side.
 *
 * The canvas owns the selection (which elements, their order, the active one); each frame's picker (src/frame/picker.ts) finds and draws the ones that
 * live in it and reports picks, re-resolved locations and stale elements back.
 * The selection is saved through the dev server to
 * `BOARD_DIR/.framewall/selection.json`, where agents read it.
 */

import type { FrameMessage } from "../../shared/board"
import {
  SELECTION_ENDPOINT,
  formatStamp,
  type CanvasMessage,
  type ElementInfo,
  type FrameSelection,
  type NavDir,
  type SelectionFile,
  type SelectionItem,
} from "../../shared/selection"
import { createStore } from "@/lib/store"

export interface PickState {
  /** Select mode: pointer input inside frames picks elements. */
  mode: boolean
  items: SelectionItem[]
  /** uid of the item that ↑/↓ and the panel act on. */
  active: string | null
  /** The saved selection has been read (don't save before that). */
  loaded: boolean
}

const MODE_KEY = "framewall:select-mode"

/** Select mode survives a reload of the tab (a convenience; failures are fine). */
function savedMode(): boolean {
  try {
    return sessionStorage.getItem(MODE_KEY) === "1"
  } catch {
    return false
  }
}

export const pickStore = createStore<PickState>({ mode: savedMode(), items: [], active: null, loaded: false })

const update = (fn: (s: PickState) => Partial<PickState>) => pickStore.set((s) => ({ ...s, ...fn(s) }))

const uid = () => Math.random().toString(36).slice(2, 10)

const sameElement = (a: ElementInfo, b: ElementInfo) =>
  a.frameId === b.frameId && a.key.src === b.key.src && a.key.usedAt === b.key.usedAt && a.key.index === b.key.index

const usedAtStamp = (info: ElementInfo) => (info.usedAt ? formatStamp(info.usedAt) : "")

/** New element info for an existing item: drop a snippet that no longer matches. */
function withInfo(item: SelectionItem, info: ElementInfo): SelectionItem {
  const snippet = usedAtStamp(info) === usedAtStamp(item) ? item.snippet : null
  return { ...info, uid: item.uid, snippet, stale: false }
}

// ---------------------------------------------------------------------------
// Actions

export function setPickMode(mode: boolean): void {
  update(() => ({ mode }))
}

export function togglePickMode(): void {
  update((s) => ({ mode: !s.mode }))
}

/** A click on an element: select only it, or with shift add it / take it out. */
export function pick(info: ElementInfo, shift: boolean): void {
  update((s) => {
    const existing = s.items.find((item) => sameElement(item, info))
    if (shift) {
      if (existing) {
        const items = s.items.filter((item) => item !== existing)
        return { items, active: s.active === existing.uid ? (items.at(-1)?.uid ?? null) : s.active }
      }
      const item: SelectionItem = { ...info, uid: uid(), snippet: null }
      return { items: [...s.items, item], active: item.uid }
    }
    const item: SelectionItem = existing ? withInfo(existing, info) : { ...info, uid: uid(), snippet: null }
    return { items: [item], active: item.uid }
  })
}

export function removeItem(id: string): void {
  update((s) => {
    const index = s.items.findIndex((item) => item.uid === id)
    if (index < 0) return {}
    const items = s.items.filter((item) => item.uid !== id)
    const active = s.active === id ? (items[Math.min(index, items.length - 1)]?.uid ?? null) : s.active
    return { items, active }
  })
}

export function clearSelection(): void {
  update(() => ({ items: [], active: null }))
}

export function setActive(id: string): void {
  update(() => ({ active: id }))
}

/** Mark the items of frames that are no longer on the board as stale. */
export function markMissingFrames(frameIds: Set<string>): void {
  const s = pickStore.get()
  if (!s.items.some((item) => !item.stale && !frameIds.has(item.frameId))) return
  update((s) => ({ items: s.items.map((item) => (frameIds.has(item.frameId) ? item : { ...item, stale: true })) }))
}

// ---------------------------------------------------------------------------
// Talking to frames

export function iframeFor(frameId: string): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(`iframe[data-frame-id="${CSS.escape(frameId)}"]`)
}

export type Outgoing = CanvasMessage extends infer M ? (M extends CanvasMessage ? Omit<M, "source"> : never) : never

export function post(frameId: string, message: Outgoing): void {
  iframeFor(frameId)?.contentWindow?.postMessage({ source: "framewall-canvas", ...message }, location.origin)
}

/** ↑/↓ (parent/child) and ←/→ (siblings) for the active item. */
export function navigateActive(dir: NavDir): boolean {
  const s = pickStore.get()
  const item = s.items.find((i) => i.uid === s.active)
  if (!item || item.stale) return false
  post(item.frameId, { type: "navigate", uid: item.uid, dir })
  return true
}

/** Select the element rendered by the item's `index`-th breadcrumb component. */
export function selectCrumb(id: string, index: number): void {
  const item = pickStore.get().items.find((i) => i.uid === id)
  if (!item) return
  setActive(id)
  post(item.frameId, { type: "crumb", uid: id, index })
}

let zoom = 1
/** What each frame was last sent, so unchanged frames aren't messaged. */
const sentState = new Map<string, string>()

function frameState(s: PickState, frameId: string): FrameSelection[] {
  const out: FrameSelection[] = []
  s.items.forEach((item, i) => {
    if (item.frameId === frameId) out.push({ uid: item.uid, n: i + 1, active: item.uid === s.active, key: item.key })
  })
  return out
}

function syncFrame(frameId: string, force = false): void {
  const s = pickStore.get()
  const items = frameState(s, frameId)
  const signature = JSON.stringify([s.mode, items])
  if (!force && sentState.get(frameId) === signature) return
  sentState.set(frameId, signature)
  post(frameId, { type: "pick-state", pick: s.mode, zoom, items })
}

function syncAll(): void {
  for (const iframe of document.querySelectorAll<HTMLIFrameElement>("iframe[data-frame-id]")) {
    syncFrame(iframe.dataset.frameId!)
  }
}

let zoomFrame = 0
/** The overlay counter-scales its outlines and labels by the canvas zoom. */
export function setPickZoom(z: number): void {
  if (z === zoom) return
  zoom = z
  if (zoomFrame) return
  zoomFrame = requestAnimationFrame(() => {
    zoomFrame = 0
    const s = pickStore.get()
    const withItems = new Set(s.items.map((item) => item.frameId))
    for (const iframe of document.querySelectorAll<HTMLIFrameElement>("iframe[data-frame-id]")) {
      const id = iframe.dataset.frameId!
      if (s.mode || withItems.has(id)) post(id, { type: "zoom", zoom })
    }
  })
}

/**
 * Handle a picker message from a frame. Returns true when it was one.
 * (`pan` and `key` are left to the canvas.)
 */
export function handlePickerMessage(msg: FrameMessage): boolean {
  switch (msg.type) {
    case "picker":
      // A frame (re)loaded: send it its state. (The comment store sends its tracks too.)
      syncFrame(msg.id, true)
      return false
    case "pick":
      pick(msg.info, msg.shift)
      return true
    case "replace":
      update((s) => ({
        items: s.items.map((item) => (item.uid === msg.uid ? withInfo(item, msg.info) : item)),
        active: msg.uid,
      }))
      return true
    case "resolved": {
      const byUid = new Map(msg.items.map((r) => [r.uid, r.info]))
      update((s) => ({
        items: s.items.map((item) => {
          if (!byUid.has(item.uid)) return item
          const info = byUid.get(item.uid)
          if (!info) return item.stale ? item : { ...item, stale: true }
          return withInfo(item, info)
        }),
      }))
      return true
    }
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Persistence

/** What gets saved, minus the server-filled snippets (so their arrival doesn't trigger a save). */
const saveSignature = (items: SelectionItem[]) => JSON.stringify(items, (key, value: unknown) => (key === "snippet" ? undefined : value))

let lastSaved = ""
let saveTimer: ReturnType<typeof setTimeout> | undefined

async function save(): Promise<void> {
  const { items } = pickStore.get()
  const signature = saveSignature(items)
  if (signature === lastSaved) return
  lastSaved = signature
  try {
    const res = await fetch(SELECTION_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const saved = (await res.json()) as SelectionFile
    // Take the snippets the server read from the source.
    const snippets = new Map(saved.items.map((item) => [item.uid, item]))
    update((s) => ({
      items: s.items.map((item) => {
        const from = snippets.get(item.uid)
        if (!from || from.snippet === item.snippet || usedAtStamp(from) !== usedAtStamp(item)) return item
        return { ...item, snippet: from.snippet }
      }),
    }))
  } catch (err) {
    lastSaved = ""
    console.warn("[framewall] couldn't save the selection:", err)
  }
}

async function load(): Promise<void> {
  try {
    const res = await fetch(SELECTION_ENDPOINT)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as SelectionFile
    const items = Array.isArray(data.items) ? data.items : []
    lastSaved = saveSignature(items)
    update((s) => ({
      // Anything picked before the file arrived wins.
      items: s.items.length ? s.items : items,
      active: s.items.length ? s.active : (items.at(-1)?.uid ?? null),
      loaded: true,
    }))
  } catch (err) {
    console.warn("[framewall] couldn't load the selection:", err)
    update(() => ({ loaded: true }))
  }
}

let started = false
/** Load the saved selection, then keep frames in sync and save changes. */
export function startPicking(): void {
  if (started) return
  started = true
  void load()
  let mode = pickStore.get().mode
  pickStore.subscribe(() => {
    syncAll()
    const s = pickStore.get()
    if (s.mode !== mode) {
      mode = s.mode
      try {
        sessionStorage.setItem(MODE_KEY, mode ? "1" : "0")
      } catch {
        /* storage unavailable */
      }
    }
    if (!s.loaded) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(), 250)
  })
}
