import { createStore } from "@/lib/store"

/** Brief confirmations ("Copied") and undo offers, shown top-center over the canvas. */

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

export const toastStore = createStore<Toast[]>([])

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export function dismissToast(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  toastStore.set((list) => list.filter((t) => t.id !== id))
}

/** Show a toast; a newer one replaces the older ones (they are all short-lived). */
export function showToast(message: string, options: { action?: Toast["action"]; duration?: number } = {}): number {
  const id = nextId++
  for (const t of toastStore.get()) dismissToast(t.id)
  toastStore.set([{ id, message, action: options.action }])
  timers.set(
    id,
    setTimeout(() => dismissToast(id), options.duration ?? (options.action ? 6000 : 1600))
  )
  return id
}

/** Copy to the clipboard and confirm it. */
export async function copyText(text: string, message = "Copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    showToast(message)
    return true
  } catch {
    showToast("Couldn't copy: the clipboard isn't available here")
    return false
  }
}
