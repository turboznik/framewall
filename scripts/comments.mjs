// Comments, end to end: comment on an element and on a frame, insert references
// with @ and by pasting a copied tag, pins, chips (hover highlights, click
// moves the canvas), Copy all (exact XML) against `framewall comments`,
// edit, reload, pins following a hot update, stale comments (element removed,
// frame deleted), delete/clear with undo, `--clear` from the CLI, and
// screenshots in light, dark and at phone width.
//
//   BASE=http://127.0.0.1:5173 node scripts/comments.mjs
//
// Edits example-board/checkout/compact/CompactCheckout.tsx and adds a temporary
// frame (example-board/e2e-temp); both are restored at the end.
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

import { snapshotBoard } from "./board-snapshot.mjs"

const base = process.env.BASE ?? "http://127.0.0.1:5173"
const shots = process.env.SHOTS ?? "shots/comments"
const repo = fileURLToPath(new URL("..", import.meta.url))
const board = `${repo}example-board`
const compactFile = `${board}/checkout/compact/CompactCheckout.tsx`
const tempFrame = `${board}/e2e-temp`
const original = readFileSync(compactFile, "utf8")
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

const json = (path) => async (init) => (await fetch(`${base}/__framewall/${path}`, init)).json()
const comments = json("comments")
const putJson = (path, body) =>
  fetch(`${base}/__framewall/${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const cli = (...args) =>
  execFileSync(process.execPath, ["bin/framewall", "comments", ...args], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
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
  throw new Error(`timeout: ${label} (last: ${JSON.stringify(last)?.slice(0, 400)})`)
}
let failed = false
async function step(name, fn) {
  if (failed && !name.startsWith("screenshots")) {
    results.push({ name, ok: false, error: "skipped (an earlier step failed)" })
    return
  }
  try {
    const detail = (await fn()) ?? {}
    results.push({ name, ok: true, ...detail })
  } catch (e) {
    failed = true
    results.push({ name, ok: false, error: e.message })
  }
}

// Start from an empty buffer and selection, and a clean board.
rmSync(tempFrame, { recursive: true, force: true })
const restoreBoard = snapshotBoard(board)
await putJson("comments", { comments: [] })
await putJson("selection", { items: [] })

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

/** Page rectangle of the `index`-th `selector` match in a frame. */
async function rectOf(frameId, selector, { index = 0, text } = {}) {
  const ib = await page.locator(`iframe[data-frame-id="${frameId}"]`).boundingBox()
  const r = await frameOf(frameId).evaluate(
    ([sel, index, text]) => {
      let els = [...document.querySelectorAll(sel)]
      if (text) els = els.filter((e) => e.textContent.includes(text))
      const b = els[index].getBoundingClientRect()
      return { x: b.left, y: b.top, w: b.width, h: b.height, vw: window.innerWidth }
    },
    [selector, index, text]
  )
  const s = ib.width / r.vw
  return { x: ib.x + r.x * s, y: ib.y + r.y * s, w: r.w * s, h: r.h * s }
}
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

const composer = page.locator("[data-composer]")
const panel = page.locator("section[data-panel]")
const cards = page.locator("[data-comment]")
const pins = page.locator("[data-comment-pin]")
const toast = page.locator("[data-toast]").last()
const countBadge = page.locator("[data-comment-count]")
const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
const setClipboard = (text) => page.evaluate((t) => navigator.clipboard.writeText(t), text)

/** Paste into the focused editor: the real shortcut, else a synthetic paste event. */
async function paste(text) {
  await setClipboard(text)
  const before = await composer.innerHTML()
  await page.keyboard.press("ControlOrMeta+KeyV")
  await sleep(150)
  if ((await composer.innerHTML()) !== before) return "keyboard"
  await composer.evaluate((el, t) => {
    const data = new DataTransfer()
    data.setData("text/plain", t)
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
  return "event"
}

/** What the picker overlay draws for a hovered chip. */
const highlightShown = (frameId) =>
  frameOf(frameId).evaluate(() => {
    const hl = document.querySelector("framewall-overlay")?.shadowRoot?.querySelector(".hl")
    return !!hl && hl.style.display === "block"
  })

/** Frame the two checkout frames left of the panel. */
async function frameCheckout() {
  await page.getByText("Checkout · compact", { exact: true }).first().click()
  await sleep(700)
  for (let i = 0; i < 8; i++) {
    const b = await page.locator('iframe[data-frame-id="checkout/mobile"]').boundingBox()
    const v = page.viewportSize()
    if (b && b.x >= 0 && b.y >= 60 && b.x + b.width <= v.width - 420 && b.y + b.height <= v.height) break
    await page.keyboard.press("-")
    await sleep(350)
  }
}
await frameCheckout()

// Reloads would wipe these (the canvas, and the frames).
const setMarkers = async () => {
  await page.evaluate(() => (window.__marker = "kept"))
  for (const id of ["checkout/compact", "checkout/mobile"]) await frameOf(id).evaluate(() => (window.__frameMarker = "kept"))
}
const markersKept = async () => {
  const canvas = await page.evaluate(() => window.__marker === "kept")
  const frames = await Promise.all(["checkout/compact", "checkout/mobile"].map((id) => frameOf(id).evaluate(() => window.__frameMarker === "kept")))
  return canvas && !frames.includes(false)
}
await setMarkers()

let payLine = original.split("\n").findIndex((l) => l.includes('<Button size="lg"')) + 1
const payAttrs = () => `frame="checkout/compact" at="checkout/compact/CompactCheckout.tsx:${payLine}" defined-in="_components/Button.tsx:27"`
const payTag = () => `<element frame="checkout/compact" path="CompactCheckout › Button" at="checkout/compact/CompactCheckout.tsx:${payLine}" defined-in="_components/Button.tsx:27" />`
const text1 = "Make this the primary action & keep <Button> styles"
const plainPaste = "(see <b>design</b>)"

await step("C on a picked element opens the composer; ⌘↵ adds comment 1", async () => {
  await page.locator("main").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("s")
  const pay = center(await rectOf("checkout/compact", "button", { text: "Pay" }))
  await page.mouse.click(pay.x, pay.y)
  await until("picked", async () => (await page.locator("[data-uid]").count()) === 1)
  await page.keyboard.press("c") // forwarded from the frame
  await until("composer focused", () => composer.evaluate((el) => document.activeElement === el))
  const chip = await page.locator("[data-new-comment] [data-chip]").first().innerText()
  if (!/^Button\s*· checkout\/compact$/.test(chip.trim())) throw new Error(`target chip "${chip}"`)
  await page.keyboard.type(text1)
  await page.keyboard.press("ControlOrMeta+Enter")
  const data = await until("saved", async () => {
    const d = await comments()
    return d.comments.length === 1 ? d : null
  })
  if (data.comments[0].target.kind !== "element") throw new Error(`target ${JSON.stringify(data.comments[0].target)}`)
  await until("badge 1", async () => (await countBadge.innerText()) === "1")
  await until("pin 1", async () => (await page.locator('[data-pin="1"]').count()) === 1)
  return { toast: await toast.innerText(), chip }
})

await step("pin 1 sits on the element's top-right corner", async () => {
  const pay = await rectOf("checkout/compact", "button", { text: "Pay" })
  const pin = await page.locator('[data-pin="1"]').boundingBox()
  const dx = Math.abs(pin.x + pin.width / 2 - (pay.x + pay.w))
  const dy = Math.abs(pin.y + pin.height / 2 - pay.y)
  if (dx > 24 || dy > 24) throw new Error(`pin at ${JSON.stringify(pin)}, element ${JSON.stringify(pay)}`)
  return { dx: Math.round(dx), dy: Math.round(dy) }
})

let mentionShot = false
await step("C on a frame (label click); @ inserts a frame, a pasted tag becomes a chip, other text stays text", async () => {
  // Copy the element's tag (its Copy reference button) to paste later.
  await page.locator('[data-tab="selection"]').click()
  await page.locator("[data-uid]").first().getByRole("button", { name: "Copy reference" }).click()
  if ((await clipboard()) !== payTag()) throw new Error(`copied ${await clipboard()}`)
  await page.getByText("Checkout · mobile", { exact: true }).first().click()
  await sleep(500)
  await page.keyboard.press("c")
  await until("composer focused", () => composer.evaluate((el) => document.activeElement === el))
  const target = (await page.locator("[data-new-comment] [data-chip]").first().innerText()).trim()
  if (target !== "checkout/mobile") throw new Error(`target chip "${target}"`)
  await page.keyboard.type("Match the spacing of @compact")
  const options = await until("mention list", async () => {
    const o = await page.locator("[data-mention-option]").allInnerTexts()
    return o.length ? o : null
  })
  if (!options.some((o) => o.startsWith("Button"))) throw new Error(`no selected element offered: ${options}`)
  const frameIndex = options.findIndex((o) => o.startsWith("checkout/compact"))
  if (frameIndex < 0) throw new Error(`no frame offered: ${options}`)
  await page.screenshot({ path: `${shots}/comments-mention-light.png` })
  mentionShot = true
  for (let i = 0; i < frameIndex; i++) await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await until("frame chip", async () => (await composer.locator("[data-chip]").count()) === 1)
  await page.keyboard.type("and move ")
  const via = await paste(payTag())
  await until("pasted chip", async () => (await composer.locator("[data-chip]").count()) === 2)
  await page.keyboard.type(" up. ")
  await paste(plainPaste)
  await until("plain text pasted", async () => (await composer.innerText()).includes(plainPaste))
  if ((await composer.locator("[data-chip]").count()) !== 2) throw new Error("plain text became a chip")
  await page.keyboard.press("ControlOrMeta+Enter")
  const data = await until("saved", async () => {
    const d = await comments()
    return d.comments.length === 2 ? d : null
  })
  const body = data.comments[1].body
  const kinds = body.map((s) => (s.type === "text" ? "text" : s.ref.kind)).join(",")
  if (kinds !== "text,frame,text,element,text") throw new Error(`body ${JSON.stringify(body)}`)
  await until("pin 2", async () => (await page.locator('[data-pin="2"]').count()) === 1)
  return { via, options }
})

const expectedXml = () =>
  [
    `<framewall board="${board}">`,
    `  <comment element="CompactCheckout › Button" ${payAttrs()}>`,
    "    Make this the primary action &amp; keep &lt;Button&gt; styles",
    "  </comment>",
    '  <comment frame="checkout/mobile">',
    `    Match the spacing of <frame id="checkout/compact" /> and move ${payTag()} up. (see &lt;b&gt;design&lt;/b&gt;)`,
    "  </comment>",
    "</framewall>",
  ].join("\n")

await step("Copy all puts the exact XML on the clipboard; the CLI prints the same", async () => {
  await page.locator('[data-tab="comments"]').click()
  await page.getByRole("button", { name: "Copy all comments" }).click()
  const copied = await until("copied", async () => (await clipboard()).startsWith("<framewall") && (await clipboard()))
  if (copied !== expectedXml()) throw new Error(`clipboard:\n${copied}\n--- want:\n${expectedXml()}`)
  const printed = cli().trimEnd()
  if (printed !== copied) throw new Error(`CLI:\n${printed}`)
  const data = JSON.parse(cli("--json"))
  if (data.comments.length !== 2 || data.board !== board) throw new Error(`--json: ${JSON.stringify(data).slice(0, 200)}`)
  return { copied }
})

await step("saving comments reloads nothing", async () => {
  await sleep(1200)
  if (!(await markersKept())) throw new Error("the canvas or a frame reloaded")
})

await step("pin 2 sits by the frame's top-right corner; clicking it opens comment 2", async () => {
  const frame = await page.locator('iframe[data-frame-id="checkout/mobile"]').boundingBox()
  const pin = await page.locator('[data-pin="2"]').boundingBox()
  const dx = pin.x - (frame.x + frame.width)
  const dy = frame.y - (pin.y + pin.height)
  if (dx < -2 || dx > 30 || dy < -30 || dy > 30) throw new Error(`pin ${JSON.stringify(pin)}, frame ${JSON.stringify(frame)}`)
  const ids = (await comments()).comments.map((c) => c.id)
  await page.locator("[data-comments-toggle]").click() // close the panel first
  await until("closed", async () => (await panel.count()) === 0 || (await panel.getAttribute("data-panel")) !== "comments")
  await page.locator('[data-pin="2"]').click()
  await until("comment 2 focused", async () => (await page.locator(`[data-comment="${ids[1]}"][data-focused]`).count()) === 1)
  return { dx: Math.round(dx), dy: Math.round(dy) }
})

await step("hovering chips highlights the target; clicking one moves the canvas", async () => {
  const card = page.locator("[data-comment]").nth(1)
  await card.locator("[data-chip]", { hasText: "checkout/compact" }).first().hover()
  await until("frame outlined", async () => (await page.locator('[data-item-id="checkout/compact"][data-highlight]').count()) === 1)
  await card.locator("[data-chip]", { hasText: "Button" }).hover()
  await until("element outlined", () => highlightShown("checkout/compact"))
  await page.mouse.move(700, 880)
  await until("highlight off", async () => !(await highlightShown("checkout/compact")))
  const before = await page.$eval("[data-world]", (w) => w.style.transform)
  await card.locator("[data-chip]", { hasText: "Button" }).click()
  await until("camera moved", async () => (await page.$eval("[data-world]", (w) => w.style.transform)) !== before, 4000)
  await sleep(900)
  const pay = await rectOf("checkout/compact", "button", { text: "Pay" })
  const v = page.viewportSize()
  if (pay.x < 0 || pay.y < 0 || pay.x + pay.w > v.width || pay.y + pay.h > v.height) throw new Error(`element off screen: ${JSON.stringify(pay)}`)
  await frameCheckout()
  return { element: pay }
})

await step("edit a comment; the CLI follows", async () => {
  const card = cards.first()
  await card.hover()
  await card.getByRole("button", { name: "Edit comment" }).click()
  await until("editing", () => card.locator("[data-composer]").evaluate((el) => document.activeElement === el))
  await page.keyboard.type(", and make it larger")
  await page.keyboard.press("ControlOrMeta+Enter")
  await until("saved", async () => cli().includes("styles, and make it larger"))
  const text = await card.innerText()
  if (!text.includes("styles, and make it larger")) throw new Error(`card: ${text}`)
})

await step("reload brings back the buffer, pins and badge; Copy all = CLI", async () => {
  await page.reload({ waitUntil: "load" })
  await allRendered()
  await until("badge", async () => (await countBadge.innerText()) === "2")
  await until("pins", async () => (await pins.count()) === 2, 10000)
  await page.locator("[data-comments-toggle]").click()
  await until("cards", async () => (await cards.count()) === 2)
  await page.getByRole("button", { name: "Copy all comments" }).click()
  const copied = await until("copied", async () => (await clipboard()).includes("make it larger") && (await clipboard()))
  if (copied !== cli().trimEnd()) throw new Error(`clipboard and CLI differ:\n${copied}`)
  await frameCheckout() // the reload fitted the whole board
  await setMarkers()
  return { pins: await pins.count() }
})

await step("a hot update that moves the element moves its pin and updates `at`", async () => {
  const before = await page.locator('[data-pin="1"]').boundingBox()
  const lines = original.split("\n")
  lines.splice(payLine - 1, 0, '            <p className="mt-6 text-sm text-zinc-500">Pin test: pushes the button down.</p>')
  writeFileSync(compactFile, lines.join("\n"))
  payLine += 1
  let last = null
  const after = await until(
    "pin moved",
    async () => {
      const b = await page.locator('[data-pin="1"]').boundingBox()
      last = b
      return b && b.y > before.y + 2 ? b : null
    },
    12000
  ).catch(async (e) => {
    const target = (await comments()).comments[0]?.target
    const pay = await rectOf("checkout/compact", "button", { text: "Pay" }).catch(() => null)
    throw new Error(`${e.message}; pin before ${JSON.stringify(before)}, now ${JSON.stringify(last)}, button ${JSON.stringify(pay)}, target ${JSON.stringify(target)}`)
  })
  await until("at updated", async () => cli().includes(`CompactCheckout.tsx:${payLine}"`), 12000)
  if (!(await markersKept())) throw new Error("the canvas reloaded")
  return { moved: Math.round(after.y - before.y) }
})

