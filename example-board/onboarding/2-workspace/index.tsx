import { Field, inputClass } from "../../_components/Field"
import { OnboardingShell } from "../_shared/Shell"

export default function Workspace() {
  return (
    <OnboardingShell
      step={1}
      title="Create your workspace"
      subtitle="A workspace is where your team’s projects live. You can change this later."
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-indigo-600 text-xl font-semibold text-white">
            A
          </span>
          <div className="text-sm">
            <button className="font-medium text-indigo-600">Upload logo</button>
            <p className="text-xs text-zinc-500">PNG or SVG, at least 256 × 256</p>
          </div>
        </div>
        <Field label="Workspace name" defaultValue="Acme Design" />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-700">Workspace URL</span>
          <span className="flex">
            <span className="flex items-center rounded-l-lg bg-zinc-50 px-3 text-sm text-zinc-500 ring-1 ring-zinc-300 ring-inset">
              lumen.example/
            </span>
            <input className={inputClass + " -ml-px rounded-l-none"} defaultValue="acme-design" />
          </span>
          <span className="mt-1.5 block text-xs text-emerald-600">✓ acme-design is available</span>
        </label>
      </div>
    </OnboardingShell>
  )
}
