import { CheckIcon } from "lucide-react"

import { dismissToast, toastStore } from "@/lib/toast"
import { useStore } from "@/lib/store"

export function Toaster() {
  const toasts = useStore(toastStore)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-2 z-30 flex flex-col items-center gap-2 px-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-toast
          className="pointer-events-auto flex max-w-full items-center gap-2 rounded-md border bg-popover py-1.5 pr-1.5 pl-3 text-xs text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-top-1"
        >
          {!toast.action && <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
          <span className="min-w-0 truncate py-0.5">{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              className="shrink-0 rounded-sm px-1.5 py-0.5 font-medium text-comment-ink hover:bg-comment/10 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => {
                toast.action!.run()
                dismissToast(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          ) : (
            <span className="w-1.5" />
          )}
        </div>
      ))}
    </div>
  )
}
