import path from "node:path"

import { searchForWorkspaceRoot, type Plugin, type ViteDevServer } from "vite"

import {
  CONFIG_MODULE_ID,
  TREE_EVENT,
  TREE_MODULE_ID,
  TREE_REQUEST_EVENT,
  isHiddenName,
  type BoardTree,
  type FramewallConfig,
} from "../shared/board.ts"
import { COMMENTS_EVENT, type CommentsEvent, type CommentsFile } from "../shared/comments.ts"
import { SELECTION_DIR } from "../shared/selection.ts"
import { commentsMiddleware, watchComments } from "./comments.ts"
import { apiGuard } from "./guard.ts"
import { scanBoard } from "./scan.ts"
import { selectionMiddleware } from "./selection.ts"
import { stampJsx } from "./stamp.ts"

const RESOLVED_TREE_ID = "\0" + TREE_MODULE_ID
const RESOLVED_CONFIG_ID = "\0" + CONFIG_MODULE_ID
/** Marker in src/frame/frame.css that becomes `@source "<board dir>";`. */
const SOURCE_MARKER = "/* framewall:board-source */"
/** How long to wait for a burst of file events (mkdir -p, git checkout) to settle. */
const DEBOUNCE_MS = 40

export interface FramewallOptions {
  /** Absolute or cwd-relative path of the board folder. */
  boardDir: string
}

/**
 * The board plugin:
 * - serves `frame.html` for `/frame/<id>` page requests;
 * - exposes the folder tree as `virtual:framewall/tree` and pushes a fresh tree
 *   to every client over the HMR websocket (custom event `framewall:tree`)
 *   whenever folders, `index.tsx` files or `frame.json` files change;
 * - points the frame Tailwind build at the board folder;
 * - stamps every JSX element in board files with its source location
 *   (`data-fw-src`, see stamp.ts) for element picking;
 * - serves the element selection at `/__framewall/selection` (selection.ts) and
 *   the comment buffer at `/__framewall/comments` (comments.ts), behind a guard
 *   against requests from other sites (guard.ts).
 */
