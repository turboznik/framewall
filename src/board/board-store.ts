import initialTree from "virtual:framewall/tree"

import { TREE_EVENT, TREE_REQUEST_EVENT, type BoardTree } from "../../shared/board"
import { createStore } from "@/lib/store"

/** The board folder tree, kept current by the framewall Vite plugin over HMR. */
export const treeStore = createStore<BoardTree>(initialTree)

/** Whether the HMR websocket (our live link to the file watcher) is up. */
export const connectedStore = createStore(true)

/** Selected frame or group ID. */
export const selectionStore = createStore<string | null>(null)

export interface FrameStatus {
  status: "loading" | "ready" | "missing" | "error"
  message?: string
}
/** Load/error status reported by each frame iframe. */
export const frameStatusStore = createStore<Record<string, FrameStatus>>({})

if (import.meta.hot) {
  import.meta.hot.on(TREE_EVENT, (tree: BoardTree) => {
    if (JSON.stringify(tree) !== JSON.stringify(treeStore.get())) treeStore.set(tree)
  })
  // Covers changes between serving the virtual module and the socket connecting.
  import.meta.hot.send(TREE_REQUEST_EVENT)
  import.meta.hot.on("vite:ws:disconnect", () => connectedStore.set(false))
  import.meta.hot.on("vite:ws:connect", () => connectedStore.set(true))
}
