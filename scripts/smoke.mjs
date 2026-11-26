import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const base = process.env.BASE ?? "http://127.0.0.1:5173"
const out = process.env.OUT ?? "shots"
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const configs = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, scheme: "light" },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, scheme: "dark" },
  { name: "phone-light", viewport: { width: 390, height: 844 }, scheme: "light", mobile: true },
  { name: "phone-dark", viewport: { width: 390, height: 844 }, scheme: "dark", mobile: true },
]
const only = process.argv[2]
for (const c of configs) {
  if (only && !c.name.startsWith(only)) continue
  const ctx = await browser.newContext({ viewport: c.viewport, colorScheme: c.scheme, isMobile: !!c.mobile, hasTouch: !!c.mobile, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`) })
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message))
  await page.goto(base + "/", { waitUntil: "load" })
  // Wait until every frame has rendered something (or reported an error).
  await page.waitForFunction(() => {
    const iframes = [...document.querySelectorAll("iframe")]
    return iframes.length > 0 && iframes.every((f) => f.contentDocument?.querySelector("#root")?.childElementCount)
  }, null, { timeout: 30000 }).catch(() => console.log("frames did not all render in 30s"))
  await page.waitForTimeout(500)
  const info = await page.evaluate(() => ({
    iframes: document.querySelectorAll("iframe").length,
    frames: [...document.querySelectorAll("[data-item-id]")].map((el) => el.getAttribute("data-item-id")),
    errored: [...document.querySelectorAll("[data-error='true']")].map((el) => el.getAttribute("data-item-id")),
  }))
  // also check frame contents rendered
  const frameTexts = []
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue
    const t = await f.evaluate(() => (document.body.innerText || "").slice(0, 40).replace(/\s+/g, " ")).catch((e) => "ERR " + e.message)
    frameTexts.push(f.url().replace(base, "") + " => " + t)
  }
  await page.screenshot({ path: `${out}/${c.name}.png` })
  console.log(c.name, JSON.stringify(info))
  console.log(frameTexts.join("\n"))
  if (errors.length) console.log("console:", errors.slice(0, 10).join("\n"))
  await ctx.close()
}
await browser.close()
