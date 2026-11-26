import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { parseFrameConfig, scanBoard } from "./scan.ts"

describe("parseFrameConfig", () => {
  it("uses the defaults for an empty file", () => {
    expect(parseFrameConfig("")).toEqual({ width: 1280, height: 800 })
  })

  it("reads size and title", () => {
    expect(parseFrameConfig('{"width": 375, "height": 812, "title": " Mobile "}')).toEqual({
      width: 375,
      height: 812,
      title: "Mobile",
    })
  })

  it("clamps sizes into range", () => {
    expect(parseFrameConfig('{"width": 1, "height": 99999}')).toMatchObject({ width: 50, height: 10000 })
  })

  it("reports invalid JSON and keeps the defaults", () => {
    const config = parseFrameConfig("{ width: 1 ")
    expect(config).toMatchObject({ width: 1280, height: 800 })
    expect(config.error).toMatch(/^frame\.json:/)
  })

  it("reports wrong types but keeps the valid fields", () => {
    const config = parseFrameConfig('{"width": "wide", "height": 600, "title": 3}')
    expect(config).toMatchObject({ width: 1280, height: 600 })
    expect(config.error).toBe("frame.json: width must be a number, title must be a string")
  })
})

describe("scanBoard", () => {
  let dir = ""
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function makeBoard(files: Record<string, string>) {
    dir = mkdtempSync(join(tmpdir(), "framewall-scan-"))
    for (const [file, content] of Object.entries(files)) {
      const full = join(dir, file)
      mkdirSync(join(full, ".."), { recursive: true })
      if (file.endsWith("/")) mkdirSync(full, { recursive: true })
      else writeFileSync(full, content)
    }
    return dir
  }

  it("turns folders into frames and groups, skipping _ and . folders", () => {
    const board = makeBoard({
      "checkout/index.tsx": "",
      "checkout/frame.json": '{"title": "Checkout", "width": 1000}',
      "checkout/mobile/index.tsx": "",
      "flow/2-two/index.tsx": "",
      "flow/10-ten/index.tsx": "",
      "flow/1-one/index.tsx": "",
      "empty/": "",
      "_components/Button/index.tsx": "",
      ".git/index.tsx": "",
    })
    const tree = scanBoard(board)
    expect(tree.items.map((i) => [i.id, i.kind])).toEqual([
      ["checkout", "frame"],
      ["empty", "group"],
      ["flow", "group"],
    ])
    const checkout = tree.items[0]!
    expect(checkout).toMatchObject({ title: "Checkout", width: 1000, height: 800 })
    expect(checkout.children.map((c) => c.id)).toEqual(["checkout/mobile"])
    // Natural sort: 1, 2, 10.
    expect(tree.items[2]!.children.map((c) => c.name)).toEqual(["1-one", "2-two", "10-ten"])
    expect(tree.items[1]!.children).toEqual([])
  })

  it("treats a folder without index.tsx as a group even if it has other files", () => {
    const board = makeBoard({ "draft/notes.md": "", "draft/Thing.tsx": "" })
    expect(scanBoard(board).items).toMatchObject([{ id: "draft", kind: "group", children: [] }])
  })

  it("surfaces a broken frame.json on the item", () => {
    const board = makeBoard({ "a/index.tsx": "", "a/frame.json": "nope" })
    expect(scanBoard(board).items[0]!.configError).toMatch(/frame\.json/)
  })
})
