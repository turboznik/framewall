import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { formatComments, type Comment } from "../shared/comments.ts"
import { commentsPath, readComments, watchComments, writeComments } from "./comments.ts"

const cli = fileURLToPath(new URL("../bin/framewall", import.meta.url))
let board: string

beforeEach(() => {
  board = mkdtempSync(path.join(tmpdir(), "framewall-comments-"))
})

afterEach(() => rmSync(board, { recursive: true, force: true }))

const comment = (id: string, text: string): Comment => ({
  id,
  target: { kind: "frame", frame: "pricing" },
  body: [{ type: "text", text }],
  createdAt: "2026-11-22T00:00:00.000Z",
})

const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args, "--board", board], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

describe("comments file", () => {
  it("starts empty when there is no file", () => {
    expect(readComments(board).comments).toEqual([])
    expect(existsSync(commentsPath(board))).toBe(false)
  })

  it("writes into .framewall/ and reads back what it wrote", () => {
    const saved = writeComments(board, [comment("a", "hello"), { junk: true }])
    expect(saved.comments).toHaveLength(1)
    expect(commentsPath(board)).toBe(path.join(board, ".framewall", "comments.json"))
    expect(JSON.parse(readFileSync(commentsPath(board), "utf8")).comments[0].id).toBe("a")
    expect(readComments(board).comments).toEqual([comment("a", "hello")])
  })

  it("reads a broken file as empty", () => {
    writeComments(board, [])
    writeFileSync(commentsPath(board), "{ nope")
    expect(readComments(board).comments).toEqual([])
  })
})

describe("framewall comments (CLI)", () => {
  it("prints the same XML as Copy all, --json the raw file, --clear empties it", () => {
    writeComments(board, [comment("a", "Too <tight> & small"), comment("b", "second")])
    expect(run("comments")).toBe(formatComments(board, readComments(board).comments) + "\n")
    expect(JSON.parse(run("comments", "--json")).comments).toHaveLength(2)
    run("comments", "--clear")
    expect(readComments(board).comments).toEqual([])
    expect(run("comments")).toBe("")
  })
})

describe("watchComments", () => {
  it("reports outside changes but not our own writes", async () => {
    writeComments(board, [comment("a", "one")])
    const seen: number[] = []
    const stop = watchComments(board, (data) => seen.push(data.comments.length))
    try {
      writeComments(board, [comment("a", "one"), comment("b", "two")])
      await new Promise((r) => setTimeout(r, 250))
      expect(seen).toEqual([])
      run("comments", "--clear")
      for (let i = 0; i < 40 && !seen.length; i++) await new Promise((r) => setTimeout(r, 50))
      expect(seen).toEqual([0])
    } finally {
      stop()
    }
  })
})
