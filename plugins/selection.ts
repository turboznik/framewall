/**
 * The selection endpoint: the canvas reads and writes the current element
 * selection at `GET|PUT /__framewall/selection`, stored in
 * `BOARD_DIR/.framewall/selection.json` so agents (and `framewall selection`)
 * can read it without the canvas. The server fills in each item's snippet from
 * the source at its "used at" location.
 *
 * The `.framewall` folder is excluded from Vite's watcher (see framewall.ts),
 * so writing the file never rebuilds the tree or reloads a frame.
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"

import {
  SELECTION_DIR,
  SELECTION_ENDPOINT,
  SELECTION_FILE,
  type SelectionFile,
  type SelectionItem,
  type SourceLoc,
} from "../shared/selection.ts"
import { cleanKey, formatSelection } from "../shared/refs.ts"
import { jsxSnippet } from "./stamp.ts"

const MAX_BODY = 1024 * 1024

export function selectionPath(boardDir: string): string {
  return path.join(boardDir, SELECTION_DIR, SELECTION_FILE)
}

export function emptySelection(boardDir: string): SelectionFile {
  return { version: 1, board: boardDir, updatedAt: new Date(0).toISOString(), items: [] }
}

export function readSelection(boardDir: string): SelectionFile {
  try {
    const data = JSON.parse(readFileSync(selectionPath(boardDir), "utf8")) as SelectionFile
    if (data && Array.isArray(data.items)) return data
  } catch {
    /* missing or invalid: start empty */
  }
  return emptySelection(boardDir)
}

/** Source files by path, re-read when their mtime changes. */
const sourceCache = new Map<string, { mtimeMs: number; code: string }>()

function readSource(file: string): string | null {
  try {
    const { mtimeMs } = statSync(file)
    const cached = sourceCache.get(file)
    if (cached && cached.mtimeMs === mtimeMs) return cached.code
    const code = readFileSync(file, "utf8")
    sourceCache.set(file, { mtimeMs, code })
    return code
  } catch {
    return null
  }
}

function snippetFor(boardDir: string, loc: SourceLoc | null): string | null {
  if (!loc) return null
  const file = path.resolve(boardDir, loc.file)
  if (!file.startsWith(boardDir + path.sep)) return null
  const code = readSource(file)
  return code === null ? null : jsxSnippet(code, loc.line, loc.col)
}

const isLoc = (v: unknown): v is SourceLoc =>
  !!v && typeof v === "object" && typeof (v as SourceLoc).file === "string" && Number.isInteger((v as SourceLoc).line) && Number.isInteger((v as SourceLoc).col)

/** Keep the fields we know, with the types we expect. */
function cleanItem(raw: unknown): Omit<SelectionItem, "snippet"> | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const key = cleanKey(r.key)
  if (typeof r.uid !== "string" || typeof r.frameId !== "string" || !key) return null
  const str = (v: unknown) => (typeof v === "string" ? v : "")
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d)
  return {
    uid: r.uid,
    frameId: r.frameId,
    name: str(r.name),
    tag: str(r.tag),
    crumbs: Array.isArray(r.crumbs) ? r.crumbs.filter((c): c is string => typeof c === "string") : [],
    usedAt: isLoc(r.usedAt) ? { file: r.usedAt.file, line: r.usedAt.line, col: r.usedAt.col } : null,
    definedIn: isLoc(r.definedIn) ? { file: r.definedIn.file, line: r.definedIn.line, col: r.definedIn.col } : null,
    nth: num(r.nth, 1),
    count: num(r.count, 1),
    key,
    ...(r.stale === true ? { stale: true } : {}),
  }
}

export function writeSelection(boardDir: string, rawItems: unknown[]): SelectionFile {
  const items = rawItems
    .map(cleanItem)
    .filter((item) => item !== null)
    .map((item) => ({ ...item, snippet: snippetFor(boardDir, item.usedAt) }))
  const data: SelectionFile = { version: 1, board: boardDir, updatedAt: new Date().toISOString(), items }
  const file = selectionPath(boardDir)
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n")
  renameSync(tmp, file)
  return data
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error("body too large"))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

export function send(res: ServerResponse, status: number, body: string, type = "application/json") {
  res.statusCode = status
  res.setHeader("Content-Type", `${type}; charset=utf-8`)
  res.setHeader("Cache-Control", "no-store")
  res.end(body)
}

/** Connect middleware for `SELECTION_ENDPOINT`. `?format=text` returns the reference tags. */
export function selectionMiddleware(boardDir: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (url.pathname !== SELECTION_ENDPOINT) return next()
    if (req.method === "GET") {
      const data = readSelection(boardDir)
      if (url.searchParams.get("format") === "text") return send(res, 200, formatSelection(data.items) + "\n", "text/plain")
      return send(res, 200, JSON.stringify(data))
    }
    if (req.method === "PUT" || req.method === "POST") {
      readBody(req)
        .then((body) => {
          const parsed = JSON.parse(body) as { items?: unknown }
          if (!Array.isArray(parsed.items)) return send(res, 400, JSON.stringify({ error: "expected { items: [] }" }))
          send(res, 200, JSON.stringify(writeSelection(boardDir, parsed.items)))
        })
        .catch((err: Error) => send(res, 400, JSON.stringify({ error: err.message })))
      return
    }
    send(res, 405, JSON.stringify({ error: "method not allowed" }))
  }
}
