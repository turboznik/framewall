import { Badge } from "../_components/Badge"
import { Button } from "../_components/Button"
import { CheckIcon } from "../_components/icons"
import { Logo } from "../_components/Logo"
import { plans } from "../_components/data"
import { cn } from "../_components/cn"

export function PricingPage({ billing }: { billing: "monthly" | "annual" }) {
  return (
    <div className="h-full overflow-auto bg-white text-zinc-900">
      <header className="flex items-center justify-between px-10 py-5">
        <Logo />
        <nav className="flex items-center gap-8 text-sm text-zinc-600">
          <span>Product</span>
          <span>Customers</span>
          <span className="font-medium text-zinc-900">Pricing</span>
          <span>Docs</span>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">Sign in</Button>
          <Button variant="dark" size="sm">Get started</Button>
        </div>
      </header>

      <section className="px-10 pt-12 text-center">
        <Badge tone="brand">New: usage-based add-ons</Badge>
        <h1 className="mx-auto mt-4 max-w-2xl text-5xl font-semibold tracking-tight">
          Simple pricing that scales with your team
        </h1>
        <p className="mt-4 text-zinc-600">Start free. Upgrade when you need more seats, history, or control.</p>
        <div className="mt-8 inline-flex rounded-full bg-zinc-100 p-1 text-sm">
          {(["monthly", "annual"] as const).map((option) => (
            <span
              key={option}
              className={cn(
                "rounded-full px-4 py-1.5 capitalize",
                billing === option ? "bg-white font-medium shadow-sm" : "text-zinc-600"
              )}
            >
              {option}
              {option === "annual" && <span className="ml-1.5 text-xs font-semibold text-emerald-600">−20%</span>}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-10 grid max-w-5xl grid-cols-3 gap-6 px-10 pb-12">
        {plans.map((plan) => {
          const price = billing === "annual" ? plan.annual : plan.monthly
          return (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6",
                plan.popular ? "border-indigo-600 shadow-xl ring-1 shadow-indigo-600/10 ring-indigo-600" : "border-zinc-200"
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-medium text-white">
                  Most popular
                </span>
              )}
              <h2 className="font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-zinc-500">{plan.blurb}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">${price}</span>
                <span className="text-sm text-zinc-500">/ seat / mo</span>
              </p>
              <p className="mt-1 h-4 text-xs text-zinc-500">
                {billing === "annual" && price > 0 ? `Billed $${price * 12} yearly` : ""}
              </p>
              <Button variant={plan.popular ? "primary" : "secondary"} className="mt-6 w-full">
                {plan.cta}
              </Button>
              <ul className="mt-6 space-y-2.5 text-sm text-zinc-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckIcon className="size-4 text-indigo-600" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>
    </div>
  )
}
