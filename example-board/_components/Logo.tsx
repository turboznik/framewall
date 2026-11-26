import { cn } from "./cn"

/** The fictional "Lumen" brand used across the sample board. */
export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect width="24" height="24" rx="7" className="fill-indigo-600 dark:fill-indigo-500" />
        <path d="M8 6.5v11h8" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="8" r="1.8" fill="white" />
      </svg>
      {!mark && <span>Lumen</span>}
    </span>
  )
}