export function framewall(options: FramewallOptions): Plugin {
  const boardDir = path.resolve(options.boardDir)
  let root = process.cwd()
  let lastJson = ""
  let stamping = false

  const read = (): BoardTree => {
    const tree = scanBoard(boardDir)
    lastJson = JSON.stringify(tree)
    return tree
  }

  return {
    name: "framewall",
    enforce: "pre",

    config(userConfig) {
      return {
        resolve: { alias: { "@board": boardDir } },
        server: {
          // The canvas writes the element selection and comments here; it must not cause HMR,
          // a Tailwind rebuild or a tree rescan.
          watch: { ignored: [`**/${SELECTION_DIR}/**`] },
          fs: {
            // Setting `allow` replaces Vite's default (the workspace root), so keep it.
            allow: [
              searchForWorkspaceRoot(userConfig.root ? path.resolve(userConfig.root) : process.cwd()),
              boardDir,
            ],
          },
        },
      }
    },

    configResolved(config) {
      root = config.root
      stamping = config.command === "serve"
    },

    resolveId(id) {
      if (id === TREE_MODULE_ID) return RESOLVED_TREE_ID
      if (id === CONFIG_MODULE_ID) return RESOLVED_CONFIG_ID
    },

    load(id) {
      if (id === RESOLVED_TREE_ID) {
        read()
        return `export default ${lastJson}`
      }
      if (id === RESOLVED_CONFIG_ID) {
        const rel = path.relative(root, boardDir)
        const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
        const boardUrl = inside
          ? "/" + (rel ? rel.split(path.sep).join("/") + "/" : "")
          : "/@fs" + boardDir.split(path.sep).join("/") + "/"
        const config: FramewallConfig = { root, boardDir, boardUrl }
        return `export default ${JSON.stringify(config)}`
      }
    },

    transform(code, id) {
      const [file, query] = id.split("?")
      if (file.endsWith("/src/frame/frame.css")) {
        if (!code.includes(SOURCE_MARKER)) return
        const ignored = path.join(boardDir, SELECTION_DIR)
        return code.replace(
          SOURCE_MARKER,
          `@source ${JSON.stringify(boardDir)};\n@source not ${JSON.stringify(ignored)};`
        )
      }
      // Source stamps, before the React transform turns JSX into calls. Only plain
      // module requests (`?t=` / `?v=` cache busters are fine; `?raw` etc. are not).
      if (!stamping || !/\.[jt]sx$/.test(file) || !isInside(boardDir, file) || file.includes("/node_modules/")) return
      if (query && !query.split("&").every((p) => /^(t|v)=|^import$/.test(p))) return
      const rel = path.relative(boardDir, file).split(path.sep).join("/")
      const out = stampJsx(code, rel, file)
      return out ? { code: out.code, map: out.map } : undefined
    },

    // Vite keeps module nodes for files that were deleted. When a file comes
    // back at the same path (undo a delete, rename back, git checkout) its old
    // node has no importers and isn't self-accepting, which Vite treats as a
    // dead end and answers with a full page reload of every page, the canvas
    // included. Nodes nobody imports can't affect a page, so drop them.
    hotUpdate: {
      order: "post",
      handler({ file, modules }) {
        if (!isInside(boardDir, file)) return
        const live = modules.filter((mod) => mod.importers.size > 0 || mod.isSelfAccepting)
        return live.length === modules.length ? undefined : live
      },
    },
    configureServer(server) {
      read()
      server.watcher.add(boardDir)
      server.middlewares.use(apiGuard(() => server.config.server.allowedHosts))
      server.middlewares.use(selectionMiddleware(boardDir))
      // Every save goes to all open canvases (the one that saved it ignores its own).
      const broadcast = (file: CommentsFile, client: string | null) =>
        server.ws.send({ type: "custom", event: COMMENTS_EVENT, data: { file, client } satisfies CommentsEvent })
      server.middlewares.use(commentsMiddleware(boardDir, broadcast))
      // The CLI (or anything else) rewrote comments.json: open canvases take the new buffer.
      const stopWatching = watchComments(boardDir, (data) => {
        broadcast(data, null)
      })
      const close = server.close.bind(server)
      server.close = () => {
        stopWatching()
        return close()
      }

      // `/frame/<id>` (a page load, not a module request) renders frame.html.
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ""
        const isFramePath = url === "/frame" || url.startsWith("/frame/") || url.startsWith("/frame?")
        if (isFramePath && (req.headers.accept ?? "").includes("text/html")) {
          req.url = "/frame.html"
        }
        next()
      })

      let timer: ReturnType<typeof setTimeout> | undefined
      const schedule = () => {
        clearTimeout(timer)
        timer = setTimeout(() => pushIfChanged(server), DEBOUNCE_MS)
      }

      const pushIfChanged = (srv: ViteDevServer) => {
        const before = lastJson
        const tree = read()
        if (lastJson === before) return
        // Page loads after this point must see the new tree, not a cached transform.
        const graph = srv.environments?.client?.moduleGraph ?? srv.moduleGraph
        const mod = graph.getModuleById(RESOLVED_TREE_ID)
        if (mod) graph.invalidateModule(mod)
        srv.ws.send({ type: "custom", event: TREE_EVENT, data: tree })
        srv.config.logger.info(`[framewall] tree updated (${countItems(tree)} items)`, {
          timestamp: true,
        })
      }

      // Tailwind only re-scans the board when frame.css is transformed again, and
      // it watches files it has already seen. A brand-new file (a new frame or
      // a new shared component) would not regenerate the CSS until some other
      // edit, so reload frame.css ourselves when files appear.
      const frameCss = path.join(server.config.root, "src/frame/frame.css")
      let cssTimer: ReturnType<typeof setTimeout> | undefined
      const refreshFrameCss = () => {
        clearTimeout(cssTimer)
        cssTimer = setTimeout(() => {
          const env = server.environments.client
          for (const mod of env.moduleGraph.getModulesByFile(frameCss) ?? []) {
            // Only the copy pages import; reloading an orphan (e.g. `?direct`) would
            // make Vite fall back to a full page reload.
            if (mod.importers.size > 0) void env.reloadModule(mod)
          }
        }, DEBOUNCE_MS)
      }

      server.watcher.on("all", (event, file) => {
        const rel = path.relative(boardDir, file)
        if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return
        const parts = rel.split(path.sep)
        if (event === "add" && !parts.some((p) => p.startsWith(".") || p === "node_modules")) {
          refreshFrameCss()
        }
        if (parts.some(isHiddenName)) return
        // Content edits are HMR's job; only structure and frame.json matter here.
        if (event === "change" && parts[parts.length - 1] !== "frame.json") return
        schedule()
      })

      // A client that connected after a change (or raced the first push) asks for the tree.
      server.ws.on(TREE_REQUEST_EVENT, (_data, client) => {
        client.send(TREE_EVENT, JSON.parse(lastJson))
      })
    },
  }
}

function countItems(tree: BoardTree): number {
  let n = 0
  const walk = (items: BoardTree["items"]) => {
    for (const item of items) {
      n++
      walk(item.children)
    }
  }
  walk(tree.items)
  return n
}

function isInside(dir: string, file: string): boolean {
  const rel = path.relative(dir, file)
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}