await step("removing the element keeps comment 1, marked stale, without a pin", async () => {
  const lines = original.split("\n")
  const start = lines.findIndex((l) => l.includes('<Button size="lg"'))
  lines.splice(start, 3) // <Button …> … </Button>
  writeFileSync(compactFile, lines.join("\n"))
  await until("stale marker", async () => (await cards.first().locator("[data-stale]").count()) === 1, 12000)
  await until("pin gone", async () => (await page.locator('[data-pin="1"]').count()) === 0)
  if ((await cards.count()) !== 2) throw new Error("a comment was dropped")
  const printed = await until("stale in the CLI", async () => {
    const t = cli()
    return t.includes('stale="true"') ? t : null
  })
  const head = printed.split("\n")[1]
  if (!head.startsWith('  <comment element="CompactCheckout › Button" frame="checkout/compact"') || !head.endsWith(' stale="true">'))
    throw new Error(`comment 1: ${head}`)
  await page.screenshot({ path: `${shots}/comments-stale-light.png` })
  return { head }
})

await step("restoring the file brings comment 1 back", async () => {
  writeFileSync(compactFile, original)
  payLine = original.split("\n").findIndex((l) => l.includes('<Button size="lg"')) + 1
  await until("not stale", async () => (await cards.first().locator("[data-stale]").count()) === 0, 12000)
  await until("pin back", async () => (await page.locator('[data-pin="1"]').count()) === 1, 12000)
  await until("CLI", async () => !cli().includes("stale") && cli().includes(`CompactCheckout.tsx:${payLine}"`))
})

