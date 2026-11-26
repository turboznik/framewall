/**
 * The comment buffer on the canvas side.
 *
 * Comments point at a frame or an element (a reference, see shared/refs.ts) and
 * may mention more references inline. The canvas keeps them in order, saves them
 * through the dev server to `BOARD_DIR/.framewall/comments.json` (where
 * `framewall comments` reads them) and asks each frame's picker to keep finding
 * the elements they point at ("tracks"): the picker reports where an element
 * went after an edit, or that it is gone (stale), and the boxes for the pins.
 *
 * Comments are never dropped by the canvas: a target that can't be found is
 * only marked stale.
 */

import config from "virtual:framewall/config"

import type { FrameMessage } from "../../shared/board"
import {
  COMMENTS_ENDPOINT,
  COMMENTS_EVENT,
  cleanComments,
  formatComments,
  isBodyEmpty,
  normalizeBody,
  plainBody,
  type BodySegment,
  type Comment,
  type CommentsEvent,
  type CommentsFile,
} from "../../shared/comments"
import { formatRef, formatSelection, refFromInfo, type ElementRef, type Ref } from "../../shared/refs"
import type { ElementTarget, FrameRect, TrackSpec } from "../../shared/selection"
import { selectionStore } from "@/board/board-store"
import { iframeFor, pickStore, post } from "@/board/pick-store"
import { createStore } from "@/lib/store"
import { copyText, showToast } from "@/lib/toast"

export type PanelTab = "selection" | "comments"

export interface Draft {
  /** The comment being edited, or null for a new one. */
  editing: string | null
  target: Ref
  body: BodySegment[]
}

export interface CommentState {
  comments: Comment[]
  /** The saved buffer has been read (don't save before that). */
  loaded: boolean
  /** The open composer (one at a time). */
  draft: Draft | null
  /** Comment highlighted in the list (its pin was clicked, or it was just added). */
  focused: string | null
  /** Which tab the side panel shows. */
  tab: PanelTab
  /** The comments panel was opened (shown even without a selection). */
  open: boolean
}

export const commentStore = createStore<CommentState>({
  comments: [],
  loaded: false,
  draft: null,
  focused: null,
  tab: "selection",
  open: false,
})

/** Pin boxes reported by the frames, by track id (frame CSS px, null: not visible). */
export const pinStore = createStore<Record<string, FrameRect | null>>({})

const update = (fn: (s: CommentState) => Partial<CommentState>) => commentStore.set((s) => ({ ...s, ...fn(s) }))

export const newId = () => Math.random().toString(36).slice(2, 10)

/** Track ids: a comment's target, and each reference mentioned in a body. */
export const targetTrackId = (commentId: string) => `c:${commentId}`
const refTrackId = (segmentId: string) => `r:${segmentId}`

// ---------------------------------------------------------------------------
// Panel

export function showPanel(tab: PanelTab): void {
  update(() => (tab === "comments" ? { tab, open: true } : { tab }))
}

export function closeComments(): void {
  update(() => ({ tab: "selection", open: false }))
}

export function toggleComments(): void {
  const s = commentStore.get()
  if (s.open && s.tab === "comments") closeComments()
  else showPanel("comments")
}

/** Show a comment in the panel (a pin was clicked). */
export function openComment(id: string): void {
  update(() => ({ tab: "comments", open: true, focused: id }))
}

export function setFocused(id: string | null): void {
  update(() => ({ focused: id }))
}

// ---------------------------------------------------------------------------
// Targets: what C comments on and what ⌘⇧C copies

/** Whether the user last picked an element or selected a frame, so C acts on the newer one. */
let lastFocus: "frame" | "element" = "element"

function selectedFrame(): string | null {
  const id = selectionStore.get()
  return id && frameIdsKnown.has(id) ? id : null
}

function activeElement(): ElementRef | null {
  const s = pickStore.get()
  const item = s.items.find((i) => i.uid === s.active) ?? s.items.at(-1)
  return item && !item.stale ? refFromInfo(item) : null
}

/** The comment target for C: the newer of the active element and the selected frame. */
export function currentTarget(): Ref | null {
  const element = activeElement()
  const frame = selectedFrame()
  if (element && (lastFocus === "element" || !frame)) return element
  return frame ? { kind: "frame", frame } : element
}

/** ⌘⇧C: the selected elements' tags, else the selected frame's. */
export function copyCurrentReference(): void {
  const s = pickStore.get()
  const items = s.items.filter((i) => !i.stale)
  const frame = selectedFrame()
  if (items.length && (lastFocus === "element" || !frame)) {
    void copyText(formatSelection(items), items.length > 1 ? `Copied ${items.length} references` : "Copied")
  } else if (frame) {
    void copyText(formatRef({ kind: "frame", frame }))
  } else {
    showToast("Select a frame or an element to copy its reference")
  }
}

