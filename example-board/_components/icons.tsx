import type { SVGProps } from "react"

/** A few inline icons so the board has no extra dependencies. */
function Icon({ d, ...props }: SVGProps<SVGSVGElement> & { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
      {...props}
    >
      <path d={d} />
    </svg>
  )
}

export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" {...p} />
)
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M5 12.5l4.5 4.5L19 7.5" {...p} />
export const CardIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M3 6h18v12H3zM3 10h18" {...p} />
export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M19 12H5m6-6l-6 6 6 6" {...p} />
export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M5 12h14m-6-6l6 6-6 6" {...p} />
export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M6 9l6 6 6-6" {...p} />
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2l-4-4" {...p} />
export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" {...p} />
)
export const HomeIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" {...p} />
export const ChartIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M4 20V10m6 10V4m6 16v-7m4 7H3" {...p} />
export const BoxIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10" {...p} />
export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3" {...p} />
)
export const SettingsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon d="M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4" {...p} />
)
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M12 5v14M5 12h14" {...p} />
export const SparkIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" {...p} />
)
