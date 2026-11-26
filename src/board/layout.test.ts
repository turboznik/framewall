import { describe, expect, it } from "vitest"

import type { BoardItem, BoardTree } from "../../shared/board"
import {
  EMPTY_GROUP_HEIGHT,
  EMPTY_GROUP_WIDTH,
  FRAME_CHILD_GAP_X,
  GROUP_PAD,
  GROUP_PAD_TOP,
  GROUP_ROW_GAP_X,
  LABEL_SPACE,
  ROOT_GAP_Y,
  STACK_GAP_Y,
  layoutBoard,
} from "./layout"

function frame(id: string, width = 100, height = 50, children: BoardItem[] = []): BoardItem {
  return { id, name: id.split("/").pop()!, kind: "frame", width, height, children }
}
function group(id: string, children: BoardItem[] = []): BoardItem {
  return { id, name: id.split("/").pop()!, kind: "group", width: 0, height: 0, children }
}
const board = (...items: BoardItem[]): BoardTree => ({ name: "test", items })

describe("layoutBoard", () => {
  it("returns no bounds for an empty board", () => {
    const layout = layoutBoard(board())
    expect(layout.boxes).toEqual([])
    expect(layout.bounds).toBeNull()
  })

  it("stacks top-level items in a column", () => {
    const { byId } = layoutBoard(board(frame("a"), frame("b")))
    expect(byId.get("a")).toMatchObject({ x: 0, y: LABEL_SPACE, w: 100, h: 50 })
    expect(byId.get("b")).toMatchObject({ x: 0, y: LABEL_SPACE + 50 + ROOT_GAP_Y + LABEL_SPACE })
  })

  it("puts a frame's children in a column to its right", () => {
    const tree = board(frame("a", 200, 100, [frame("a/x", 80, 300), frame("a/y")]))
    const { byId } = layoutBoard(tree)
    const right = 200 + FRAME_CHILD_GAP_X
    expect(byId.get("a/x")).toMatchObject({ x: right, y: LABEL_SPACE })
    expect(byId.get("a/y")).toMatchObject({ x: right, y: LABEL_SPACE + 300 + STACK_GAP_Y + LABEL_SPACE })
  })

  it("lays out a group as a section with its children in a row", () => {
    const { byId } = layoutBoard(board(group("g", [frame("g/1", 100, 50), frame("g/2", 120, 80)])))
    const g = byId.get("g")!
    expect(g).toMatchObject({ kind: "group", x: 0, y: LABEL_SPACE })
    expect(g.w).toBe(GROUP_PAD + 100 + GROUP_ROW_GAP_X + 120 + GROUP_PAD)
    expect(g.h).toBe(GROUP_PAD_TOP + LABEL_SPACE + 80 + GROUP_PAD)
    expect(byId.get("g/1")).toMatchObject({ x: GROUP_PAD, y: g.y + GROUP_PAD_TOP + LABEL_SPACE })
    expect(byId.get("g/2")).toMatchObject({ x: GROUP_PAD + 100 + GROUP_ROW_GAP_X })
  })

  it("gives an empty group a placeholder size", () => {
    const { byId } = layoutBoard(board(group("empty")))
    expect(byId.get("empty")).toMatchObject({ w: EMPTY_GROUP_WIDTH, h: EMPTY_GROUP_HEIGHT })
  })

  it("lists boxes parents first and keeps depth", () => {
    const { boxes } = layoutBoard(board(group("g", [frame("g/a", 10, 10, [frame("g/a/b")])])))
    expect(boxes.map((b) => [b.id, b.depth])).toEqual([
      ["g", 0],
      ["g/a", 1],
      ["g/a/b", 2],
    ])
  })

  it("computes bounds around everything", () => {
    const { bounds } = layoutBoard(board(frame("a", 300, 100, [frame("a/b", 500, 400)])))
    expect(bounds).toEqual({ x: 0, y: 0, w: 300 + FRAME_CHILD_GAP_X + 500, h: LABEL_SPACE + 400 })
  })
})
