import { Button } from "../../_components/Button"
import { Field } from "../../_components/Field"
import { ArrowLeftIcon, ChevronDownIcon, LockIcon } from "../../_components/icons"
import { Logo } from "../../_components/Logo"
import { OrderSummary } from "../../_components/OrderSummary"
import { money, total } from "../../_components/data"

export default function MobileCheckout() {
  return (
    <div className="flex h-full flex-col bg-white text-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <button className="-ml-1 rounded-md p-1 text-zinc-600" aria-label="Back">
          <ArrowLeftIcon className="size-5" />
        </button>
        <Logo />
        <span className="w-7" />
      </header>
      <details open className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
          <span className="flex items-center gap-1 font-medium text-indigo-600">
            Hide order summary <ChevronDownIcon className="size-3.5 rotate-180" />
          </span>
          <span className="font-semibold tabular-nums">{money(total)}</span>
        </summary>
        <OrderSummary compact className="mt-1" />
      </details>
      <main className="flex-1 space-y-4 overflow-auto px-4 py-5">
        <div className="grid grid-cols-2 gap-2">
          <button className="h-11 rounded-lg bg-black text-sm font-semibold text-white">Wallet</button>
          <button className="h-11 rounded-lg bg-amber-400 text-sm font-bold text-blue-900">PayLater</button>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200" /> OR <span className="h-px flex-1 bg-zinc-200" />
        </div>
        <Field label="Card number" defaultValue="4242 4242 4242 4242" trailing={<LockIcon />} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expiry" defaultValue="08 / 28" />
          <Field label="CVC" placeholder="123" />
        </div>
      </main>
      <footer className="border-t border-zinc-200 p-4">
        <Button size="lg" className="w-full">
          Pay {money(total)}
        </Button>
      </footer>
    </div>
  )
}
