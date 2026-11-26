import { cn } from "./cn"

const colors = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
]

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
  const color = colors[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % colors.length]
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        color,
        className
      )}
    >
      {initials}
    </span>
  )
}
