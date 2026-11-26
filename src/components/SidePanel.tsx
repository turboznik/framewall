import { useState } from "react"
import { ChevronDownIcon, XIcon } from "lucide-react"

import { closeComments, commentStore, showPanel, type PanelTab } from "@/board/comment-store"
import { pickStore } from "@/board/pick-store"
import { CommentsActions, CommentsList } from "@/components/CommentsPanel"
import { SelectionActions, SelectionList, SmallIconButton } from "@/components/SelectionPanel"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function Tab({ tab, current, count, children }: { tab: PanelTab; current: PanelTab; count: number; children: React.ReactNode }) {
  const active = tab === current
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-tab={tab}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-[5px] px-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => showPanel(tab)}
    >
      {children}
      <span
        className={cn(
          "min-w-4 rounded-[4px] px-1 text-[10px] leading-4 tabular-nums",
          active && count ? (tab === "comments" ? "bg-comment text-white" : "bg-selection text-white") : "text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  )
}

/**
 * The panel over the canvas: the element selection and the comment buffer, as
 * tabs. A side panel on wide screens, a bottom sheet on phones.
 */
export function SidePanel() {
  const pick = useStore(pickStore)
  const { tab, open, draft, comments } = useStore(commentStore)
  const [collapsed, setCollapsed] = useState(false)

  if (!pick.mode && !pick.items.length && !open && !draft) return null

  return (
    <section
      aria-label={tab === "comments" ? "Comments" : "Selected elements"}
      data-panel={tab}
      data-canvas-cover
      className={cn(
        "absolute z-10 flex flex-col overflow-hidden rounded-lg border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-sm",
        "inset-x-2 bottom-2 max-h-[50%] md:inset-x-auto md:top-2 md:right-2 md:bottom-auto md:max-h-[calc(100%-1rem)] md:w-[380px]"
      )}
    >
      <header className="flex h-9 shrink-0 items-center gap-0.5 pr-1.5 pl-1.5">
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronDownIcon className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} />
        </button>
        <div role="tablist" className="flex items-center gap-0.5">
          <Tab tab="selection" current={tab} count={pick.items.length}>
            Selection
          </Tab>
          <Tab tab="comments" current={tab} count={comments.length}>
            Comments
          </Tab>
        </div>
        <span className="ml-auto flex items-center gap-0.5">
          {tab === "selection" ? <SelectionActions /> : <CommentsActions />}
          {open && (
            <SmallIconButton label="Close comments" onClick={closeComments} className="size-6">
              <XIcon className="size-3.5" />
            </SmallIconButton>
          )}
        </span>
      </header>
      {!collapsed && (tab === "selection" ? <SelectionList /> : <CommentsList />)}
    </section>
  )
}
