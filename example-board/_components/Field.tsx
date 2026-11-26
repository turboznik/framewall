import type { ComponentProps, ReactNode } from "react"

import { cn } from "./cn"

export const inputClass =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs ring-1 ring-zinc-300 ring-inset placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none dark:bg-zinc-900 dark:text-white dark:ring-zinc-700 dark:placeholder:text-zinc-500"

export function Field({
  label,
  hint,
  trailing,
  className,
  ...props
}: ComponentProps<"input"> & { label?: string; hint?: string; trailing?: ReactNode }) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
      )}
      <span className="relative block">
        <input className={cn(inputClass, trailing ? "pr-10" : "")} {...props} />
        {trailing && (
          <span className="absolute inset-y-0 right-3 flex items-center text-zinc-400">{trailing}</span>
        )}
      </span>
      {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}