// ---------------------------------------------------------------------------
// Composing

/** Open the composer for a new comment on `target` (default: the current target). */
export function startComment(target: Ref | null = currentTarget()): boolean {
  if (!target) {
    showToast("Select an element or a frame to comment on")
    return false
  }
  const s = commentStore.get()
  if (s.draft && !isBodyEmpty(s.draft.body)) {
    update(() => ({ tab: "comments", open: true }))
    showToast("Finish or cancel the open comment first")
    focusComposerSoon()
    return false
  }
  update(() => ({ draft: { editing: null, target, body: [] }, tab: "comments", open: true, focused: null }))
  focusComposerSoon()
  return true
}

export function editComment(id: string): void {
  const s = commentStore.get()
  const comment = s.comments.find((c) => c.id === id)
  if (!comment) return
  if (s.draft && !isBodyEmpty(s.draft.body) && s.draft.editing !== id) {
    showToast("Finish or cancel the open comment first")
    focusComposerSoon()
    return
  }
  update(() => ({ draft: { editing: id, target: comment.target, body: comment.body }, tab: "comments", open: true, focused: id }))
  focusComposerSoon()
}

export function setDraftBody(body: BodySegment[]): void {
  update((s) => (s.draft ? { draft: { ...s.draft, body } } : {}))
}

export function cancelDraft(): void {
  update(() => ({ draft: null }))
}

/** Add the draft to the buffer (or save the edit). Returns false when there's nothing to add. */
export function submitDraft(): boolean {
  const s = commentStore.get()
  const draft = s.draft
  if (!draft) return false
  const body = normalizeBody(draft.body)
  if (isBodyEmpty(body)) {
    showToast("Write something first")
    return false
  }
  if (draft.editing) {
    const id = draft.editing
    update((s) => ({
      comments: s.comments.map((c) => (c.id === id ? { ...c, body, updatedAt: new Date().toISOString() } : c)),
      draft: null,
      focused: id,
    }))
  } else {
    const comment: Comment = { id: newId(), target: draft.target, body, createdAt: new Date().toISOString() }
    update((s) => ({ comments: [...s.comments, comment], draft: null, focused: comment.id }))
    showToast(`Comment ${commentStore.get().comments.length} added`)
  }
  return true
}

let focusTimer: ReturnType<typeof setTimeout> | undefined
function focusComposerSoon(): void {
  clearTimeout(focusTimer)
  focusTimer = setTimeout(() => document.querySelector<HTMLElement>("[data-composer]")?.focus(), 30)
}

// ---------------------------------------------------------------------------
// Deleting, clearing, copying

export function deleteComment(id: string): void {
  const s = commentStore.get()
  const index = s.comments.findIndex((c) => c.id === id)
  if (index < 0) return
  const removed = s.comments[index]!
  update((s) => ({
    comments: s.comments.filter((c) => c.id !== id),
    draft: s.draft?.editing === id ? null : s.draft,
    focused: s.focused === id ? null : s.focused,
  }))
  showToast(`Comment ${index + 1} deleted`, {
    action: {
      label: "Undo",
      run: () =>
        update((s) => {
          if (s.comments.some((c) => c.id === removed.id)) return {}
          const comments = [...s.comments]
          comments.splice(Math.min(index, comments.length), 0, removed)
          return { comments }
        }),
    },
  })
}

export function clearComments(): void {
  const s = commentStore.get()
  const previous = s.comments
  if (!previous.length) return
  update(() => ({ comments: [], draft: s.draft?.editing ? null : s.draft, focused: null }))
  showToast(previous.length === 1 ? "Cleared 1 comment" : `Cleared ${previous.length} comments`, {
    action: {
      label: "Undo",
      // Bring them back ahead of anything added since.
      run: () =>
        update((s) => {
          const ids = new Set(previous.map((c) => c.id))
          return { comments: [...previous, ...s.comments.filter((c) => !ids.has(c.id))] }
        }),
    },
  })
}

/** What Copy all copies (and `framewall comments` prints). */
export function exportComments(): string {
  return formatComments(config.boardDir, commentStore.get().comments)
}

export function copyAllComments(): void {
  const n = commentStore.get().comments.length
  if (!n) return
  void copyText(exportComments(), n === 1 ? "Copied 1 comment" : `Copied ${n} comments`)
}

