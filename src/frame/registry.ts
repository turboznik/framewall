import type { ComponentType } from "react"

export interface FrameModule {
  default?: ComponentType
}
export type FrameLoader = () => Promise<FrameModule>

// Every index.tsx in the board, loaded lazily. Vite re-evaluates this glob when
// index.tsx files are added or removed and sends an HMR update for this module,
// which main.tsx accepts.
const modules = import.meta.glob<FrameModule>([
  "@board/**/index.tsx",
  "!@board/**/_*/**",
  "!@board/**/.*/**",
  "!@board/**/node_modules/**",
])

/** Keys are URL paths, e.g. `/example-board/checkout/index.tsx`. */
export const frameLoaders: Record<string, FrameLoader> = modules
