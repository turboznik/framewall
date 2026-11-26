import type { ReactNode } from "react"

import { Button } from "../../_components/Button"
import { ArrowLeftIcon, ArrowRightIcon } from "../../_components/icons"
import { Logo } from "../../_components/Logo"
import { cn } from "../../_components/cn"

const steps = ["Welcome", "Workspace", "Invite team"]

/** Shared chrome for the onboarding steps (in `_shared`, so not a frame). */
export function OnboardingShell({
  step,
  title,
  subtitle,
  children,
  next = "Continue",
}: {
  step: number
  title: string
  subtitle: string
  children: ReactNode
  next?: string
}) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-indigo-50/70 to-white text-zinc-900">
      <header className="flex items-center justify-between px-8 py-5">
        <Logo />
        <ol className="flex items-center gap-2">
          {steps.map((label, i) => (
            <li key={label} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                  i < step ? "bg-indigo-600 text-white" : i === step ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600" : "bg-zinc-100 text-zinc-500"
                )}
              >
                {i + 1}
              </span>
              <span className={i === step ? "font-medium" : "text-zinc-500"}>{label}</span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-zinc-300" />}
            </li>
          ))}
        </ol>
        <button className="text-sm text-zinc-500">Skip</button>
      </header>
      <main className="flex flex-1 items-center justify-center px-8">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-zinc-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <footer className="flex items-center justify-between border-t border-zinc-200/70 px-8 py-4">
        <Button variant="ghost" disabled={step === 0}>
          <ArrowLeftIcon /> Back
        </Button>
        <Button>
          {next} <ArrowRightIcon />
        </Button>
      </footer>
    </div>
  )
}