// ---------------------------------------------------------------------------
// Staleness: frames that are gone

let frameIdsKnown = new Set<string>()

function withFrameCheck(ref: Ref, frames: Set<string>): Ref {
  const exists = frames.has(ref.frame)
  if (ref.kind === "frame") return !!ref.stale === !exists ? ref : { ...ref, stale: !exists }
  // Elements of a missing frame are stale; otherwise the frame's picker decides.
  return !exists && !ref.stale ? { ...ref, stale: true } : ref
}

function mapRefs(comments: Comment[], fn: (ref: Ref, trackId: string) => Ref): Comment[] {
  let changed = false
  const next = comments.map((c) => {
    const target = fn(c.target, targetTrackId(c.id))
    let bodyChanged = false
    const body = c.body.map((seg) => {
      if (seg.type !== "ref") return seg
      const ref = fn(seg.ref, refTrackId(seg.id))
      if (ref === seg.ref) return seg
      bodyChanged = true
      return { ...seg, ref }
    })
    if (target === c.target && !bodyChanged) return c
    changed = true
    return { ...c, target, body: bodyChanged ? body : c.body }
  })
  return changed ? next : comments
}

/** The board's frames changed: mark references to missing frames stale (and found ones not). */
export function setBoardFrames(frameIds: Set<string>): void {
  frameIdsKnown = frameIds
  update((s) => {
    const comments = mapRefs(s.comments, (ref) => withFrameCheck(ref, frameIds))
    return comments === s.comments ? {} : { comments }
  })
}

// ---------------------------------------------------------------------------
// Talking to frames

function hintFor(ref: ElementRef): ElementTarget {
  if (ref.key) return { key: ref.key, hint: null }
  return { key: null, hint: { at: ref.at, definedIn: ref.definedIn, instance: ref.instance } }
}

/** Every element reference the frames should keep finding, by frame. */
function trackSpecs(comments: Comment[]): Map<string, TrackSpec[]> {
  const byFrame = new Map<string, TrackSpec[]>()
  const add = (ref: Ref, id: string, pin: boolean) => {
    if (ref.kind !== "element") return
    const list = byFrame.get(ref.frame) ?? []
    list.push({ id, pin, ...hintFor(ref) })
    byFrame.set(ref.frame, list)
  }
  for (const c of comments) {
    add(c.target, targetTrackId(c.id), true)
    for (const seg of c.body) if (seg.type === "ref") add(seg.ref, refTrackId(seg.id), false)
  }
  return byFrame
}

/** What each frame was last sent (track ids and pins; a frame keeps its own idea of where they are). */
const sentTracks = new Map<string, string>()

function syncTracks(force: string | null = null): void {
  const specs = trackSpecs(commentStore.get().comments)
  for (const iframe of document.querySelectorAll<HTMLIFrameElement>("iframe[data-frame-id]")) {
    const frameId = iframe.dataset.frameId!
    const items = specs.get(frameId) ?? []
    const signature = JSON.stringify(items.map((t) => [t.id, t.pin]))
    if (force !== frameId && (sentTracks.get(frameId) ?? "[]") === signature) continue
    sentTracks.set(frameId, signature)
    post(frameId, { type: "tracks", items })
  }
}

/** An element the picker found again (info) or lost (null). */
function applyTracked(items: { id: string; info: Parameters<typeof refFromInfo>[0] | null }[]): void {
  const byId = new Map(items.map((i) => [i.id, i.info]))
  update((s) => {
    const comments = mapRefs(s.comments, (ref, trackId) => {
      if (ref.kind !== "element" || !byId.has(trackId)) return ref
      const info = byId.get(trackId)
      if (!info) return ref.stale ? ref : { ...ref, stale: true }
      const next = refFromInfo(info)
      return JSON.stringify(next) === JSON.stringify(ref) ? ref : next
    })
    return comments === s.comments ? {} : { comments }
  })
}

let highlighted: { frame: string; kind: Ref["kind"] } | null = null

/** Outline a reference's target while its chip is hovered (null: stop). */
export function highlightRef(ref: Ref | null): void {
  if (highlighted) {
    if (highlighted.kind === "element") post(highlighted.frame, { type: "highlight", target: null })
    else document.querySelector(`[data-item-id="${CSS.escape(highlighted.frame)}"]`)?.removeAttribute("data-highlight")
    highlighted = null
  }
  if (!ref) return
  highlighted = { frame: ref.frame, kind: ref.kind }
  if (ref.kind === "element") post(ref.frame, { type: "highlight", target: hintFor(ref) })
  else document.querySelector(`[data-item-id="${CSS.escape(ref.frame)}"]`)?.setAttribute("data-highlight", "")
}

