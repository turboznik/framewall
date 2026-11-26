import { Button } from "../../_components/Button"
import { Field } from "../../_components/Field"
import { LockIcon } from "../../_components/icons"
import { Logo } from "../../_components/Logo"
import { OrderSummary } from "../../_components/OrderSummary"
import { money, total } from "../../_components/data"
import { cn } from "../../_components/cn"

/** Single-card checkout. The dark variant renders this with `dark`. */
export function CompactCheckout({ dark = false }: { dark?: boolean }) {
  return (
    <div className={cn(dark && "dark", "h-full")}>
      <div className="flex h-full items-center justify-center bg-zinc-100 p-8 dark:bg-zinc-950">
        <div className="grid w-full max-w-3xl grid-cols-[1fr_300px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 shadow-zinc-900/5 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          <div className="p-8">
            <Logo className="text-zinc-900 dark:text-white" />
            <h1 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">Pay with card</h1>
            <p className="mt-1 text-sm text-zinc-500">You won’t be charged until you review the order.</p>
            <div className="mt-6 space-y-4">
              <Field label="Email" defaultValue="maya@example.com" />
              <Field label="Card information" defaultValue="4242 4242 4242 4242" trailing={<LockIcon />} />
              <div className="grid grid-cols-2 gap-4">
                <Field placeholder="MM / YY" defaultValue="08 / 28" />
                <Field placeholder="CVC" />
              </div>
              <Field label="Country" defaultValue="United States" />
            </div>
            <Button size="lg" className="mt-6 w-full">
              Pay {money(total)}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
              <LockIcon className="size-3" /> Secured by Lumen Pay
            </p>
          </div>
          <div className="border-l border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-950/40">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Your order</h2>
            <OrderSummary compact className="mt-2" />
          </div>
        </div>
      </div>
    </div>
  )
}
