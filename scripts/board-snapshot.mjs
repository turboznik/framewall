// The end-to-end scripts edit, add and remove board files while the canvas is open.
// snapshotBoard() remembers the board; the function it returns puts it back.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const STATE_DIR = ".framewall"

function walk(root) {
  const dirs = new Set()
  const files = new Map()
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (dir === root && entry.name === STATE_DIR) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        dirs.add(full)
        visit(full)
      } else files.set(full, readFileSync(full))
    }
  }
  visit(root)
  return { dirs, files }
}

/** Remember every file under `board` (except its state folder); call the result to restore them. */
export function snapshotBoard(board) {
  const before = walk(board)
  const restore = () => {
    const now = walk(board)
    for (const dir of now.dirs) if (!before.dirs.has(dir)) rmSync(dir, { recursive: true, force: true })
    for (const file of now.files.keys()) if (!before.files.has(file)) rmSync(file, { force: true })
    for (const dir of before.dirs) mkdirSync(dir, { recursive: true })
    for (const [file, data] of before.files) {
      let current = null
      try {
        current = readFileSync(file)
      } catch {
        /* deleted */
      }
      if (!current?.equals(data)) writeFileSync(file, data)
    }
  }
  // Also when a script throws or is interrupted.
  process.on("exit", restore)
  process.once("SIGINT", () => process.exit(130))
  return restore
}
