// Live-update checks: board files change on disk while the canvas is open.
// The board is restored at the end (scripts/board-snapshot.mjs).
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

import { snapshotBoard } from "./board-snapshot.mjs"

const base = process.env.BASE ?? "http://127.0.0.1:5173"
const board = fileURLToPath(new URL("../example-board", import.meta.url))
const at = (rel) => path.join(board, rel)
const edit = (rel, from, to) => writeFileSync(at(rel), readFileSync(at(rel), "utf8").replace(from, to))
const put = (rel, lines) => {
  mkdirSync(path.dirname(at(rel)), { recursive: true })
  writeFileSync(at(rel), lines.join("\n") + "\n")
}
const restoreBoard = snapshotBoard(board)
const results = []

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let mainNavigations = 0
page.on("framenavigated", (f) => { if (f === page.mainFrame()) { mainNavigations++; console.log("NAV", f.url(), results.length) } })
const logs = []
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(m.text().slice(0, 160)) })
await page.goto(base + "/", { waitUntil: "load" })
const allRendered = () => page.waitForFunction(() => {
  const f = [...document.querySelectorAll("iframe")]
  return f.length && f.every((x) => x.contentDocument?.querySelector("#root")?.childElementCount)
}, null, { timeout: 30000 })
await allRendered()
await page.evaluate(() => { window.__marker = "kept" })

const frameOf = (id) => page.frames().find((f) => f.url() === `${base}/frame/${id}`)
const frameText = async (id) => (await frameOf(id)?.evaluate(() => document.body.innerText).catch(() => "")) ?? ""
async function markFrames(ids) {
  for (const id of ids) await frameOf(id)?.evaluate(() => { window.__frameMarker = "kept" })
}
async function framesKept(ids) {
  const out = {}
  for (const id of ids) out[id] = await frameOf(id)?.evaluate(() => window.__frameMarker === "kept").catch(() => false)
  return out
}
async function until(label, check, timeout = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { if (await check()) return Date.now() - start } catch {}
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`timeout: ${label}`)
}
async function step(name, fn) {
  try {
    const detail = await fn()
    const canvasKept = await page.evaluate(() => window.__marker === "kept")
    results.push({ name, ok: canvasKept, canvasKept, ...detail })
  } catch (e) {
    results.push({ name, ok: false, error: e.message })
  }
}
const cardExists = (id) => page.evaluate((id) => !!document.querySelector(`[data-item-id="${CSS.escape(id)}"]`), id)
const cardError = (id) => page.evaluate((id) => document.querySelector(`[data-item-id="${CSS.escape(id)}"]`)?.hasAttribute("data-error"), id)

const checkoutIds = ["checkout", "checkout/compact", "checkout/compact/dark", "checkout/mobile"]

await step("edit a frame (checkout/mobile/index.tsx)", async () => {
  await markFrames(["checkout/mobile"])
  edit("checkout/mobile/index.tsx", "Hide order summary", "Hide summary (edited)")
  const ms = await until("mobile text", async () => (await frameText("checkout/mobile")).includes("Hide summary (edited)"))
  const kept = await framesKept(["checkout/mobile"])
  return { ms, iframeNotReloaded: kept["checkout/mobile"] }
})

await step("edit a shared component (_components/OrderSummary.tsx)", async () => {
  await markFrames(checkoutIds)
  edit("_components/OrderSummary.tsx", "Estimated tax", "Sales tax (shared edit)")
  const ms = await until("all checkout frames", async () => {
    for (const id of checkoutIds) if (!(await frameText(id)).includes("Sales tax (shared edit)")) return false
    return true
  })
  return { ms, iframesNotReloaded: Object.values(await framesKept(checkoutIds)).every(Boolean) }
})

await step("add a folder with index.tsx (live-test/, new Tailwind class)", async () => {
  put("live-test/index.tsx", [
    "export default function LiveTest() {",
    '  return <div className="m-6 rounded-xl bg-fuchsia-500 p-6 text-white">Live test frame</div>',
    "}",
  ])
  const ms = await until("card appears", () => cardExists("live-test"))
  const msRender = await until("frame renders", async () => (await frameText("live-test")).includes("Live test frame"))
  const bg = await until("tailwind class applied", async () =>
    (await frameOf("live-test").evaluate(() => getComputedStyle(document.querySelector(".bg-fuchsia-500")).backgroundColor)) !== "rgba(0, 0, 0, 0)")
  return { ms, msRender, msTailwind: bg }
})