let locateReq = 0
const pendingLocates = new Map<number, (rect: FrameRect | null) => void>()

/** Ask a frame where a referenced element is (frame CSS px), null when it isn't found. */
export function locateRef(ref: ElementRef): Promise<FrameRect | null> {
  if (!iframeFor(ref.frame)) return Promise.resolve(null)
  const req = ++locateReq
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingLocates.delete(req)
      resolve(null)
    }, 1500)
    pendingLocates.set(req, (rect) => {
      clearTimeout(timer)
      resolve(rect)
    })
    post(ref.frame, { type: "locate", req, target: hintFor(ref) })
  })
}

/** Handle a comment-related message from a frame. Returns true when it was one. */
export function handleCommentMessage(msg: FrameMessage): boolean {
  switch (msg.type) {
    case "picker":
      // A frame (re)loaded: it lost its tracks.
      syncTracks(msg.id)
      return true
    case "tracked":
      applyTracked(msg.items)
      return true
    case "pins":
      pinStore.set((prev) => {
        const next = { ...prev }
        for (const { id, rect } of msg.rects) next[id] = rect
        return next
      })
      return true
    case "located":
      pendingLocates.get(msg.req)?.(msg.rect)
      pendingLocates.delete(msg.req)
      return true
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Persistence

/** Identifies this canvas in save broadcasts, so it ignores its own. */
const clientId = newId()

const signatureOf = (comments: Comment[]) => JSON.stringify(comments)

let lastSaved = ""
let saveTimer: ReturnType<typeof setTimeout> | undefined

async function save(): Promise<void> {
  const { comments } = commentStore.get()
  const signature = signatureOf(comments)
  if (signature === lastSaved) return
  lastSaved = signature
  try {
    const res = await fetch(COMMENTS_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments, client: clientId }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    lastSaved = ""
    console.warn("[framewall] couldn't save the comments:", err)
    showToast("Couldn't save the comments")
  }
}

/** Take a buffer from disk (initial load, or a change made elsewhere). */
function takeFile(file: CommentsFile): void {
  const clean = cleanComments(file.comments)
  const comments = frameIdsKnown.size ? mapRefs(clean, (ref) => withFrameCheck(ref, frameIdsKnown)) : clean
  lastSaved = signatureOf(clean)
  update((s) => ({
    comments,
    loaded: true,
    draft: s.draft?.editing && !comments.some((c) => c.id === s.draft!.editing) ? null : s.draft,
  }))
}

async function load(): Promise<void> {
  try {
    const res = await fetch(COMMENTS_ENDPOINT)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    takeFile((await res.json()) as CommentsFile)
  } catch (err) {
    console.warn("[framewall] couldn't load the comments:", err)
    update(() => ({ loaded: true }))
  }
}

let started = false
/** Load the buffer, then keep frames tracking its elements and save changes. */
export function startComments(): void {
  if (started) return
  started = true
  void load()
  if (import.meta.hot) {
    import.meta.hot.on(COMMENTS_EVENT, (event: CommentsEvent) => {
      if (event.client === clientId) return
      const before = commentStore.get().comments.length
      takeFile(event.file)
      if (event.client === null && !event.file.comments.length && before) showToast("Comments cleared from the command line")
    })
  }
  let comments = commentStore.get().comments
  commentStore.subscribe(() => {
    const s = commentStore.get()
    if (s.comments === comments) return
    comments = s.comments
    syncTracks()
    if (!s.loaded) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(), 250)
  })
  // C acts on whichever was chosen last: a picked element or a selected frame.
  let uids = new Set(pickStore.get().items.map((i) => i.uid))
  let active = pickStore.get().active
  pickStore.subscribe(() => {
    const p = pickStore.get()
    const picked = p.items.some((i) => !uids.has(i.uid)) || (p.active !== active && p.active !== null)
    uids = new Set(p.items.map((i) => i.uid))
    active = p.active
    if (!picked) return
    lastFocus = "element"
    // A new pick shows the selection (but never takes the panel from an open composer).
    const s = commentStore.get()
    if (!s.draft && s.tab !== "selection") update(() => ({ tab: "selection" }))
  })
  selectionStore.subscribe(() => {
    if (selectionStore.get()) lastFocus = "frame"
  })
}

/** Short text for a pin's tooltip. */
export function pinTitle(comment: Comment, n: number): string {
  const text = plainBody(comment.body).replace(/\s+/g, " ").trim()
  return `${n}. ${text.length > 120 ? text.slice(0, 119) + "…" : text}`
}
