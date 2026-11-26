import { SparkIcon } from "../../_components/icons"
import { cn } from "../../_components/cn"
import { OnboardingShell } from "../_shared/Shell"

const roles = [
  { label: "Design", note: "Mockups, systems, handoff" },
  { label: "Engineering", note: "Specs, reviews, releases" },
  { label: "Product", note: "Roadmaps and research" },
  { label: "Something else", note: "We’ll keep it general" },
]

export default function Welcome() {
  return (
    <OnboardingShell
      step={0}
      title="Welcome to Lumen, Maya"
      subtitle="Tell us what you do and we’ll set up a workspace that fits."
      next="Get started"
    >
      <div className="grid grid-cols-2 gap-3">
        {roles.map((role, i) => (
          <button
            key={role.label}
            className={cn(
              "rounded-xl border bg-white p-4 text-left shadow-xs transition-colors",
              i === 0 ? "border-indigo-600 ring-1 ring-indigo-600" : "border-zinc-200 hover:border-zinc-300"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {i === 0 && <SparkIcon className="size-4 text-indigo-600" />}
              {role.label}
            </span>
            <span className="mt-1 block text-xs text-zinc-500">{role.note}</span>
          </button>
        ))}
      </div>
    </OnboardingShell>
  )
}
