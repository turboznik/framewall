import config from "virtual:framewall/config"

/**
 * Tracks Vite build errors (syntax errors and the like) that concern *this*
 * frame page. The dev server broadcasts every error to every page, so an error
 * counts here only if its file was loaded by this page or it happened while
 * this page was applying an HMR update. It clears after a later update to the
 * same modules goes through cleanly.
 */

export interface BuildError {
  message: string
  file?: string
  line?: number
  column?: number
  codeFrame?: string
  plugin?: string
}

type Listener = () => void

let current: BuildError | null = null
let lastSeen: { error: BuildError; at: number } | null = null
const listeners = new Set<Listener>()
/** URL paths (no query) of every resource this page has loaded. */
const loaded = new Set<string>()
/** Update paths and error file behind the current error: a clean update to one clears it. */
let causes = new Set<string>()
let cycle: { paths: string[]; errored: boolean } | null = null

function urlPath(url: string): string {
  try {
    return new URL(url, location.href).pathname
  } catch {
    return url.split("?")[0]
  }
}

/** Absolute file path from a Vite error -> the URL path the dev server serves it at. */
function fileToUrlPath(file: string | undefined): string | undefined {
  if (!file) return undefined
  const clean = file.split("?")[0]
  if (clean.startsWith(config.root + "/")) return clean.slice(config.root.length)
  if (clean.startsWith("/")) return "/@fs" + clean
  return undefined
}

function set(next: BuildError | null) {
  current = next
  for (const listener of listeners) listener()
}

export function getBuildError(): BuildError | null {
  return current
}

/** The most recent error broadcast by the server within `maxAgeMs` (any page). */
export function getRecentError(maxAgeMs: number): BuildError | null {
  if (!lastSeen || Date.now() - lastSeen.at > maxAgeMs) return null
  return lastSeen.error
}

export function subscribeBuildError(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

interface ViteErrorPayload {
  err: {
    message: string
    stack?: string
    id?: string
    frame?: string
    plugin?: string
    loc?: { file?: string; line: number; column: number }
  }
}

interface UpdatePayload {
  updates: { type: string; path: string; acceptedPath: string }[]
}

export function startBuildErrorTracking(): void {
  try {
    performance.setResourceTimingBufferSize(10000)
  } catch {
    /* not supported */
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) loaded.add(urlPath(entry.name))
    }).observe({ type: "resource", buffered: true })
  } catch {
    /* not supported */
  }

  const hot = import.meta.hot
  if (!hot) return

  hot.on("vite:beforeUpdate", (payload: UpdatePayload) => {
    const paths = payload.updates
      .filter((u) => u.type === "js-update" && (loaded.has(u.path) || loaded.has(u.acceptedPath)))
      .map((u) => u.path)
    cycle = paths.length ? { paths, errored: false } : null
  })

  hot.on("vite:error", (payload: ViteErrorPayload) => {
    const err = payload.err
    const file = err.loc?.file ?? err.id
    const error: BuildError = {
      message: stripAnsi(err.message),
      file: file?.split("?")[0],
      line: err.loc?.line,
      column: err.loc?.column,
      codeFrame: err.frame ? stripAnsi(err.frame) : undefined,
      plugin: err.plugin,
    }
    lastSeen = { error, at: Date.now() }
    const path = fileToUrlPath(file)
    const mine = cycle !== null || (path !== undefined && loaded.has(path))
    if (!mine) return
    causes = new Set(cycle?.paths ?? [])
    if (path) causes.add(path)
    if (cycle) cycle.errored = true
    set(error)
  })

  hot.on("vite:afterUpdate", () => {
    const finished = cycle
    cycle = null
    if (!current || !finished || finished.errored) return
    if (finished.paths.some((p) => causes.has(p))) set(null)
  })
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "")
}
