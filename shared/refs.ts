/**
 * References: self-contained, one-line pseudo-XML tags that point an agent at a
 * frame or at an element inside one.
 *
 *     <frame id="checkout/mobile" />
 *     <element frame="checkout/compact" path="CompactCheckout › Button" at="checkout/compact/CompactCheckout.tsx:28" />
 *
 * `path` is the end of the component breadcrumb, `at` the "used at" location
 * (the JSX in the frame's own files), `instance` the position when that JSX
 * renders several times in the frame, `defined-in` where the DOM element itself
 * is written when that differs from `at`.
 *
 * Copy reference, the comment export and the CLI all format through here, and
 * the comment composer parses pasted tags back into chips.
 *
 * Runs in the browser and in Node (the CLI loads it with type stripping), so:
 * erasable syntax only, `.ts` import specifiers.
 */

import { formatLoc, sameLoc, type ElementInfo, type ElementKey } from "./selection.ts"

export interface FrameRef {
  kind: "frame"
  /** Frame ID, e.g. `checkout/mobile`. */
  frame: string
  /** UI state: the frame isn't on the board any more. Not part of the tag. */
  stale?: boolean
}

export interface ElementRef {
  kind: "element"
  /** ID of the frame the element was picked in. */
  frame: string
  /** The last levels of the component breadcrumb: `CompactCheckout › Button`. */
  path: string
  /** "Used at": `file:line` (with `:col` when needed to tell two elements apart). */
  at?: string
  /** 1-based position when the same JSX renders several times in the frame. */
  instance?: number
  /** "Defined in", only when it differs from `at`. */
  definedIn?: string
  /** The picker's identity for the element, used to track it. Absent for pasted tags until resolved. */
  key?: ElementKey
  /** UI state: the element wasn't found after the last edit. Not part of the tag. */
  stale?: boolean
}

export type Ref = FrameRef | ElementRef

/** How many breadcrumb levels `path` keeps. */
export const PATH_LEVELS = 2
export const PATH_SEPARATOR = " › "

// ---------------------------------------------------------------------------
// Escaping

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "\n": "&#10;",
  "\r": "&#13;",
  "\t": "&#9;",
}

/** For a double-quoted attribute value: `& < > "` and line breaks. */
export function escapeAttr(value: string): string {
  return value.replace(/[&<>"\n\r\t]/g, (c) => ESCAPES[c] ?? c)
}

/** For element text: `& < >`, so only real references read as tags. */
export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (c) => ESCAPES[c] ?? c)
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

export function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    const e = entity.toLowerCase()
    if (e.startsWith("#")) {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED[e] ?? match
  })
}

/** `a="1" b="2"`, leaving out empty values. */
export function formatAttrs(pairs: [string, string | number | undefined | null][]): string {
  return pairs
    .filter((pair): pair is [string, string | number] => pair[1] !== undefined && pair[1] !== null && pair[1] !== "")
    .map(([name, value]) => `${name}="${escapeAttr(String(value))}"`)
    .join(" ")
}

// ---------------------------------------------------------------------------
// Building and formatting

/** The reference for an element the picker described. */
export function refFromInfo(
  info: Pick<ElementInfo, "frameId" | "crumbs" | "usedAt" | "definedIn" | "nth" | "count" | "key">
): ElementRef {
  const used = info.usedAt
  const defined = info.definedIn
  const showDefined = !!defined && !sameLoc(used, defined)
  // Two different elements on one line: columns tell them apart.
  const withCol = showDefined && !!used && used.file === defined.file && used.line === defined.line
  const ref: ElementRef = { kind: "element", frame: info.frameId, path: info.crumbs.slice(-PATH_LEVELS).join(PATH_SEPARATOR) }
  if (used) ref.at = formatLoc(used, withCol)
  if (info.count > 1) ref.instance = info.nth
  if (showDefined) ref.definedIn = formatLoc(defined, withCol)
  ref.key = info.key
  return ref
}

export function elementAttrPairs(ref: ElementRef): [string, string | number | undefined][] {
  return [
    ["at", ref.at],
    ["instance", ref.instance],
    ["defined-in", ref.definedIn],
  ]
}

/** The tag for a reference, on one line. */
export function formatRef(ref: Ref): string {
  if (ref.kind === "frame") return `<frame ${formatAttrs([["id", ref.frame]])} />`
  return `<element ${formatAttrs([["frame", ref.frame], ["path", ref.path], ...elementAttrPairs(ref)])} />`
}

/** Several references, one per line. */
export function formatRefs(refs: Ref[]): string {
  return refs.map(formatRef).join("\n")
}

/**
 * Selected elements as references, one per line (Copy reference, `framewall selection`).
 * An element that wasn't found after the last edit gets `stale="true"`, as in the comment export.
 */
