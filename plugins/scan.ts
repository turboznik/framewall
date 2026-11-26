import fs from "node:fs"
import path from "node:path"

import {
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_WIDTH,
  MAX_FRAME_SIZE,
  MIN_FRAME_SIZE,
  isHiddenName,
  type BoardItem,
  type BoardTree,
} from "../shared/board.ts"

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

/** Read the board folder into a tree. Never throws: unreadable parts are skipped. */
export function scanBoard(boardDir: string): BoardTree {
  return { name: path.basename(boardDir), items: scanDir(boardDir, "") }
}

function scanDir(absDir: string, parentId: string): BoardItem[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && !isHiddenName(e.name))
    .map((e) => e.name)
    .sort(collator.compare)
    .map((name) => scanItem(path.join(absDir, name), name, parentId ? `${parentId}/${name}` : name))
}

function scanItem(absDir: string, name: string, id: string): BoardItem {
  const isFrame = isFile(path.join(absDir, "index.tsx"))
  const config = readFrameConfig(absDir)
  return {
    id,
    name,
    kind: isFrame ? "frame" : "group",
    ...(config.title ? { title: config.title } : {}),
    width: isFrame ? config.width : 0,
    height: isFrame ? config.height : 0,
    ...(config.error ? { configError: config.error } : {}),
    children: scanDir(absDir, id),
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

interface FrameConfig {
  width: number
  height: number
  title?: string
  error?: string
}

export function parseFrameConfig(text: string): FrameConfig {
  const config: FrameConfig = { width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT }
  let raw: unknown
  try {
    raw = text.trim() === "" ? {} : JSON.parse(text)
  } catch (err) {
    return { ...config, error: `frame.json: ${(err as Error).message}` }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...config, error: "frame.json must contain an object" }
  }
  const obj = raw as Record<string, unknown>
  const problems: string[] = []
  for (const key of ["width", "height"] as const) {
    const value = obj[key]
    if (value === undefined) continue
    if (typeof value !== "number" || !Number.isFinite(value)) {
      problems.push(`${key} must be a number`)
      continue
    }
    config[key] = Math.round(Math.min(MAX_FRAME_SIZE, Math.max(MIN_FRAME_SIZE, value)))
  }
  if (obj.title !== undefined) {
    if (typeof obj.title === "string") config.title = obj.title.trim() || undefined
    else problems.push("title must be a string")
  }
  if (problems.length) config.error = `frame.json: ${problems.join(", ")}`
  return config
}

function readFrameConfig(absDir: string): FrameConfig {
  let text: string
  try {
    text = fs.readFileSync(path.join(absDir, "frame.json"), "utf8")
  } catch {
    return { width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT }
  }
  return parseFrameConfig(text)
}
