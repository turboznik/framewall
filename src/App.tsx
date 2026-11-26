import { useMemo, useState, useSyncExternalStore } from "react"

import config from "virtual:framewall/config"

import { walkItems, type BoardItem } from "../shared/board"
import { connectedStore, selectionStore, treeStore } from "@/board/board-store"
import { layoutBoard } from "@/board/layout"
import { Canvas } from "@/canvas/Canvas"
import { BoardTree } from "@/components/BoardTree"
import { SidePanel } from "@/components/SidePanel"
import { Toaster } from "@/components/Toaster"
import { TopBar } from "@/components/TopBar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia(query).matches
  )
}

/** Board folder as shown in the UI: relative to the project when it lives inside it. */
const boardPath = config.boardDir.startsWith(config.root + "/")
  ? config.boardDir.slice(config.root.length + 1) + "/"
  : config.boardDir + "/"

function SidebarBody({
  items,
  counts,
  onNavigate,
  headerClassName,
}: {
  items: BoardItem[]
  counts: { frames: number; groups: number }
  onNavigate?: () => void
  headerClassName?: string
}) {
  const connected = useStore(connectedStore)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-9 shrink-0 items-center justify-between px-3 text-xs", headerClassName)}>
        <span className="font-medium text-muted-foreground">Board</span>
        <span className="text-muted-foreground tabular-nums">
          {counts.frames} {counts.frames === 1 ? "frame" : "frames"} · {counts.groups} {counts.groups === 1 ? "group" : "groups"}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {items.length ? (
          <BoardTree items={items} onNavigate={onNavigate} />
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">No folders yet.</p>
        )}
      </ScrollArea>
      <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className={cn("size-1.5 shrink-0 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")} />
        <span className="shrink-0">{connected ? "Watching" : "Disconnected"}</span>
        <span className="min-w-0 truncate font-mono" title={config.boardDir}>
          {boardPath}
        </span>
      </div>
    </div>
  )
}

export function App() {
  const tree = useStore(treeStore)
  const selected = useStore(selectionStore)
  const layout = useMemo(() => layoutBoard(tree), [tree])
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)

  const counts = useMemo(() => {
    let frames = 0
    let groups = 0
    walkItems(tree.items, (item) => (item.kind === "frame" ? frames++ : groups++))
    return { frames, groups }
  }, [tree])

  const selectedItem = (selected && layout.byId.get(selected)?.item) || null

  return (
    <TooltipProvider delay={400}>
      <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
        <TopBar
          boardName={tree.name}
          frameCount={counts.frames}
          selectedItem={selectedItem}
          onToggleSidebar={() => (isMobile ? setSheetOpen((o) => !o) : setSidebarOpen((o) => !o))}
        />
        <div className="flex min-h-0 flex-1">
          {!isMobile && sidebarOpen && (
            <aside className="w-64 shrink-0 border-r bg-sidebar">
              <SidebarBody items={tree.items} counts={counts} />
            </aside>
          )}
          <main className="relative min-w-0 flex-1">
            <Canvas
              layout={layout}
              emptyHint={
                <div className="max-w-sm rounded-lg border bg-background/90 p-4 text-center shadow-sm">
                  <p className="text-sm font-medium">This board is empty</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Create a folder in <code className="font-mono">{boardPath}</code> with an{" "}
                    <code className="font-mono">index.tsx</code> that default-exports a component.
                    It shows up here as you save.
                  </p>
                </div>
              }
            />
            <SidePanel />
            <Toaster />
          </main>
        </div>
        {isMobile && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Board</SheetTitle>
                <SheetDescription>The board's folder tree</SheetDescription>
              </SheetHeader>
              <SidebarBody
                items={tree.items}
                counts={counts}
                onNavigate={() => setSheetOpen(false)}
                headerClassName="pr-11"
              />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </TooltipProvider>
  )
}

export default App
