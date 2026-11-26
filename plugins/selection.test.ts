import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { readSelection, selectionPath, writeSelection } from "./selection.ts"

let board: string

beforeEach(() => {
  board = mkdtempSync(path.join(tmpdir(), "framewall-selection-"))
  mkdirSync(path.join(board, "pricing"))
  writeFileSync(
    path.join(board, "pricing/index.tsx"),
    ["export default function Pricing() {", "  return (", '    <main className="p-8">', "      <h1>Plans</h1>", "    </main>", "  )", "}"].join("\n")
  )
})

afterEach(() => rmSync(board, { recursive: true, force: true }))

const raw = (overrides: Record<string, unknown> = {}) => ({
  uid: "a1",
  frameId: "pricing",
  name: "h1",
  tag: "h1",
  crumbs: ["Pricing", "h1"],
  usedAt: { file: "pricing/index.tsx", line: 4, col: 7 },
  definedIn: { file: "pricing/index.tsx", line: 4, col: 7 },
  nth: 1,
  count: 1,
  key: { src: "pricing/index.tsx:4:7", usedAt: "pricing/index.tsx:4:7", index: 0, loose: "h1|h1|pricing/index.tsx|pricing/index.tsx", looseIndex: 0, looseCount: 1 },
  ...overrides,
})

describe("selection file", () => {
  it("starts empty when there is no file", () => {
    expect(readSelection(board).items).toEqual([])
  })

  it("writes into .framewall/ with snippets read from the source", () => {
    const saved = writeSelection(board, [raw()])
    expect(saved.items[0].snippet).toBe("<h1>Plans</h1>")
    const onDisk = JSON.parse(readFileSync(selectionPath(board), "utf8"))
    expect(selectionPath(board)).toBe(path.join(board, ".framewall", "selection.json"))
    expect(onDisk.items[0]).toMatchObject({ uid: "a1", snippet: "<h1>Plans</h1>" })
    expect(readSelection(board).items).toHaveLength(1)
  })

  it("drops malformed items and unknown fields", () => {
    const saved = writeSelection(board, [null, { uid: 1 }, raw({ extra: "x", stale: true })])
    expect(saved.items).toHaveLength(1)
    expect(saved.items[0]).not.toHaveProperty("extra")
    expect(saved.items[0].stale).toBe(true)
  })

  it("never reads source outside the board", () => {
    const saved = writeSelection(board, [raw({ usedAt: { file: "../../etc/passwd", line: 1, col: 1 } })])
    expect(saved.items[0].snippet).toBeNull()
  })
})
