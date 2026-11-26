import { cart, money, shipping, subtotal, tax, total } from "./data"
import { cn } from "./cn"

/** Cart lines plus totals. Used by every checkout variant. */
export function OrderSummary({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <ul className={cn("divide-y divide-zinc-200 dark:divide-zinc-800", compact ? "text-sm" : "")}>
        {cart.map((item) => (
          <li key={item.name} className={cn("flex items-center gap-4", compact ? "py-3" : "py-4")}>
            <span
              className={cn(
                "relative shrink-0 rounded-lg ring-1 ring-black/5",
                item.swatch,
                compact ? "size-11" : "size-14"
              )}
            >
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-semibold text-white">
                {item.qty}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100">{item.name}</span>
              <span className="block truncate text-xs text-zinc-500">{item.variant}</span>
            </span>
            <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
              {money(item.price * item.qty)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-2 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
        <Row label="Subtotal" value={money(subtotal)} />
        <Row label="Shipping" value={shipping === 0 ? "Free" : money(shipping)} />
        <Row label="Estimated tax" value={money(tax)} />
        <div className="flex items-baseline justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <dt className="text-base font-semibold text-zinc-900 dark:text-white">Total</dt>
          <dd className="text-xl font-semibold text-zinc-900 tabular-nums dark:text-white">
            <span className="mr-1.5 text-xs font-normal text-zinc-500">USD</span>
            {money(total)}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
      <dt>{label}</dt>
      <dd className="text-zinc-900 tabular-nums dark:text-zinc-200">{value}</dd>
    </div>
  )
}
