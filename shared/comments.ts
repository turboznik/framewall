/**
 * The comment buffer: comments on frames and elements, kept by the canvas in
 * `BOARD_DIR/.framewall/comments.json` until they are copied to an agent.
 *
 * Copy all, `GET /__framewall/comments?format=xml` and `framewall comments`
 * print the buffer with `formatComments`:
 *
 *     <framewall board="/abs/path/to/board">
 *       <comment element="CompactCheckout › Button" frame="checkout/compact" at="checkout/compact/CompactCheckout.tsx:28">
 *         Make this the primary action, styled like <element frame="pricing" path="PricingPage › Button" at="pricing/PricingPage.tsx:40" />.
 *       </comment>
 *       <comment frame="checkout/mobile">
 *         Too cramped. Match the spacing in <frame id="checkout/compact" />.
 *       </comment>
 *     </framewall>
 *
 * Runs in the browser and in Node (type stripping): erasable syntax only.
 */

import {
  cleanRef,
  elementAttrPairs,
  escapeAttr,
  escapeText,
  formatAttrs,
  formatRef,
  isRef,
  parseRefs,
  refLabel,
  type Ref,
} from "./refs.ts"

/** Dev-server endpoint that reads (GET) and writes (PUT) the buffer. */
export const COMMENTS_ENDPOINT = "/__framewall/comments"
/** In `BOARD_DIR/.framewall/` (the selection's folder, ignored by the watcher). */
export const COMMENTS_FILE = "comments.json"
/** Custom HMR event: the comments file changed outside the canvas (the CLI cleared it, say). */
export const COMMENTS_EVENT = "framewall:comments"

/** Payload of `COMMENTS_EVENT`: the saved buffer and the canvas that saved it (null: the CLI or an editor). */
export interface CommentsEvent {
  file: CommentsFile
  client: string | null
}

export const MAX_COMMENTS = 500
export const MAX_TEXT = 10000

/** A piece of a comment's text: plain text, or an inline reference (a chip). */
export type BodySegment = { type: "text"; text: string } | { type: "ref"; id: string; ref: Ref }

export interface Comment {
  id: string
  /** What the comment is about. `target.stale` marks the comment stale. */
  target: Ref
  body: BodySegment[]
  createdAt: string
  updatedAt?: string
}

export interface CommentsFile {
  version: 1
  /** Absolute path of the board folder. */
  board: string
  updatedAt: string
  comments: Comment[]
}

/** The text with references as tags and everything else escaped, trimmed. */
export function formatBody(body: BodySegment[]): string {
  return body
    .map((s) => (s.type === "text" ? escapeText(s.text) : formatRef(s.ref)))
    .join("")
    .trim()
}

/** The text as a person reads it, chips as their labels (tooltips, previews). */
export function plainBody(body: BodySegment[]): string {
  return body
    .map((s) => (s.type === "text" ? s.text : `@${refLabel(s.ref)}`))
    .join("")
    .trim()
}

export const isBodyEmpty = (body: BodySegment[]) => !body.some((s) => s.type === "ref" || s.text.trim())

/** `element="…" frame="…" at="…"` or `frame="…"`, plus `stale="true"`. */
export function commentAttrs(target: Ref): string {
  const attrs =
    target.kind === "frame"
      ? formatAttrs([["frame", target.frame]])
      : formatAttrs([["element", target.path], ["frame", target.frame], ...elementAttrPairs(target)])
  return target.stale ? `${attrs} stale="true"` : attrs
}

/** The whole buffer as one pseudo-XML block (what Copy all puts on the clipboard). */
export function formatComments(board: string, comments: Comment[]): string {
  const out = [`<framewall board="${escapeAttr(board)}">`]
  for (const comment of comments) {
    const open = `  <comment ${commentAttrs(comment.target)}`
    const text = formatBody(comment.body)
    if (!text) {
      out.push(`${open} />`)
      continue
    }
    out.push(`${open}>`)
    for (const line of text.split("\n")) out.push(line.trim() ? `    ${line.trimEnd()}` : "")
    out.push("  </comment>")
  }
  out.push("</framewall>")
  return out.join("\n")
}

/** Text with reference tags in it (a paste, say) as body segments. */
export function segmentsFromText(text: string, newId: () => string): BodySegment[] {
  return parseRefs(text).map((part) => (isRef(part) ? { type: "ref", id: newId(), ref: part } : { type: "text", text: part }))
}

/** Merge neighbouring text segments and drop empty ones. */
export function normalizeBody(body: BodySegment[]): BodySegment[] {
  const out: BodySegment[] = []
  for (const s of body) {
    if (s.type === "text") {
      if (!s.text) continue
      const prev = out.at(-1)
      if (prev?.type === "text") out[out.length - 1] = { type: "text", text: prev.text + s.text }
      else out.push({ type: "text", text: s.text })
    } else out.push(s)
  }
  return out
}

// ---------------------------------------------------------------------------
// Cleaning untrusted data (the file, PUT bodies)

function cleanSegment(raw: unknown): BodySegment | null {
  if (!raw || typeof raw !== "object") return null
  const s = raw as Record<string, unknown>
  if (s.type === "text") return typeof s.text === "string" ? { type: "text", text: s.text.slice(0, MAX_TEXT) } : null
  if (s.type !== "ref" || typeof s.id !== "string") return null
  const ref = cleanRef(s.ref)
  return ref ? { type: "ref", id: s.id.slice(0, 64), ref } : null
}

export function cleanComment(raw: unknown): Comment | null {
  if (!raw || typeof raw !== "object") return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== "string" || !c.id) return null
  const target = cleanRef(c.target)
  if (!target) return null
  const body = normalizeBody(
    (Array.isArray(c.body) ? c.body : [])
      .slice(0, 400)
      .map(cleanSegment)
      .filter((s) => s !== null)
  )
  const comment: Comment = {
    id: c.id.slice(0, 64),
    target,
    body,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date(0).toISOString(),
  }
  if (typeof c.updatedAt === "string") comment.updatedAt = c.updatedAt
  return comment
}

export function cleanComments(raw: unknown): Comment[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Comment[] = []
  for (const item of raw.slice(0, MAX_COMMENTS)) {
    const comment = cleanComment(item)
    if (!comment || seen.has(comment.id)) continue
    seen.add(comment.id)
    out.push(comment)
  }
  return out
}
