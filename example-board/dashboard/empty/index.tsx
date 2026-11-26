import { Button } from "../../_components/Button"
import { BoxIcon, PlusIcon } from "../../_components/icons"
import { AppShell } from "../AppShell"

const tasks = ["Add your first product", "Connect a payment provider", "Customize your storefront"]

export default function EmptyDashboard() {
  return (
    <AppShell title="Overview">
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
            <BoxIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">No orders yet</h2>
          <p className="mt-1 text-sm text-zinc-500">
            When customers buy from your store, orders and revenue will show up here.
          </p>
          <Button className="mt-6">
            <PlusIcon /> Add a product
          </Button>
          <ol className="mt-8 space-y-2 text-left">
            {tasks.map((task, i) => (
              <li key={task} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
                <span className="flex size-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600">
                  {i + 1}
                </span>
                {task}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppShell>
  )
}
