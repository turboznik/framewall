import {
  Component,
  useEffect,
  useCallback,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react"

import config from "virtual:framewall/config"

import { postToCanvas } from "./bridge"
import {
  getBuildError,
  getRecentError,
  stripAnsi,
  subscribeBuildError,
  type BuildError,
} from "./build-errors"
import type { FrameLoader, FrameModule } from "./registry"

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; Component: ComponentType }
  | { status: "failed"; error: BuildError; title: string }

export function frameModuleKey(id: string): string {
  return `${config.boardUrl}${id}/index.tsx`
}

function isComponent(value: unknown): value is ComponentType {
  return (
    typeof value === "function" ||
    (typeof value === "object" && value !== null && "$$typeof" in value)
  )
}

/** Explain a failed dynamic import: prefer the error the dev server just broadcast. */
async function describeLoadError(id: string, err: unknown): Promise<BuildError> {
  const recent = getRecentError(5000)
  if (recent) return recent
  try {
    const res = await fetch(frameModuleKey(id), { cache: "no-store" })
    if (!res.ok) {
      const text = stripAnsi(await res.text())
      return { message: text.slice(0, 4000) || `HTTP ${res.status}` }
    }
  } catch {
    /* fall through */
  }
  return { message: err instanceof Error ? err.message : String(err) }
}

function useBuildError() {
  return useSyncExternalStore(subscribeBuildError, getBuildError)
}

export function FrameHost({
  id,
  loaders,
}: {
  id: string
  loaders: Record<string, FrameLoader>
}) {
  const loader = id ? loaders[frameModuleKey(id)] : undefined
  const [loadState, setState] = useState<LoadState>({ status: "loading" })
  const state: LoadState = loader ? loadState : { status: "missing" }
  const [attempt, setAttempt] = useState(0)
  const [renderError, setRenderError] = useState<Error | null>(null)
  const [boundaryKey, setBoundaryKey] = useState(0)
  const buildError = useBuildError()
  const clearRenderError = useCallback(() => setRenderError(null), [])

  // Load (or reload) the frame module.
  useEffect(() => {
    if (!loader) return
    let cancelled = false
    // Browsers cache failed module imports, so after a failure (e.g. a broken
    // shared component that has since been fixed) retry under a fresh URL.
    const load = (): Promise<FrameModule> =>
      loader().catch(() => import(/* @vite-ignore */ `${frameModuleKey(id)}?t=${Date.now()}`))
    load().then(
      (mod) => {
        if (cancelled) return
        if (isComponent(mod.default)) {
          const Component = mod.default
          setState({ status: "ready", Component })
          // A new component gets a fresh boundary, so a previous crash doesn't stick.
          setRenderError(null)
          setBoundaryKey((k) => k + 1)
        } else {
          setState({
            status: "failed",
            title: "No default export",
            error: {
              message: `${id}/index.tsx must default-export a React component.`,
              file: `${id}/index.tsx`,
            },
          })
        }
      },
      async (err) => {
        const error = await describeLoadError(id, err)
        if (!cancelled) setState({ status: "failed", title: "Failed to load", error })
      }
    )
    return () => {
      cancelled = true
    }
  }, [id, loader, attempt])

  // After any HMR update: retry a failed load, and give a crashed render another go.
  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return
    const onUpdate = () => {
      if (state.status === "failed") setAttempt((n) => n + 1)
      if (renderError) {
        setRenderError(null)
        setBoundaryKey((k) => k + 1)
      }
    }
    hot.on("vite:afterUpdate", onUpdate)
    return () => hot.off("vite:afterUpdate", onUpdate)
  }, [state.status, renderError])

  // Report status to the canvas.
  const error = buildError ?? (state.status === "failed" ? state.error : null) ?? renderError
  const reported = error ? "error" : state.status === "failed" ? "error" : state.status
  const message = error?.message
  useEffect(() => {
    postToCanvas({ type: "status", id, status: reported, message })
  }, [id, reported, message])

  let content: ReactNode = null
  if (state.status === "missing") {
    content = <MissingFrame id={id} />
  } else if (state.status === "failed") {
    content = <ErrorPanel kind={state.title} error={state.error} />
  } else if (state.status === "ready") {
    const Frame = state.Component
    content = (
      <FrameErrorBoundary key={boundaryKey} onError={setRenderError} onRecover={clearRenderError}>
        <Frame />
      </FrameErrorBoundary>
    )
  }

  return (
    <>
      {content}
      {renderError && state.status === "ready" && (
        <ErrorPanel
          kind="Runtime error"
          error={{ message: renderError.message, codeFrame: renderError.stack }}
        />
      )}
      {buildError && <ErrorPanel kind="Build error" error={buildError} overlay />}
    </>
  )
}

/**
 * Catches render errors in a frame. After a fix, Fast Refresh remounts a
 * failed boundary by itself; mounting cleanly reports the recovery.
 */
class FrameErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void; onRecover: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  /** Marks the top of the frame's own tree for the element picker's fiber walk. */
  static framewallBoundary = true

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  componentDidMount() {
    if (!this.state.failed) this.props.onRecover()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function MissingFrame({ id }: { id: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 p-6 font-sans">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-zinc-900">No frame here yet</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {id ? (
            <>
              Waiting for <code className="font-mono text-zinc-700">{id}/index.tsx</code> to
              default-export a component.
            </>
          ) : (
            <>
              Open <code className="font-mono text-zinc-700">/frame/&lt;frame id&gt;</code>.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function ErrorPanel({
  kind,
  error,
  overlay = false,
}: {
  kind: string
  error: BuildError
  overlay?: boolean
}) {
  const location = error.file
    ? `${relativeFile(error.file)}${error.line ? `:${error.line}:${error.column ?? 0}` : ""}`
    : null
  return (
    <div
      role="alert"
      className={
        "inset-0 z-[2147483647] overflow-auto p-4 font-sans text-zinc-900 sm:p-6 " +
        (overlay ? "fixed bg-white/90 backdrop-blur-sm" : "fixed bg-white")
      }
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
          <span className="size-2 rounded-full bg-red-500" />
          {kind}
        </div>
        {location && <p className="mt-1 font-mono text-xs text-zinc-500">{location}</p>}
        <pre className="mt-3 overflow-auto rounded-md border border-red-200 bg-red-50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-red-900">
          {error.message}
        </pre>
        {error.codeFrame && (
          <pre className="mt-2 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
            {error.codeFrame}
          </pre>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          {overlay
            ? "Showing the last good render underneath. Fix the file and save; the frame updates on its own."
            : "Fix the file and save; the frame updates on its own."}
        </p>
      </div>
    </div>
  )
}

function relativeFile(file: string): string {
  if (file.startsWith(config.boardDir + "/")) return file.slice(config.boardDir.length + 1)
  if (file.startsWith(config.root + "/")) return file.slice(config.root.length + 1)
  return file
}