export function formatSelection(items: (Parameters<typeof refFromInfo>[0] & { stale?: boolean })[]): string {
  return items
    .map((item) => {
      const tag = formatRef(refFromInfo(item))
      return item.stale ? tag.replace(/ \/>$/, ' stale="true" />') : tag
    })
    .join("\n")
}

/** `Button` for an element, the frame ID for a frame. */
export function refName(ref: Ref): string {
  if (ref.kind === "frame") return ref.frame
  return ref.path.split(PATH_SEPARATOR).at(-1)?.trim() || "element"
}

/** Short chip label: `Button · checkout/compact`, or `checkout/mobile`. */
export function refLabel(ref: Ref): string {
  return ref.kind === "frame" ? ref.frame : `${refName(ref)} · ${ref.frame}`
}

/** Do two references point at the same thing (ignoring tracking state)? */
export function sameRef(a: Ref, b: Ref): boolean {
  if (a.kind !== b.kind || a.frame !== b.frame) return false
  if (a.kind === "frame" || b.kind === "frame") return true
  if (a.at !== b.at || a.definedIn !== b.definedIn || (a.instance ?? 1) !== (b.instance ?? 1)) return false
  // Without a location, the breadcrumb is all there is to compare.
  return !!a.at || a.path === b.path
}

// ---------------------------------------------------------------------------
// Parsing

const TAG_SOURCE = String.raw`<(frame|element)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/>`
const ATTR_RE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function readAttrs(source: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const m of source.matchAll(ATTR_RE)) {
    const name = m[1]!.toLowerCase()
    if (!attrs.has(name)) attrs.set(name, unescapeXml(m[2] ?? m[3] ?? ""))
  }
  return attrs
}

function refFromTag(name: string, attrs: Map<string, string>): Ref | null {
  const get = (key: string) => attrs.get(key)?.trim() || undefined
  if (name === "frame") {
    const id = get("id")
    return id ? { kind: "frame", frame: id } : null
  }
  const frame = get("frame")
  const path = get("path") ?? ""
  const at = get("at")
  if (!frame || (!path && !at)) return null
  const ref: ElementRef = { kind: "element", frame, path }
  if (at) ref.at = at
  const instance = get("instance")
  if (instance && /^\d+$/.test(instance) && Number(instance) >= 1) ref.instance = Number(instance)
  const definedIn = get("defined-in")
  if (definedIn) ref.definedIn = definedIn
  return ref
}

/** One complete tag (surrounding whitespace allowed), else null. */
export function parseRef(text: string): Ref | null {
  const m = new RegExp(`^\\s*${TAG_SOURCE}\\s*$`).exec(text)
  return m ? refFromTag(m[1]!, readAttrs(m[2] ?? "")) : null
}

/**
 * Split text into plain text and the reference tags in it. Anything that isn't
 * a valid tag stays text, so `parseRefs(text).some(isRef)` tells a paste with
 * references from plain text.
 */
export function parseRefs(text: string): (string | Ref)[] {
  const out: (string | Ref)[] = []
  let last = 0
  for (const m of text.matchAll(new RegExp(TAG_SOURCE, "g"))) {
    const ref = refFromTag(m[1]!, readAttrs(m[2] ?? ""))
    if (!ref) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(ref)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export const isRef = (part: string | Ref): part is Ref => typeof part !== "string"

// ---------------------------------------------------------------------------
// Cleaning untrusted data (the comments file, PUT bodies)

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "")
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d)

export function cleanKey(raw: unknown): ElementKey | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const k = raw as Record<string, unknown>
  if (typeof k.src !== "string" || typeof k.loose !== "string") return undefined
  return {
    src: str(k.src),
    usedAt: str(k.usedAt),
    index: num(k.index, 0),
    loose: str(k.loose),
    looseIndex: num(k.looseIndex, 0),
    looseCount: num(k.looseCount, 1),
  }
}

/** Keep the fields of a reference we know, with the types we expect. */
export function cleanRef(raw: unknown): Ref | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const frame = str(r.frame, 500)
  if (!frame) return null
  const stale = r.stale === true ? { stale: true as const } : {}
  if (r.kind === "frame") return { kind: "frame", frame, ...stale }
  if (r.kind !== "element") return null
  const ref: ElementRef = { kind: "element", frame, path: str(r.path, 500) }
  if (typeof r.at === "string" && r.at) ref.at = str(r.at, 500)
  if (typeof r.instance === "number" && Number.isInteger(r.instance) && r.instance >= 1) ref.instance = r.instance
  if (typeof r.definedIn === "string" && r.definedIn) ref.definedIn = str(r.definedIn, 500)
  if (!ref.path && !ref.at) return null
  const key = cleanKey(r.key)
  if (key) ref.key = key
  return { ...ref, ...stale }
}
