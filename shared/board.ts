/**
 * Types and constants shared by the Vite plugin (Node) and the browser code.
 *
 * A board is a folder tree. A folder with an `index.tsx` is a frame; a folder
 * without one is a group. Folders starting with `_` or `.` are ignored.
 */

import type { ElementInfo, FrameRect } from "./selection.ts"

export type BoardItemKind = "frame" | "group"

export interface BoardItem {
  /** Path relative to the board root, posix separators, e.g. `checkout/mobile`. */
  id: string
  /** Folder name (last path segment). */
  name: string
  kind: BoardItemKind
  /** From `frame.json`, if set. */
  title?: string
  /** Frame size in CSS pixels (frames only; groups get 0). */
  width: number
  height: number
  /** Set when `frame.json` exists but could not be used. */
  configError?: string
  children: BoardItem[]
}

export interface BoardTree {
  /** Board name (the board folder's name). */
  name: string
  items: BoardItem[]
}

export const DEFAULT_FRAME_WIDTH = 1280
export const DEFAULT_FRAME_HEIGHT = 800
export const MIN_FRAME_SIZE = 50
export const MAX_FRAME_SIZE = 10000

/** Custom HMR event: server pushes a fresh tree (payload: BoardTree). */
export const TREE_EVENT = "framewall:tree"
/** Custom HMR event: client asks the server to send the current tree. */
export const TREE_REQUEST_EVENT = "framewall:get-tree"

/** Virtual module exporting the tree as it was when the module was loaded. */
export const TREE_MODULE_ID = "virtual:framewall/tree"
/** Virtual module exporting static config (paths). */
export const CONFIG_MODULE_ID = "virtual:framewall/config"

export interface FramewallConfig {
  /** Absolute path of the Vite root. */
  root: string
  /** Absolute path of the board folder. */
  boardDir: string
  /** URL prefix under which the dev server serves board files (ends with `/`). */
  boardUrl: string
}

/** Messages a frame iframe posts to the canvas (window.parent). */
export type FrameMessage =
  | {
      source: "framewall"
      type: "status"
      id: string
      status: "loading" | "ready" | "missing" | "error"
      message?: string
    }
  | {
      source: "framewall"
      type: "wheel"
      id: string
      /** true: zoom gesture (ctrl/cmd+wheel, pinch); false: pan (scroll the frame can't use). */
      zoom: boolean
      deltaX: number
      deltaY: number
      /** Pointer position inside the frame, in the frame's CSS pixels. */
      clientX: number
      clientY: number
    }
  | {
      source: "framewall"
      type: "key"
      id: string
      key: string
      code?: string
      shiftKey?: boolean
      altKey?: boolean
      ctrlKey?: boolean
      metaKey?: boolean
    }
  /** The element picker in a frame is listening; the canvas answers with the pick state. */
  | { source: "framewall"; type: "picker"; id: string }
  /** An element was clicked in select mode. */
  | { source: "framewall"; type: "pick"; id: string; info: ElementInfo; shift: boolean }
  /** Result of a navigate / crumb request: the selection `uid` now points at `info`. */
  | { source: "framewall"; type: "replace"; id: string; uid: string; info: ElementInfo }
  /** Selections whose element changed (line numbers after an edit) or vanished (`info: null`). */
  | {
      source: "framewall"
      type: "resolved"
      id: string
      items: { uid: string; info: ElementInfo | null }[]
    }
  /** A drag in select mode: pan the canvas by this many screen pixels. */
  | { source: "framewall"; type: "pan"; id: string; dx: number; dy: number }
  /** Tracked elements (see `TrackSpec`) that changed or vanished (`info: null`). */
  | {
      source: "framewall"
      type: "tracked"
      id: string
      items: { id: string; info: ElementInfo | null }[]
    }
  /** Boxes of tracked elements with a pin, when they change; null while not visible in the frame. */
  | { source: "framewall"; type: "pins"; id: string; rects: { id: string; rect: FrameRect | null }[] }
  /** Answer to a `locate` request. */
  | { source: "framewall"; type: "located"; id: string; req: number; rect: FrameRect | null }

export function isHiddenName(name: string): boolean {
  return name.startsWith("_") || name.startsWith(".") || name === "node_modules"
}

/** `/frame/<id>` URL for a frame ID (each segment URI-encoded). */
export function frameUrl(id: string): string {
  return "/frame/" + id.split("/").map(encodeURIComponent).join("/")
}

export function walkItems(
  items: BoardItem[],
  visit: (item: BoardItem, parent: BoardItem | null) => void,
  parent: BoardItem | null = null
): void {
  for (const item of items) {
    visit(item, parent)
    walkItems(item.children, visit, item)
  }
}
