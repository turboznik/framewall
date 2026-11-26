import type { ReactNode } from "react"

import { cn } from "./cn"

const tones = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  brand: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/15 dark:bg-indigo-500/15 dark:text-indigo-300",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20",
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof tones
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
