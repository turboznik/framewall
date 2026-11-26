import { Avatar } from "../../_components/Avatar"
import { Badge } from "../../_components/Badge"
import { Button } from "../../_components/Button"
import { inputClass } from "../../_components/Field"
import { team } from "../../_components/data"
import { OnboardingShell } from "../_shared/Shell"

export default function Invite() {
  return (
    <OnboardingShell
      step={2}
      title="Invite your team"
      subtitle="Lumen works best with collaborators. Invites expire after 7 days."
      next="Finish setup"
    >
      <div className="flex gap-2">
        <input className={inputClass} placeholder="name@example.com, separated by commas" />
        <Button variant="dark">Invite</Button>
      </div>
      <ul className="mt-5 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {team.map((person) => (
          <li key={person.email} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={person.name} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{person.name}</span>
              <span className="block text-xs text-zinc-500">{person.email}</span>
            </span>
            <Badge tone={person.role === "Admin" ? "brand" : "neutral"}>{person.role}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-zinc-500">
        Or share an invite link: <span className="font-mono text-zinc-700">lumen.example/join/acme-7f3k</span>
      </p>
    </OnboardingShell>
  )
}