await step("deleting a commented frame keeps its comment, marked stale", async () => {
  mkdirSync(tempFrame, { recursive: true })
  writeFileSync(`${tempFrame}/index.tsx`, 'export default function E2eTemp() {\n  return <div className="p-6">Temporary frame</div>\n}\n')
  const row = page.locator('[role="treeitem"][title="e2e-temp"]')
  await until("tree row", async () => (await row.count()) === 1, 12000)
  await row.click()
  await sleep(600)
  await page.keyboard.press("c")
  await until("composer", () => composer.evaluate((el) => document.activeElement === el))
  await page.keyboard.type("Temporary")
  await page.keyboard.press("ControlOrMeta+Enter")
  await until("saved", async () => (await comments()).comments.length === 3)
  await until("pin 3", async () => (await page.locator('[data-pin="3"]').count()) === 1)
  const treeCount = await row.locator("[data-tree-comments]").innerText()
  rmSync(tempFrame, { recursive: true, force: true })
  await until("stale", async () => (await cards.nth(2).locator("[data-stale]").count()) === 1, 12000)
  await until("pin 3 gone", async () => (await page.locator('[data-pin="3"]').count()) === 0)
  const saved = await until("stale saved", async () => {
    const d = await comments()
    return d.comments[2]?.target.stale ? d : null
  })
  if (!cli().includes('<comment frame="e2e-temp" stale="true">')) throw new Error(cli())
  return { treeCount: treeCount.trim(), comments: saved.comments.length }
})

