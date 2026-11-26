import { Badge } from "../_components/Badge"
import { Button } from "../_components/Button"
import { PlusIcon } from "../_components/icons"
import { money, orders, revenue } from "../_components/data"
import { AppShell } from "./AppShell"

const stats = [
  { label: "Revenue", value: "$48,290", delta: "+12.4%" },
  { label: "Orders", value: "1,284", delta: "+8.1%" },
  { label: "Avg. order", value: "$37.60", delta: "+3.9%" },
  { label: "Refund rate", value: "1.2%", delta: "−0.3%" },
]

const tone = { Paid: "success", Refunded: "neutral", Pending: "warning" } as const

export default function Dashboard() {
  const max = Math.max(...revenue)
  return (
    <AppShell
      title="Overview"
      actions={
        <Button size="sm">
          <PlusIcon /> New product
        </Button>
      }
    >
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">{stat.label}</p>
            <p className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{stat.value}</span>
              <span className="text-xs font-medium text-emerald-600">{stat.delta}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_380px] gap-4">
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Revenue</h2>
            <span className="text-xs text-zinc-500">Last 12 weeks</span>
          </div>
          <div className="mt-6 flex h-52 items-end gap-2">
            {revenue.map((value, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={i === revenue.length - 1 ? "w-full rounded-t-md bg-indigo-600" : "w-full rounded-t-md bg-indigo-200"}
                  style={{ height: `${(value / max) * 100}%` }}
                />
                <span className="text-[10px] text-zinc-400">W{i + 1}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white">
          <h2 className="px-5 pt-5 text-sm font-semibold">Recent orders</h2>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="py-2.5 pl-5 font-mono text-xs text-zinc-500">{order.id}</td>
                  <td className="py-2.5">{order.customer}</td>
                  <td className="py-2.5">
                    <Badge tone={tone[order.status as keyof typeof tone]}>{order.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-5 text-right tabular-nums">{money(order.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  )
}
