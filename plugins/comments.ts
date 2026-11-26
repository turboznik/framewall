/**
 * The comment buffer endpoint: the canvas reads and writes its pending comments
 * at `GET|PUT /__framewall/comments`, stored in
 * `BOARD_DIR/.framewall/comments.json` so agents (and `framewall comments`)
 * can read them without the canvas. `?format=xml` returns what Copy all copies.
 *
 * `.framewall/` is excluded from Vite's watcher and from Tailwind (see
 * framewall.ts), so saving never rebuilds the tree or reloads a frame. A small
 * `fs.watch` of its own notices when something else rewrites the file (the CLI's
 * `--clear`) and tells open canvases over the HMR socket.
 */

import { mkdirSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"

import { COMMENTS_ENDPOINT, COMMENTS_FILE, cleanComments, formatComments, type CommentsFile } from "../shared/comments.ts"
import { SELECTION_DIR } from "../shared/selection.ts"
import { readBody, send } from "./selection.ts"

export function commentsPath(boardDir: string): string {
  return path.join(boardDir, SELECTION_DIR, COMMENTS_FILE)
}

export function emptyComments(boardDir: string): CommentsFile {
  return { version: 1, board: boardDir, updatedAt: new Date(0).toISOString(), comments: [] }
}

/** Parse the file's text; anything malformed is dropped, a broken file reads as empty. */
export function parseComments(boardDir: string, text: string | null): CommentsFile {
  if (text === null) return emptyComments(boardDir)
  try {
    const data = JSON.parse(text) as Partial<CommentsFile>
    return {
      version: 1,
      board: boardDir,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
      comments: cleanComments(data.comments),
    }
  } catch {
    return emptyComments(boardDir)
  }
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8")
  } catch {
    return null
  }
}

export function readComments(boardDir: string): CommentsFile {
  return parseComments(boardDir, readText(commentsPath(boardDir)))
}

/** Text of the last write per board, so the watcher can tell our writes from others. */
const lastWritten = new Map<string, string>()

export function writeComments(boardDir: string, raw: unknown): CommentsFile {
  const data: CommentsFile = { version: 1, board: boardDir, updatedAt: new Date().toISOString(), comments: cleanComments(raw) }
  const file = commentsPath(boardDir)
  mkdirSync(path.dirname(file), { recursive: true })
  const text = JSON.stringify(data, null, 2) + "\n"
  lastWritten.set(boardDir, text)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
  return data
}

/**
 * Call `onChange` when comments.json changes on disk and the change isn't one
 * of our own writes. Returns a function that stops watching.
 */
export function watchComments(boardDir: string, onChange: (data: CommentsFile) => void): () => void {
  const dir = path.join(boardDir, SELECTION_DIR)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return () => {}
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = () => {
    const text = readText(commentsPath(boardDir)) ?? ""
    if (text === (lastWritten.get(boardDir) ?? null)) return
    lastWritten.set(boardDir, text)
    onChange(parseComments(boardDir, text || null))
  }
  // Seed with what is there now, so the first event compares against it.
  lastWritten.set(boardDir, readText(commentsPath(boardDir)) ?? "")
  let watcher: ReturnType<typeof watch> | null = null
  try {
    watcher = watch(dir, (_event, name) => {
      if (name && name !== COMMENTS_FILE) return
      clearTimeout(timer)
      timer = setTimeout(check, 60)
    })
    watcher.on("error", () => {})
    // Never keep the process alive for this (vitest loads the plugin too).
    watcher.unref()
  } catch {
    /* no fs.watch: the canvas still works, it just won't see outside edits live */
  }
  return () => {
    clearTimeout(timer)
    watcher?.close()
  }
}

/**
 * Connect middleware for `COMMENTS_ENDPOINT`. `onWrite` gets each saved buffer
 * and the id of the canvas that saved it (so other open canvases can follow).
 */
export function commentsMiddleware(boardDir: string, onWrite?: (data: CommentsFile, client: string | null) => void) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (url.pathname !== COMMENTS_ENDPOINT) return next()
    if (req.method === "GET") {
      const data = readComments(boardDir)
      if (url.searchParams.get("format") === "xml") return send(res, 200, formatComments(boardDir, data.comments) + "\n", "text/plain")
      return send(res, 200, JSON.stringify(data))
    }
    if (req.method === "PUT" || req.method === "POST") {
      readBody(req)
        .then((body) => {
          const parsed = JSON.parse(body) as { comments?: unknown; client?: unknown }
          if (!Array.isArray(parsed.comments)) return send(res, 400, JSON.stringify({ error: "expected { comments: [] }" }))
          const data = writeComments(boardDir, parsed.comments)
          send(res, 200, JSON.stringify(data))
          onWrite?.(data, typeof parsed.client === "string" ? parsed.client : null)
        })
        .catch((err: Error) => send(res, 400, JSON.stringify({ error: err.message })))
      return
    }
    send(res, 405, JSON.stringify({ error: "method not allowed" }))
  }
}
