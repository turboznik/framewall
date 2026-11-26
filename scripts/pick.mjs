// Element picking, end to end: select mode, hover, click, ↑/↓, crumbs, shift-click
// across frames, Copy reference (tags), persistence across a reload, the CLI
// (with every line number checked against the JSX), outlines across hot updates,
// Esc, and light/dark screenshots.
//
//   BASE=http://127.0.0.1:5173 node scripts/pick.mjs
//
// Edits example-board/checkout/compact/CompactCheckout.tsx and restores the board at the end.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

import { snapshotBoard } from "./board-snapshot.mjs"

const base = process.env.BASE ?? "http://127.0.0.1:5173"
const shots = process.env.SHOTS ?? "shots/pick"
const repo = fileURLToPath(new URL("..", import.meta.url))
const board = `${repo}example-board`
const compactFile = `${board}/checkout/compact/CompactCheckout.tsx`
const original = readFileSync(compactFile, "utf8")
const restoreBoard = snapshotBoard(board)
/** Run the CLI (bin/framewall) from the repo. */
const cli = (...args) => execFileSync(process.execPath, ["bin/framewall", ...args], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
mkdirSync(shots, { recursive: true })

const results = []
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()
const logs = []
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) logs.push(m.text().slice(0, 200))
})
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`))

const api = async (path = "", init) => {
  const res = await fetch(`${base}/__framewall/selection${path}`, init)
  return path.includes("format=text") ? res.text() : res.json()
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(label, check, timeout = 8000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    try {
      last = await check()
      if (last) return last
    } catch (e) {
      last = e.message
    }
    await sleep(60)
  }
  throw new Error(`timeout: ${label} (last: ${JSON.stringify(last)?.slice(0, 300)})`)
}
async function step(name, fn) {
  try {
    const detail = (await fn()) ?? {}
    results.push({ name, ok: true, ...detail })
  } catch (e) {
    results.push({ name, ok: false, error: e.message })
  }
}

// Start from an empty selection.
await api("", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"items":[]}' })

const allRendered = () =>
  page.waitForFunction(
    () => {
      const f = [...document.querySelectorAll("iframe")]
      return f.length && f.every((x) => x.contentDocument?.querySelector("#root")?.childElementCount)
    },
    null,
    { timeout: 30000 }
  )
await page.goto(base + "/", { waitUntil: "load" })
await allRendered()

const frameOf = (id) => page.frames().find((f) => f.url() === `${base}/frame/${id}`)

/** Page coordinates of the center of the `index`-th `selector` match in a frame. */
async function centerOf(frameId, selector, { index = 0, text } = {}) {
  const ib = await page.locator(`iframe[data-frame-id="${frameId}"]`).boundingBox()
  const r = await frameOf(frameId).evaluate(
    ([sel, index, text]) => {
      let els = [...document.querySelectorAll(sel)]
      if (text) els = els.filter((e) => e.textContent.includes(text))
      const b = els[index].getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, vw: window.innerWidth }
    },
    [selector, index, text]
  )
  const scale = ib.width / r.vw
  return { x: ib.x + r.x * scale, y: ib.y + r.y * scale }
}

/** What the picker overlay in a frame currently shows. */
const overlay = (frameId) =>
  frameOf(frameId).evaluate(() => {
    const root = document.querySelector("framewall-overlay")?.shadowRoot
    if (!root) return null
    const vis = (el) => !!el && (el.style.display === "block" || el.style.display === "flex")
    const hoverLabel = root.querySelector(".label:not(.selected)")
    return {
      hover: vis(root.querySelector(".box.hover")),
      hoverLabel: vis(hoverLabel) ? hoverLabel.textContent : null,
      selected: [...root.querySelectorAll(".box.sel")].filter(vis).length,
      badges: [...root.querySelectorAll(".badge")].filter(vis).map((b) => b.textContent),
    }
  })

const panelItems = () =>
  page.$$eval('section[aria-label="Selected elements"] [data-uid]', (els) =>
    els.map((el) => ({ uid: el.dataset.uid, active: el.hasAttribute("data-active"), text: el.innerText }))
  )
const activeItem = async () => (await panelItems()).find((i) => i.active)
const toggle = page.getByRole("button", { name: "Select elements" })

// --- Zoom to frame: label button, double-click on the label, Shift+2, the tree. ---

const worldTransform = () => page.$eval("[data-world]", (w) => w.style.transform)
/** Wait until the camera stops moving. */
async function settled() {
  await sleep(60)
  let prev = null
  for (let i = 0; i < 60; i++) {
    const t = await worldTransform()
    if (t === prev) return
    prev = t
    await sleep(120)
  }
}
/** Where a frame (and its label) sit: inside the canvas, clear of the side panel / phone sheet, at what zoom. */
const zoomState = (id) =>
  page.evaluate((id) => {
    const card = document.querySelector(`[data-item-id="${CSS.escape(id)}"]`)
    const f = card.getBoundingClientRect()
    const l = card.querySelector(".fw-label").getBoundingClientRect()
    const v = document.querySelector(".fw-viewport").getBoundingClientRect()
    const p = document.querySelector("[data-canvas-cover]")?.getBoundingClientRect()
    const box = { left: f.left, top: l.top, right: f.right, bottom: f.bottom }
    const clearOfPanel =
      !p?.width || box.right <= p.left || box.left >= p.right || box.bottom <= p.top || box.top >= p.bottom
    const zoom = f.width / card.offsetWidth
    return {
      zoom: Math.round(zoom * 1000) / 1000,
      inside: box.left >= v.left && box.top >= v.top && box.right <= v.right && box.bottom <= v.bottom && clearOfPanel,
      // Fit, not just somewhere on screen: at 100%, or filling much of the canvas width or height.
      snug: zoom > 0.999 || f.width / v.width > 0.5 || (box.bottom - box.top) / v.height > 0.5,
      selected: card.hasAttribute("data-selected"),
      frame: Object.values(box).map(Math.round),
      canvas: [v.left, v.top, v.right, v.bottom].map(Math.round),
      panel: p?.width ? [p.left, p.top, p.right, p.bottom].map(Math.round) : null,
    }
  }, id)
async function expectZoomedTo(id) {
  await settled()
  const s = await zoomState(id)
  if (!s.inside || !s.snug || s.zoom > 1.0001 || !s.selected) throw new Error(`not zoomed to ${id}: ${JSON.stringify(s)}`)
  return s
}
const fitBoard = async () => {
  await page.keyboard.press("Shift+Digit1")
  await settled()
}

await step("zoom: the label button zooms to a large frame, animated", async () => {
  await page.locator("main").click({ position: { x: 5, y: 5 } })
  await fitBoard()
  // Count camera updates to tell an animation from a jump.
  await page.evaluate(() => {
    window.__camSteps = 0
    new MutationObserver(() => window.__camSteps++).observe(document.querySelector("[data-world]"), {
      attributes: true,
      attributeFilter: ["style"],
    })
  })
  await page.locator('[data-item-id="checkout"]').hover()
  await page.locator('[data-item-id="checkout"] button[aria-label="Zoom to frame (⇧2)"]').click()
  const s = await expectZoomedTo("checkout")
  const steps = await page.evaluate(() => window.__camSteps)
  // A jump is one update; headless frame rates vary, so ask only for a few in-between frames.
  if (steps < 3) throw new Error(`camera jumped instead of animating (${steps} updates)`)
  await page.screenshot({ path: `${shots}/zoom-desktop-frame.png` })
  return { ...s, steps }
})

await step("zoom: double-clicking a label zooms to a narrow frame", async () => {
  await page.locator("main").click({ position: { x: 5, y: 5 } })
  await fitBoard()
  await page.locator('[data-item-id="checkout/mobile"] .fw-label').dblclick({ position: { x: 4, y: 10 } })
  const s = await expectZoomedTo("checkout/mobile")
  await page.screenshot({ path: `${shots}/zoom-mobile-frame.png` })
  return s
})

await step("zoom: Shift+2 zooms to the selected frame", async () => {
  await fitBoard()
  await page.locator('[data-item-id="dashboard"] .fw-label').click({ position: { x: 4, y: 10 } })
  await sleep(450) // not a double click
  await page.keyboard.press("Shift+Digit2")
  return expectZoomedTo("dashboard")
})

await step("zoom: with the side panel open, Shift+2 and the tree keep the frame beside it", async () => {
  await fitBoard()
  await page.keyboard.press("s") // select mode opens the panel
  try {
    await page.waitForSelector("[data-canvas-cover]")
    await page.keyboard.press("Shift+Digit2")
    const shortcut = await expectZoomedTo("dashboard")
    await page.getByRole("treeitem", { name: /Checkout · compact/ }).first().click()
    const tree = await expectZoomedTo("checkout/compact")
    await page.screenshot({ path: `${shots}/zoom-with-panel.png` })
    return { shortcut, tree }
  } finally {
    await page.keyboard.press("Escape") // leave select mode
    await until("select mode off", async () => (await toggle.getAttribute("aria-pressed")) === "false")
  }
})

await step("zoom: at phone width, the frame fits the phone canvas", async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  try {
    await sleep(400)
    await page.locator("main").click({ position: { x: 5, y: 5 } })
    await fitBoard()
    await page.locator('[data-item-id="checkout/mobile"] .fw-label').dblclick({ position: { x: 4, y: 10 } })
    const s = await expectZoomedTo("checkout/mobile")
    await page.screenshot({ path: `${shots}/zoom-phone.png` })
    return s
  } finally {
    await page.setViewportSize({ width: 1440, height: 900 })
    await sleep(400)
  }
})

// Zoom to the two checkout frames so elements are a comfortable size.
await page.evaluate(() => {
  const keys = { key: "Escape" }
  window.dispatchEvent(new KeyboardEvent("keydown", keys))
})
await page.getByText("Checkout · compact", { exact: true }).first().click()
await sleep(700)
// Zoom out until the mobile frame is in view as well.
for (let i = 0; i < 8; i++) {
  const b = await page.locator('iframe[data-frame-id="checkout/mobile"]').boundingBox()
  const v = page.viewportSize()
  if (b && b.x >= 0 && b.y >= 44 && b.x + b.width <= v.width - 400 && b.y + b.height <= v.height) break
  await page.keyboard.press("-")
  await sleep(350)
}

await step("S turns select mode on; every frame takes pointer input", async () => {
  await page.locator("main").click({ position: { x: 5, y: 5 } }) // focus the canvas page, deselect the frame
  await page.keyboard.press("s")
  await until("toggle pressed", async () => (await toggle.getAttribute("aria-pressed")) === "true")
  const pointer = await page.$$eval("iframe", (fs) => fs.every((f) => f.style.pointerEvents === "auto"))
  if (!pointer) throw new Error("iframes still ignore the pointer")
  return { pointer }
})

let payLine = original.split("\n").findIndex((l) => l.includes('<Button size="lg"')) + 1
const h1Line = original.split("\n").findIndex((l) => l.includes("<h1")) + 1

await step("hover outlines the element with name + file:line", async () => {
  const c = await centerOf("checkout/compact", "button", { text: "Pay" })
  await page.mouse.move(c.x, c.y)
  const o = await until("hover label", async () => {
    const o = await overlay("checkout/compact")
    return o?.hover && o.hoverLabel ? o : null
  })
  const want = `Buttoncheckout/compact/CompactCheckout.tsx:${payLine}`
  if (!o.hoverLabel.startsWith(want)) throw new Error(`label "${o.hoverLabel}", want "${want}…"`)
  return { label: o.hoverLabel }
})

await step("click selects; panel shows crumbs and locations", async () => {
  const c = await centerOf("checkout/compact", "button", { text: "Pay" })
  await page.mouse.click(c.x, c.y)
  const item = await until("one item", async () => {
    const items = await panelItems()
    return items.length === 1 && items[0].text.includes("Button") ? items[0] : null
  })
  for (const want of ["CompactLight", "CompactCheckout", `CompactCheckout.tsx:${payLine}`, "Button.tsx:27"]) {
    if (!item.text.includes(want)) throw new Error(`panel lacks ${want}: ${item.text}`)
  }
  const o = await overlay("checkout/compact")
  if (o.selected !== 1 || o.badges[0] !== "1") throw new Error(`overlay ${JSON.stringify(o)}`)
  return { overlay: o }
})

await step("↑ selects the parent, ↓ goes back to the child", async () => {
  await page.keyboard.press("ArrowUp")
  const up = await until("parent", async () => {
    const a = await activeItem()
    return a && a.text.includes('<div className="p-8">') ? a : null
  })
  await page.keyboard.press("ArrowDown")
  await until("child again", async () => (await activeItem())?.text.includes(`CompactCheckout.tsx:${payLine}`))
  return { up: up.text.split("\n").slice(-3).join(" | ") }
})

await step("clicking a crumb selects that component's element", async () => {
  await page
    .locator('section[aria-label="Selected elements"] [data-active] button', { hasText: /^CompactCheckout$/ })
    .click()
  await until("crumb level", async () => (await activeItem())?.text.includes("CompactCheckout.tsx:12"))
  // Back to the Pay button for the rest.
  const c = await centerOf("checkout/compact", "button", { text: "Pay" })
  await page.mouse.click(c.x, c.y)
  await until("pay again", async () => (await activeItem())?.text.includes(`CompactCheckout.tsx:${payLine}`))
})

await step("shift-click adds elements, across frames", async () => {
  const li = await centerOf("checkout/mobile", "li", { index: 1 })
  await page.keyboard.down("Shift")
  await page.mouse.click(li.x, li.y)
  const h1 = await centerOf("checkout/compact", "h1")
  await page.mouse.click(h1.x, h1.y)
  await page.keyboard.up("Shift")
  const items = await until("three items", async () => {
    const items = await panelItems()
    return items.length === 3 ? items : null
  })
  if (!items[1].text.includes("2nd of 3")) throw new Error(`li item: ${items[1].text}`)
  const mobile = await overlay("checkout/mobile")
  const compact = await overlay("checkout/compact")
  if (mobile.selected !== 1 || compact.selected !== 2) throw new Error(`outlines ${JSON.stringify({ mobile, compact })}`)
  return { badges: { compact: compact.badges, mobile: mobile.badges } }
})

await step("drag inside a frame pans the canvas without picking", async () => {
  const before = await page.$eval("[data-world]", (w) => w.style.transform)
  const c = await centerOf("checkout/compact", "h2")
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x - 60, c.y - 20, { steps: 6 })
  await page.mouse.move(c.x - 120, c.y - 40, { steps: 6 })
  await page.mouse.up()
  const after = await page.$eval("[data-world]", (w) => w.style.transform)
  const items = await panelItems()
  if (before === after) throw new Error("camera didn't move")
  if (items.length !== 3) throw new Error(`items changed: ${items.length}`)
  // Pan back.
  await page.mouse.move(c.x - 120, c.y - 40)
  await page.mouse.down()
  await page.mouse.move(c.x, c.y, { steps: 8 })
  await page.mouse.up()
  return { before, after }
})

await step("the selection is saved with snippets", async () => {
  const saved = await until("saved", async () => {
    const data = await api()
    return data.items.length === 3 && data.items.every((i) => i.snippet) ? data : null
  })
  return { snippets: saved.items.map((i) => i.snippet) }
})

const toastText = () => page.locator("[data-toast]").last().innerText()

await step("Copy all copies one tag per element, as the server formats them", async () => {
  await until("snippets in the panel", async () => (await panelItems()).every((i) => i.text.includes("<")))
  await page.getByRole("button", { name: "Copy all references" }).click()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  const server = (await api("?format=text")).trimEnd()
  if (copied !== server) throw new Error(`clipboard differs:\n${copied}\n---\n${server}`)
  const lines = copied.split("\n")
  if (lines.length !== 3 || !lines.every((l) => /^<element frame="[^"]+" path="[^"]+" at="[^"]+"( [\w-]+="[^"]*")* \/>$/.test(l)))
    throw new Error(`not three element tags:\n${copied}`)
  const toast = await until("toast", toastText)
  return { copied, toast }
})

await step("Copy reference on one element copies its tag; ⌘⇧C copies them all", async () => {
  await page.locator('section[aria-label="Selected elements"] [data-uid]').nth(1).getByRole("button", { name: "Copy reference" }).click()
  const one = await page.evaluate(() => navigator.clipboard.readText())
  const server = (await api("?format=text")).trimEnd().split("\n")
  if (one !== server[1]) throw new Error(`copied ${one}, want ${server[1]}`)
  if (!/ instance="2"/.test(one)) throw new Error(`the 2nd li has no instance: ${one}`)
  await page.evaluate(() => navigator.clipboard.writeText(""))
  await page.locator("main").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("ControlOrMeta+Shift+KeyC")
  const all = await until("shortcut copied", async () => (await page.evaluate(() => navigator.clipboard.readText())) || null)
  if (all !== server.join("\n")) throw new Error(`shortcut copied:\n${all}`)
  if ((await panelItems()).length !== 3) throw new Error("the click changed the selection")
  return { one }
})

await step("writing selection.json reloads nothing", async () => {
  await page.evaluate(() => (window.__marker = "kept"))
  for (const id of ["checkout/compact", "checkout/mobile"]) await frameOf(id).evaluate(() => (window.__frameMarker = "kept"))
  // Remove the heading, then shift-click it back: two saves.
  const lines = async () => JSON.stringify((await api()).items.map((i) => i.usedAt?.line))
  const before = await lines()
  await page.locator('section[aria-label="Selected elements"] [data-uid]').nth(2).getByRole("button", { name: "Remove from selection" }).click()
  await until("removal saved", async () => (await api()).items.length === 2)
  const h1 = await centerOf("checkout/compact", "h1")
  await page.keyboard.down("Shift")
  await page.mouse.click(h1.x, h1.y)
  await page.keyboard.up("Shift")
  await until("re-add saved", async () => (await lines()) === before)
  await sleep(1500)
  const kept = await page.evaluate(() => window.__marker === "kept")
  const framesKept = await Promise.all(
    ["checkout/compact", "checkout/mobile"].map((id) => frameOf(id).evaluate(() => window.__frameMarker === "kept"))
  )
  if (!kept || framesKept.includes(false)) throw new Error(`reloaded: canvas ${kept}, frames ${framesKept}`)
})

await step("reload restores the selection and outlines", async () => {
  const before = await panelItems()
  await page.reload({ waitUntil: "load" })
  await allRendered()
  const after = await until("restored", async () => {
    const items = await panelItems()
    return items.length === 3 ? items : null
  })
  if (JSON.stringify(after.map((i) => i.uid)) !== JSON.stringify(before.map((i) => i.uid))) throw new Error("different items")
  if ((await toggle.getAttribute("aria-pressed")) !== "true") throw new Error("select mode not restored")
  const outlines = await until("outlines", async () => {
    const c = await overlay("checkout/compact")
    const m = await overlay("checkout/mobile")
    return c?.selected === 2 && m?.selected === 1 ? { compact: c.badges, mobile: m.badges } : null
  })
  return { outlines }
})

const unescape = (v) => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const tagAttrs = (line) => Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], unescape(m[2])]))

/** Run the CLI and check every tag against the source: `at`/`defined-in` must hold `<Name` at that line. */
function checkCli(expectLines) {
  const text = cli("selection")
  const json = JSON.parse(cli("selection", "--json"))
  const lines = text.trimEnd().split("\n")
  if (lines.length !== json.items.length) throw new Error(`${lines.length} tags for ${json.items.length} items`)
  const checked = []
  json.items.forEach((item, i) => {
    const line = lines[i]
    if (!line.startsWith("<element ") || !line.endsWith(" />")) throw new Error(`line ${i + 1} is not a tag: ${line}`)
    const attrs = tagAttrs(line)
    if (attrs.frame !== item.frameId) throw new Error(`frame ${attrs.frame}, want ${item.frameId}`)
    if (attrs.path !== item.crumbs.slice(-2).join(" › ")) throw new Error(`path ${attrs.path}, crumbs ${item.crumbs.join(" › ")}`)
    if ((attrs.instance ?? null) !== (item.count > 1 ? String(item.nth) : null)) throw new Error(`instance ${attrs.instance} for ${item.nth}/${item.count}`)
    if ((attrs.stale === "true") !== !!item.stale) throw new Error(`stale ${attrs.stale}, json ${item.stale}`)
    const check = (attr, loc, name) => {
      const printed = attrs[attr]
      if (!printed?.startsWith(`${loc.file}:${loc.line}`)) throw new Error(`${attr}="${printed}", json ${loc.file}:${loc.line}`)
      const src = readFileSync(`${board}/${loc.file}`, "utf8").split("\n")[loc.line - 1] ?? ""
      if (!src.slice(loc.col - 1).startsWith(`<${name}`)) throw new Error(`${loc.file}:${loc.line}:${loc.col} is "${src.trim()}", not <${name}`)
      checked.push(`${attr} ${loc.file}:${loc.line} <${name}`)
    }
    // "at" is where the snippet's tag is written; "defined-in" is the DOM element's own tag.
    const usedName = /^<([\w.]+)/.exec(item.snippet ?? "")?.[1]
    if (!usedName) throw new Error(`no snippet for ${item.name}`)
    check("at", item.usedAt, usedName)
    if (attrs["defined-in"]) check("defined-in", item.definedIn, item.tag)
  })
  for (const [i, line] of Object.entries(expectLines ?? {})) {
    if (json.items[i].usedAt.line !== line) throw new Error(`item ${Number(i) + 1} used at line ${json.items[i].usedAt.line}, want ${line}`)
  }
  return { text, checked }
}

await step("framewall selection: tags match the JSX, line for line", async () => {
  const { text, checked } = checkCli({ 0: payLine, 2: h1Line })
  const first = text.split("\n")[0]
  const want = `<element frame="checkout/compact" path="CompactCheckout › Button" at="checkout/compact/CompactCheckout.tsx:${payLine}" defined-in="_components/Button.tsx:27" />`
  if (first !== want) throw new Error(`first tag:\n${first}\nwant:\n${want}`)
  return { checked, text }
})

const panelLine = async (n) => (await panelItems())[n]?.text ?? ""

await step("edit above a selection: outline follows, lines update", async () => {
  const lines = original.split("\n")
  lines.splice(payLine - 1, 0, "            {/* pick test: shifts the lines below */}")
  writeFileSync(compactFile, lines.join("\n"))
  payLine += 1
  await until("panel shows the new line", async () => (await panelLine(0)).includes(`CompactCheckout.tsx:${payLine}`), 12000)
  const o = await overlay("checkout/compact")
  if (o.selected !== 2) throw new Error(`outlines after edit: ${JSON.stringify(o)}`)
  await until("saved", async () => (await api()).items[0]?.usedAt?.line === payLine)
  const { checked } = checkCli({ 0: payLine, 2: h1Line })
  return { overlay: o, checked }
})

await step("deleting a selected element marks it stale", async () => {
  const lines = original.split("\n")
  lines.splice(h1Line - 1, 1)
  writeFileSync(compactFile, lines.join("\n"))
  payLine = original.split("\n").findIndex((l) => l.includes('<Button size="lg"'))
  await until("stale badge", async () => (await panelLine(2)).includes("Stale"), 12000)
  await until("pay line", async () => (await panelLine(0)).includes(`CompactCheckout.tsx:${payLine}`), 12000)
  const text = await until("saved", async () => {
    const t = await api("?format=text")
    return t.split("\n")[2]?.endsWith(' stale="true" />') ? t : null
  })
  return { stale: text.split("\n")[2] }
})

await step("restoring the file brings the stale element back", async () => {
  writeFileSync(compactFile, original)
  payLine = original.split("\n").findIndex((l) => l.includes('<Button size="lg"')) + 1
  await until("not stale", async () => !(await panelLine(2)).includes("Stale"), 12000)
  await until("pay line", async () => (await panelLine(0)).includes(`CompactCheckout.tsx:${payLine}`), 12000)
  await until("saved", async () => {
    const d = await api()
    return d.items.every((i) => !i.stale) && d.items[0].usedAt.line === payLine
  })
  return checkCli({ 0: payLine, 2: h1Line })
})

await step("screenshots (light, dark, narrow)", async () => {
  const c = await centerOf("checkout/compact", "label", { index: 1 })
  await page.mouse.move(c.x, c.y)
  await sleep(400)
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"))
  await page.screenshot({ path: `${shots}/pick-${dark ? "dark" : "light"}.png` })
  await page.keyboard.press("d")
  await sleep(500)
  await page.mouse.move(c.x, c.y + 1)
  await sleep(400)
  await page.screenshot({ path: `${shots}/pick-${dark ? "light" : "dark"}.png` })
  await page.keyboard.press("d")
  // Close up: the compact frame at its own size, hovering a field while three elements are selected.
  await page.getByText("Checkout · compact", { exact: true }).first().click()
  await sleep(800)
  await page.locator("main").click({ position: { x: 5, y: 5 } })
  for (const theme of ["light", "dark"]) {
    const f = await centerOf("checkout/compact", "input", { index: 1 })
    await page.mouse.move(f.x, f.y)
    await sleep(400)
    await page.screenshot({ path: `${shots}/pick-close-${theme}.png` })
    await page.keyboard.press("d")
    await sleep(500)
  }
  await page.setViewportSize({ width: 390, height: 800 })
  await sleep(600)
  await page.screenshot({ path: `${shots}/pick-narrow.png` })
  await page.setViewportSize({ width: 1440, height: 900 })
  await sleep(300)
})

await step("Esc clears the selection, then leaves select mode", async () => {
  await page.locator("main").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("Escape")
  await until("cleared", async () => (await panelItems()).length === 0)
  if ((await toggle.getAttribute("aria-pressed")) !== "true") throw new Error("left select mode too early")
  await page.keyboard.press("Escape")
  await until("mode off", async () => (await toggle.getAttribute("aria-pressed")) === "false")
  const pointer = await page.$$eval("iframe", (fs) => fs.filter((f) => f.style.pointerEvents === "auto").length)
  await until("saved empty", async () => (await api()).items.length === 0)
  return { interactiveFrames: pointer, cli: cli("selection").trim() }
})

await step("Esc pressed inside a frame (select mode) is handled too", async () => {
  await page.keyboard.press("s")
  const c = await centerOf("checkout/compact", "button", { text: "Pay" })
  await page.mouse.click(c.x, c.y)
  await until("picked", async () => (await panelItems()).length === 1)
  await frameOf("checkout/compact").evaluate(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  )
  await until("cleared", async () => (await panelItems()).length === 0)
  await page.keyboard.press("Escape")
  await until("mode off", async () => (await toggle.getAttribute("aria-pressed")) === "false")
})

restoreBoard()
await browser.close()

for (const r of results) {
  const { name, ok, ...rest } = r
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
  const detail = JSON.stringify(rest)
  if (detail !== "{}") console.log(`      ${detail.slice(0, 600)}`)
}
console.log(logs.length ? `console: ${JSON.stringify(logs.slice(0, 10))}` : "console: clean")
process.exit(results.every((r) => r.ok) ? 0 : 1)
