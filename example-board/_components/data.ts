/** Sample data shared by the frames. */

export const cart = [
  { name: "Aero Desk Lamp", variant: "Matte black · 40 cm", price: 129, qty: 1, swatch: "bg-zinc-800" },
  { name: "Linen Cushion Cover", variant: "Sage · 50 × 50", price: 34, qty: 2, swatch: "bg-emerald-200" },
  { name: "Stoneware Mug", variant: "Speckled sand", price: 18, qty: 3, swatch: "bg-amber-100" },
]

export const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
export const shipping = 0
export const tax = Math.round(subtotal * 0.08 * 100) / 100
export const total = subtotal + shipping + tax

export function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

export const plans = [
  {
    name: "Starter",
    monthly: 0,
    annual: 0,
    blurb: "For side projects and trying things out.",
    features: ["1 workspace", "Up to 3 members", "Community support", "7-day history"],
    cta: "Start for free",
  },
  {
    name: "Pro",
    monthly: 24,
    annual: 19,
    blurb: "For small teams shipping every week.",
    features: ["Unlimited workspaces", "Up to 25 members", "Priority support", "Unlimited history", "Custom domains"],
    cta: "Start 14-day trial",
    popular: true,
  },
  {
    name: "Business",
    monthly: 59,
    annual: 49,
    blurb: "For organizations that need control.",
    features: ["Everything in Pro", "SSO and SCIM", "Audit log", "99.9% uptime SLA", "Dedicated manager"],
    cta: "Contact sales",
  },
]

export const team = [
  { name: "Maya Okafor", email: "maya@example.com", role: "Admin" },
  { name: "Jonas Berg", email: "jonas@example.com", role: "Editor" },
  { name: "Priya Raman", email: "priya@example.com", role: "Viewer" },
]

export const orders = [
  { id: "#4821", customer: "Maya Okafor", status: "Paid", amount: 248.4, date: "Nov 21" },
  { id: "#4820", customer: "Jonas Berg", status: "Refunded", amount: 64.0, date: "Nov 21" },
  { id: "#4819", customer: "Priya Raman", status: "Paid", amount: 129.0, date: "Nov 20" },
  { id: "#4818", customer: "Leo Martins", status: "Pending", amount: 312.5, date: "Nov 20" },
  { id: "#4817", customer: "Ava Chen", status: "Paid", amount: 89.9, date: "Nov 19" },
]

export const revenue = [42, 55, 48, 61, 58, 72, 66, 81, 77, 90, 86, 98]
