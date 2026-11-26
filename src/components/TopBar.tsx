import { useSyncExternalStore } from "react"
import {
  CopyIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  MinusIcon,
  MoonIcon,
  PanelLeftIcon,
  PlusIcon,
  ScanIcon,
  SquareDashedMousePointerIcon,
  SunIcon,
} from "lucide-react"

import { frameUrl, type BoardItem } from "../../shared/board"
import { formatRef } from "../../shared/refs"
import { connectedStore } from "@/board/board-store"
import { commentStore, startComment, toggleComments } from "@/board/comment-store"
import { pickStore, togglePickMode } from "@/board/pick-store"
import { fitAll } from "@/canvas/actions"
import { cameraStore, steppedZoom, zoomCenter } from "@/canvas/camera"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useStore } from "@/lib/store"
import { copyText } from "@/lib/toast"
import { cn } from "@/lib/utils"

function IconButton({
  label,
  shortcut,
  onClick,
  children,
  className,
}: {
  label: string
  shortcut?: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className={className}>
            {children}
          </Button>
        }
      />
      <TooltipContent side="bottom">
        {label}
        {shortcut && <kbd className="font-mono text-[10px] opacity-60">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

function SelectModeToggle() {
  const { mode, items } = useStore(pickStore)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="default"
            aria-label="Select elements"
            aria-pressed={mode}
            onClick={togglePickMode}
            className={cn(
              "gap-1.5 px-2",
              mode && "bg-selection/12 text-selection hover:bg-selection/18 hover:text-selection dark:hover:bg-selection/20"
            )}
          >
            <SquareDashedMousePointerIcon />
            <span className="hidden sm:inline">Select</span>
            {items.length > 0 && (
              <span
                className={cn(
                  "min-w-4 rounded-[4px] px-1 text-[10px] leading-4 font-semibold tabular-nums",
                  mode ? "bg-selection text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {items.length}
              </span>
            )}
          </Button>
        }
      />
      <TooltipContent side="bottom">
        {mode ? "Exit select mode" : "Select elements"} <kbd className="font-mono text-[10px] opacity-60">S</kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function CommentsToggle() {
  const { comments, open, tab } = useStore(commentStore)
  const shown = open && tab === "comments"
  const stale = comments.filter((c) => c.target.stale).length
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="default"
            aria-label={`Comments (${comments.length})`}
            aria-pressed={shown}
            data-comments-toggle
            onClick={toggleComments}
            className={cn(
              "gap-1.5 px-2",
              shown && "bg-comment/12 text-comment-ink hover:bg-comment/18 hover:text-comment-ink dark:hover:bg-comment/20"
            )}
          >
            <MessageSquareIcon />
            <span className="hidden sm:inline">Comments</span>
            {comments.length > 0 && (
              <span
                data-comment-count
                className="min-w-4 rounded-[4px] bg-comment px-1 text-[10px] leading-4 font-semibold text-white tabular-nums"
              >
                {comments.length}
              </span>
            )}
          </Button>
        }
      />
      <TooltipContent side="bottom">
        {shown ? "Hide comments" : "Show comments"}
        {stale > 0 && <span className="opacity-70"> · {stale} stale</span>}
      </TooltipContent>
    </Tooltip>
  )
}

function useZoomPercent(): number {
  return useSyncExternalStore(cameraStore.subscribe, () => Math.round(cameraStore.get().z * 100))
}

function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme()
  const systemDark = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  )
  return theme === "system" ? (systemDark ? "dark" : "light") : theme
}

export function TopBar({
  boardName,
  frameCount,
  selectedItem,
  onToggleSidebar,
}: {
  boardName: string
  frameCount: number
  selectedItem: BoardItem | null
  onToggleSidebar: () => void
}) {
  const zoom = useZoomPercent()
  const connected = useStore(connectedStore)
  const { setTheme } = useTheme()
  const resolved = useResolvedTheme()

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b bg-background px-1.5">
      <IconButton label="Toggle sidebar" onClick={onToggleSidebar}>
        <PanelLeftIcon />
      </IconButton>
      <div className="flex min-w-0 items-center gap-2 pl-1">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-foreground text-[10px] font-bold text-background">
          fw
        </span>
        <span className="hidden text-[13px] font-semibold sm:inline">framewall</span>
        <span className="hidden text-muted-foreground/60 sm:inline">/</span>
        <span className="truncate text-[13px] font-medium">{boardName}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums md:inline">
          {frameCount} {frameCount === 1 ? "frame" : "frames"}
        </span>
      </div>

      {selectedItem && (
        <>
          <Separator orientation="vertical" className="mx-2 hidden h-5 lg:block" />
          <div className="hidden min-w-0 items-center gap-1.5 lg:flex">
            <span className="truncate font-mono text-xs">{selectedItem.id}</span>
            {selectedItem.kind === "frame" && (
              <>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {selectedItem.width}×{selectedItem.height}
                </span>
                <Button variant="ghost" size="sm" onClick={() => startComment({ kind: "frame", frame: selectedItem.id })}>
                  <MessageSquarePlusIcon />
                  Comment
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyText(formatRef({ kind: "frame", frame: selectedItem.id }))}
                >
                  <CopyIcon />
                  Copy reference
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<a href={frameUrl(selectedItem.id)} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLinkIcon />
                  Open
                </Button>
              </>
            )}
          </div>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <span
          className={cn(
            "mr-2 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex",
            !connected && "text-destructive"
          )}
          title={connected ? "Watching the board folder for changes" : "Lost the connection to the dev server"}
        >
          <span
            className={cn("size-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-destructive")}
          />
          {connected ? "Live" : "Offline"}
        </span>
        <SelectModeToggle />
        <CommentsToggle />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <IconButton label="Zoom out" shortcut="-" onClick={() => zoomCenter(steppedZoom(cameraStore.get().z, -1))}>
          <MinusIcon />
        </IconButton>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="w-12 justify-center px-0 text-xs tabular-nums"
                aria-label="Reset zoom to 100%"
                onClick={() => zoomCenter(1)}
              >
                {zoom}%
              </Button>
            }
          />
          <TooltipContent side="bottom">
            Zoom to 100% <kbd className="font-mono text-[10px] opacity-60">⇧0</kbd>
          </TooltipContent>
        </Tooltip>
        <IconButton label="Zoom in" shortcut="+" onClick={() => zoomCenter(steppedZoom(cameraStore.get().z, 1))}>
          <PlusIcon />
        </IconButton>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="default" onClick={() => fitAll()} aria-label="Zoom to fit">
                <ScanIcon />
                <span className="hidden sm:inline">Fit</span>
              </Button>
            }
          />
          <TooltipContent side="bottom">
            Zoom to fit <kbd className="font-mono text-[10px] opacity-60">⇧1</kbd>
          </TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <IconButton
          label={resolved === "dark" ? "Light mode" : "Dark mode"}
          shortcut="D"
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        >
          {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </div>
    </header>
  )
}
