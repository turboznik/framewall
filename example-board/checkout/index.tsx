import { Button } from "../_components/Button"
import { Field } from "../_components/Field"
import { CardIcon, ChevronDownIcon, LockIcon } from "../_components/icons"
import { Logo } from "../_components/Logo"
import { OrderSummary } from "../_components/OrderSummary"
import { money, total } from "../_components/data"

const steps = ["Cart", "Information", "Payment", "Review"]

export default function Checkout() {
  return (
    <div className="flex h-full bg-white text-zinc-900">
      <main className="flex flex-1 justify-end overflow-auto px-16 py-10">
        <div className="w-full max-w-xl">
          <Logo className="text-lg" />
          <nav className="mt-6 flex items-center gap-2 text-sm">
            {steps.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className={i === 2 ? "font-medium text-zinc-900" : i < 2 ? "text-indigo-600" : "text-zinc-400"}>
                  {step}
                </span>
                {i < steps.length - 1 && <span className="text-zinc-300">/</span>}
              </span>
            ))}
          </nav>

          <section className="mt-8">
            <h2 className="text-sm font-semibold">Contact</h2>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm">
              <span className="text-zinc-500">maya@example.com</span>
              <button className="font-medium text-indigo-600">Change</button>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold">Payment</h2>
            <p className="mt-1 text-sm text-zinc-500">All transactions are secure and encrypted.</p>
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
              <div className="flex items-center justify-between border-b border-indigo-200 bg-indigo-50/60 px-4 py-3">
                <span className="flex items-center gap-3 text-sm font-medium">
                  <span className="flex size-4 items-center justify-center rounded-full border-[5px] border-indigo-600" />
                  Credit card
                </span>
                <span className="flex gap-1.5">
                  {["VISA", "MC", "AMEX"].map((b) => (
                    <span key={b} className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">
                      {b}
                    </span>
                  ))}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 p-4">
                <Field className="col-span-2" label="Card number" defaultValue="4242 4242 4242 4242" trailing={<LockIcon />} />
                <Field label="Expiration" placeholder="MM / YY" defaultValue="08 / 28" />
                <Field label="Security code" placeholder="CVC" />
                <Field className="col-span-2" label="Name on card" defaultValue="Maya Okafor" />
              </div>
              <div className="flex items-center gap-3 border-t border-zinc-200 px-4 py-3 text-sm text-zinc-600">
                <span className="size-4 rounded-full border border-zinc-300" />
                Bank transfer
              </div>
            </div>
          </section>

          <label className="mt-6 flex items-center gap-3 text-sm text-zinc-600">
            <span className="flex size-4 items-center justify-center rounded bg-indigo-600 text-white">
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2.5 6.5l2 2 5-5" />
              </svg>
            </span>
            Billing address is the same as shipping
          </label>

          <div className="mt-8 flex items-center justify-between">
            <button className="text-sm font-medium text-indigo-600">Return to information</button>
            <Button size="lg" className="min-w-56">
              <CardIcon /> Pay {money(total)}
            </Button>
          </div>
        </div>
      </main>

      <aside className="flex w-[480px] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 px-12 py-10">
        <h2 className="flex items-center justify-between text-sm font-semibold">
          Order summary
          <span className="flex items-center gap-1 font-normal text-zinc-500">
            3 items <ChevronDownIcon />
          </span>
        </h2>
        <OrderSummary className="mt-4" />
        <div className="mt-6 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400"
            placeholder="Discount code"
          />
          <Button variant="secondary">Apply</Button>
        </div>
      </aside>
    </div>
  )
}