await step("delete offers undo; undo puts the comment back in place", async () => {
  const third = cards.nth(2)
  await third.hover()
  await third.getByRole("button", { name: "Delete comment" }).click()
  await until("deleted", async () => (await comments()).comments.length === 2)
  await toast.getByRole("button", { name: "Undo" }).click()
  const d = await until("restored", async () => {
    const d = await comments()
    return d.comments.length === 3 ? d : null
  })
  if (d.comments[2].body[0]?.text !== "Temporary") throw new Error(`order: ${JSON.stringify(d.comments.map((c) => c.body))}`)
  // Now delete it for good.
  await cards.nth(2).hover()
  await cards.nth(2).getByRole("button", { name: "Delete comment" }).click()
  await until("deleted", async () => (await comments()).comments.length === 2)
})

await step("screenshots (light, dark, phone)", async () => {
  await page.keyboard.press("Escape") // leave select mode's hover out of it
  await frameCheckout()
  await page.mouse.move(720, 890)
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"))
  if (!(await panel.count()) || (await panel.getAttribute("data-panel")) !== "comments") await page.locator("[data-comments-toggle]").click()
  await sleep(500)
  await page.screenshot({ path: `${shots}/comments-${dark ? "dark" : "light"}.png` })
  await page.keyboard.press("d")
  await sleep(600)
  await page.screenshot({ path: `${shots}/comments-${dark ? "light" : "dark"}.png` })
  if (!mentionShot) await page.keyboard.press("d")
  else {
    // The composer with the @ list, in dark.
    await page.getByText("Checkout · compact", { exact: true }).first().click()
    await sleep(400)
    await page.keyboard.press("c")
    await until("composer", () => composer.evaluate((el) => document.activeElement === el))
    await page.keyboard.type("Compare with @check")
    await until("list", async () => (await page.locator("[data-mention-option]").count()) > 0)
    await page.screenshot({ path: `${shots}/comments-mention-dark.png` })
    await page.keyboard.press("Escape") // closes the list
    await page.keyboard.press("Escape") // cancels the draft
    await until("draft gone", async () => (await page.locator("[data-new-comment]").count()) === 0)
    await page.keyboard.press("d")
  }
  await page.setViewportSize({ width: 390, height: 800 })
  await sleep(700)
  await page.keyboard.press("Shift+Digit2") // the selected frame, centred
  await sleep(700)
  if (!(await panel.count())) await page.locator("[data-comments-toggle]").click()
  await sleep(400)
  await page.screenshot({ path: `${shots}/comments-phone.png` })
  await page.setViewportSize({ width: 1440, height: 900 })
  await sleep(400)
})

