import type { BoardItem, BoardItemKind, BoardTree } from "../../shared/board"

/**
 * Automatic layout of a board tree, in canvas units (1 unit = 1 CSS pixel at
 * 100% zoom). A horizontal tree:
 * - top-level items stack in a column;
 * - a frame's children stack in a column to its right;
 * - a group is a section whose children sit side by side in a row.
 * Every box reserves LABEL_SPACE above it for its label. Labels keep a
 * constant screen size, so the gaps are generous enough for them to stay
 * clear of their neighbours down to roughly 15% zoom.
 */

export const LABEL_SPACE = 40
export const FRAME_CHILD_GAP_X = 160
export const STACK_GAP_Y = 160
export const ROOT_GAP_Y = 240
export const GROUP_PAD = 64
/** Top padding of a group with children: room for the children's labels. */
export const GROUP_PAD_TOP = 136
export const GROUP_ROW_GAP_X = 120
export const EMPTY_GROUP_WIDTH = 480
export const EMPTY_GROUP_HEIGHT = 280

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutBox extends Rect {
  id: string
  kind: BoardItemKind
  item: BoardItem
  depth: number
}

export interface BoardLayout {
  /** Pre-order (parents before children). */
  boxes: LayoutBox[]
  byId: Map<string, LayoutBox>
  /** Everything, labels included; null for an empty board. */
  bounds: Rect | null
}

interface Measured {
  w: number
  h: number
  place(x: number, y: number, out: LayoutBox[]): void
}

function measure(item: BoardItem, depth: number): Measured {
  const kids = item.children.map((child) => measure(child, depth + 1))

  if (item.kind === "frame") {
    const kidsW = Math.max(0, ...kids.map((k) => k.w))
    const kidsH = kids.reduce((sum, k) => sum + k.h, 0) + STACK_GAP_Y * Math.max(0, kids.length - 1)
    return {
      w: item.width + (kids.length ? FRAME_CHILD_GAP_X + kidsW : 0),
      h: Math.max(LABEL_SPACE + item.height, kidsH),
      place(x, y, out) {
        out.push({ id: item.id, kind: "frame", item, depth, x, y: y + LABEL_SPACE, w: item.width, h: item.height })
        let cy = y
        for (const kid of kids) {
          kid.place(x + item.width + FRAME_CHILD_GAP_X, cy, out)
          cy += kid.h + STACK_GAP_Y
        }
      },
    }
  }

  // Group: a section around its children, laid out in a row.
  const contentW = kids.length
    ? kids.reduce((sum, k) => sum + k.w, 0) + GROUP_ROW_GAP_X * (kids.length - 1)
    : EMPTY_GROUP_WIDTH - 2 * GROUP_PAD
  const contentH = kids.length ? Math.max(...kids.map((k) => k.h)) : EMPTY_GROUP_HEIGHT - 2 * GROUP_PAD
  const padTop = kids.length ? GROUP_PAD_TOP : GROUP_PAD
  const boxW = contentW + 2 * GROUP_PAD
  const boxH = contentH + padTop + GROUP_PAD
  return {
    w: boxW,
    h: LABEL_SPACE + boxH,
    place(x, y, out) {
      out.push({ id: item.id, kind: "group", item, depth, x, y: y + LABEL_SPACE, w: boxW, h: boxH })
      let cx = x + GROUP_PAD
      for (const kid of kids) {
        kid.place(cx, y + LABEL_SPACE + padTop, out)
        cx += kid.w + GROUP_ROW_GAP_X
      }
    },
  }
}

export function layoutBoard(tree: BoardTree): BoardLayout {
  const boxes: LayoutBox[] = []
  let y = 0
  let maxW = 0
  for (const item of tree.items) {
    const m = measure(item, 0)
    m.place(0, y, boxes)
    y += m.h + ROOT_GAP_Y
    maxW = Math.max(maxW, m.w)
  }
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const bounds = boxes.length ? { x: 0, y: 0, w: maxW, h: y - ROOT_GAP_Y } : null
  return { boxes, byId, bounds }
}