await step("folder before index.tsx shows as empty group", async () => {
  mkdirSync(at("later"))
  const ms = await until("group appears", () => page.evaluate(() => !!document.querySelector('.fw-group[data-item-id="later"]')))
  put("later/index.tsx", ['export default function Later() { return <p className="p-8 text-2xl">Now a frame</p> }'])
  const msFrame = await until("becomes frame", async () => (await frameText("later")).includes("Now a frame"))
  return { ms, msFrame }
})

await step("edit frame.json (live-test width 640, title)", async () => {
  put("live-test/frame.json", ['{ "title": "Live test", "width": 640, "height": 400 }'])
  const ms = await until("width updates", () => page.evaluate(() => document.querySelector('[data-item-id="live-test"]')?.style.width === "640px"))
  return { ms }
})

await step("rename a folder (live-test -> live-renamed)", async () => {
  renameSync(at("live-test"), at("live-renamed"))
  const ms = await until("renamed", async () => (await cardExists("live-renamed")) && !(await cardExists("live-test")))
  await until("renamed frame renders", async () => (await frameText("live-renamed")).includes("Live test frame"))
  return { ms }
})

await step("syntax error breaks only that frame, then recovers", async () => {
  await markFrames(["pricing"])
  put("live-renamed/index.tsx", ["export default function LiveTest() {", '  return <div className="p-6">Broken <b></div>', "}"])
  const ms = await until("error shown", () => cardError("live-renamed"))
  const text = await frameText("live-renamed")
  const othersOk = !(await page.evaluate(() => [...document.querySelectorAll("[data-error]")].some((el) => el.getAttribute("data-item-id") !== "live-renamed")))
  put("live-renamed/index.tsx", ["export default function LiveTest() {", '  return <div className="p-6">Fixed after syntax error</div>', "}"])
  const msFix = await until("recovered", async () => !(await cardError("live-renamed")) && (await frameText("live-renamed")).includes("Fixed after syntax error"))
  return { ms, msFix, othersOk, errorText: text.slice(0, 80).replace(/\s+/g, " "), pricingNotReloaded: (await framesKept(["pricing"])).pricing }
})

await step("runtime error breaks only that frame, then recovers", async () => {
  put("live-renamed/index.tsx", ["export default function LiveTest(): never {", '  throw new Error("Boom at render")', "}"])
  const ms = await until("error shown", () => cardError("live-renamed"))
  const text = await frameText("live-renamed")
  put("live-renamed/index.tsx", ["export default function LiveTest() {", '  return <div className="p-6">Fixed after runtime error</div>', "}"])
  const msFix = await until("recovered", async () => !(await cardError("live-renamed")) && (await frameText("live-renamed")).includes("Fixed after runtime error"))
  return { ms, msFix, errorText: text.slice(0, 80).replace(/\s+/g, " ") }
})

await step("syntax error in a shared component, then fixed", async () => {
  const file = at("_components/Badge.tsx")
  const original = readFileSync(file, "utf8")
  writeFileSync(file, original.replace("</span>", "</spn>"))
  const ms = await until("error shown", () => cardError("dashboard"))
  const errored = await page.evaluate(() => [...document.querySelectorAll("[data-error]")].map((el) => el.getAttribute("data-item-id")))
  writeFileSync(file, original)
  const msFix = await until("recovered", () => page.evaluate(() => !document.querySelector("[data-error]")))
  return { ms, msFix, errored }
})

await step("delete folders (live-renamed/, later/)", async () => {
  rmSync(at("live-renamed"), { recursive: true })
  rmSync(at("later"), { recursive: true })
  const ms = await until("removed", async () => !(await cardExists("live-renamed")) && !(await cardExists("later")))
  return { ms }
})

// Undo the sample edits.
restoreBoard()
await page.waitForTimeout(1500)
const finalOk = await page.evaluate(() => window.__marker === "kept")
console.log(JSON.stringify(results, null, 1))
console.log("main-frame navigations:", mainNavigations, "(1 = initial load only); canvas marker after restore:", finalOk)
if (logs.length) console.log("console:", [...new Set(logs)].slice(0, 12).join("\n"))
await browser.close()