await step("Clear offers undo; undo restores the buffer", async () => {
  if (!(await panel.count()) || (await panel.getAttribute("data-panel")) !== "comments") await page.locator("[data-comments-toggle]").click()
  await page.getByRole("button", { name: "Clear all comments" }).click()
  await until("cleared", async () => (await comments()).comments.length === 0)
  if ((await countBadge.count()) && (await countBadge.innerText()) !== "0") throw new Error("badge still shows comments")
  await toast.getByRole("button", { name: "Undo" }).click()
  await until("restored", async () => (await comments()).comments.length === 2)
  await until("pins back", async () => (await pins.count()) === 2, 10000)
})

await step("framewall comments --clear empties the canvas too", async () => {
  const out = cli("--clear")
  await until("canvas emptied", async () => (await cards.count()) === 0)
  await until("toast", async () => (await toast.innerText()).includes("command line"))
  // Nothing on stdout (so it pipes cleanly); the hint goes to stderr.
  const empty = spawnSync(process.execPath, ["bin/framewall", "comments"], { cwd: repo, encoding: "utf8" })
  const after = empty.stderr.trim()
  if (empty.stdout !== "" || !after.startsWith("No comments")) throw new Error(`stdout "${empty.stdout}", stderr "${after}"`)
  if (!(await markersKept())) throw new Error("the canvas reloaded")
  return { out: out.trim(), after }
})

restoreBoard()
await putJson("selection", { items: [] })
await browser.close()

for (const r of results) {
  const { name, ok, ...rest } = r
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`)
  const detail = JSON.stringify(rest)
  if (detail !== "{}") console.log(`      ${detail.slice(0, 700)}`)
}
console.log(logs.length ? `console: ${JSON.stringify(logs.slice(0, 10))}` : "console: clean")
process.exit(results.every((r) => r.ok) ? 0 : 1)
