import type { ReactNode } from "react"

import { Avatar } from "../_components/Avatar"
import { BellIcon, BoxIcon, ChartIcon, HomeIcon, SearchIcon, SettingsIcon, UsersIcon } from "../_components/icons"
import { Logo } from "../_components/Logo"
import { cn } from "../_components/cn"

const nav = [
  { label: "Overview", icon: HomeIcon },
  { label: "Orders", icon: BoxIcon },
  { label: "Analytics", icon: ChartIcon },
  { label: "Customers", icon: UsersIcon },
  { label: "Settings", icon: SettingsIcon },
]

export function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full bg-zinc-50 text-zinc-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-4">
        <Logo className="px-2" />
        <nav className="mt-6 space-y-0.5">
          {nav.map(({ label, icon: Icon }, i) => (
            <span
              key={label}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                i === 0 ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600"
              )}
            >
              <Icon /> {label}
            </span>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 rounded-lg p-2">
          <Avatar name="Maya Okafor" className="size-7" />
          <span className="min-w-0 text-xs">
            <span className="block font-medium">Maya Okafor</span>
            <span className="block truncate text-zinc-500">Acme Design</span>
          </span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <h1 className="font-semibold">{title}</h1>
          <div className="flex items-center gap-3">
            <span className="flex w-64 items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-400">
              <SearchIcon /> Search…
              <kbd className="ml-auto font-mono text-[10px]">⌘K</kbd>
            </span>
            <BellIcon className="size-5 text-zinc-500" />
            {actions}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
