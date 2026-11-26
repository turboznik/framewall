/// <reference types="vite/client" />

declare module "virtual:framewall/tree" {
  import type { BoardTree } from "../shared/board"
  const tree: BoardTree
  export default tree
}

declare module "virtual:framewall/config" {
  import type { FramewallConfig } from "../shared/board"
  const config: FramewallConfig
  export default config
}
