/**
 * Element picking: the data the frame runtime reports about a picked element,
 * the selection the canvas persists to `BOARD_DIR/.framewall/selection.json`,
 * and the messages between canvas and frames. References (the tags that Copy
 * reference and `framewall selection` print) are formatted in `./refs.ts`.
 *
 * Runs in the browser and in Node (the CLI loads this file with Node's type
 * stripping), so: no runtime imports besides `./board.ts`, erasable syntax only.
 */

import { isHiddenName } from "./board.ts"

/** The JSX attribute the stamping transform adds to every element on the board. */
export const STAMP_ATTR = "data-fw-src"

/** Dev-server endpoint that reads (GET) and writes (PUT) the selection. */
export const SELECTION_ENDPOINT = "/__framewall/selection"
/** Where the selection lives, relative to the board folder. */
export const SELECTION_DIR = ".framewall"
export const SELECTION_FILE = "selection.json"

/** A position in a board file. `file` is relative to the board root; line and col are 1-based. */
export interface SourceLoc {
  file: string
  line: number
  col: number
}

/** Identity used to find an element again after a reload or a hot update. */
export interface ElementKey {
  /** Raw stamp of the "defined in" location (`file:line:col`). */
  src: string
  /** Raw stamp of the "used at" location. */
  usedAt: string
  /** 0-based position among the elements in the frame with the same `src` and `usedAt`. */
  index: number
  /** Coarser identity that survives line shifts: `tag|name|defined-in file|used-at file`. */
  loose: string
  looseIndex: number
  looseCount: number
}

/** What the frame runtime reports about one element. */
export interface ElementInfo {
  frameId: string
  /** The innermost component that renders this DOM node directly, else the tag name. */
  name: string
  /** DOM tag name, lower case. */
  tag: string
  /**
   * Component chain after the frame ID, root first (`CompactLight`, `CompactCheckout`,
   * `Button`). Ends with the tag when no component renders the node directly.
   */
  crumbs: string[]
  /** Nearest JSX location in the frame's own files. */
  usedAt: SourceLoc | null
  /** Where the DOM element's own JSX is written (often a shared component). */
  definedIn: SourceLoc | null
  /** 1-based position among the elements the same JSX renders in this frame, and their count. */
  nth: number
  count: number
  key: ElementKey
}

/** One selected element, as the canvas keeps it and as `selection.json` stores it. */
export interface SelectionItem extends ElementInfo {
  uid: string
  /** Opening JSX tag at `usedAt`, one line. Filled in by the dev server from the source. */
  snippet: string | null
  /** The element could not be found in its frame after the last edit or reload. */
  stale?: boolean
}

export interface SelectionFile {
  version: 1
  /** Absolute path of the board folder. */
  board: string
  updatedAt: string
  items: SelectionItem[]
}

export type NavDir = "up" | "down" | "prev" | "next"

/** A selection as one frame needs it: what to find and how to draw it. */
export interface FrameSelection {
  uid: string
  /** 1-based number shown on the outline badge and in the panel. */
  n: number
  active: boolean
  key: ElementKey
}

/**
 * How a frame finds the element a reference points at: the picker's key when
 * there is one, else the locations from the tag (`at`, `defined-in`, `instance`).
 */
export interface ElementTarget {
  key: ElementKey | null
  hint: { at?: string; definedIn?: string; instance?: number } | null
}

/** An element the canvas wants a frame to keep finding (comment targets, references in comments). */
export interface TrackSpec extends ElementTarget {
  id: string
  /** Report the element's box, for a comment pin. */
  pin: boolean
}

/** A box in the frame's CSS pixels, relative to its viewport. */
export interface FrameRect {
  x: number
  y: number
  w: number
  h: number
}

/** Messages the canvas posts to a frame iframe. */
export type CanvasMessage =
  | {
      source: "framewall-canvas"
      type: "pick-state"
      pick: boolean
      zoom: number
      items: FrameSelection[]
    }
  | { source: "framewall-canvas"; type: "zoom"; zoom: number }
  | { source: "framewall-canvas"; type: "navigate"; uid: string; dir: NavDir }
  | { source: "framewall-canvas"; type: "crumb"; uid: string; index: number }
  | { source: "framewall-canvas"; type: "tracks"; items: TrackSpec[] }
  /** Outline an element (a hovered reference chip); null removes the outline. */
  | { source: "framewall-canvas"; type: "highlight"; target: ElementTarget | null }
  /** Where is this element? Answered with a `located` message. */
  | { source: "framewall-canvas"; type: "locate"; req: number; target: ElementTarget }

/** `checkout/compact/index.tsx:42:5` -> `{ file, line: 42, col: 5 }` */
export function parseStamp(stamp: string | null | undefined): SourceLoc | null {
  if (!stamp) return null
  const match = /^(.*):(\d+):(\d+)$/.exec(stamp)
  if (!match || !match[1]) return null
  return { file: match[1], line: Number(match[2]), col: Number(match[3]) }
}

export function formatStamp(loc: SourceLoc): string {
  return `${loc.file}:${loc.line}:${loc.col}`
}

export function sameLoc(a: SourceLoc | null, b: SourceLoc | null): boolean {
  return !!a && !!b && a.file === b.file && a.line === b.line && a.col === b.col
}

/**
 * Is `file` one of the frame's own files? That is: inside the frame folder and not
 * inside a nested frame or group (only hidden folders like `_parts/` in between).
 */
export function isFrameOwnFile(frameId: string, file: string): boolean {
  if (!frameId || !file.startsWith(frameId + "/")) return false
  const dirs = file.slice(frameId.length + 1).split("/").slice(0, -1)
  return dirs.every(isHiddenName)
}

/** 1 -> 1st, 2 -> 2nd, 11 -> 11th, 23 -> 23rd */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th"
  return `${n}${suffix}`
}

/** `checkout/compact › CompactCheckout › Button` */
export function breadcrumb(item: Pick<ElementInfo, "frameId" | "crumbs">): string {
  return [item.frameId, ...item.crumbs].join(" › ")
}

/** `file:line`, or `file:line:col` when `withCol`. */
export function formatLoc(loc: SourceLoc, withCol = false): string {
  return withCol ? formatStamp(loc) : `${loc.file}:${loc.line}`
}
