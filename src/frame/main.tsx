import "./frame.css"

import { createRoot } from "react-dom/client"

import { installBridge } from "./bridge"
import { startBuildErrorTracking } from "./build-errors"
import { FrameHost } from "./frame-host"
import { installPicker } from "./picker"
import { frameLoaders } from "./registry"

/** `/frame/checkout/mobile` -> `checkout/mobile` */
function parseFrameId(pathname: string): string {
  return pathname
    .replace(/^\/frame\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join("/")
}

const frameId = parseFrameId(location.pathname)
document.title = frameId ? `${frameId} · framewall` : "framewall"

startBuildErrorTracking()
installBridge(frameId)
installPicker(frameId)

const root = createRoot(document.getElementById("root")!)
let loaders = frameLoaders

function render() {
  root.render(<FrameHost id={frameId} loaders={loaders} />)
}
render()

// The glob in registry.ts changes when index.tsx files come and go, and frame
// modules that can't fast-refresh propagate their update to it. Re-render with
// the new loaders instead of letting the update turn into a full page reload.
if (import.meta.hot) {
  import.meta.hot.accept("./registry", (mod) => {
    if (!mod) return
    loaders = mod.frameLoaders
    render()
  })
}
