import { describe, expect, it } from "vitest"

import {
  cleanRef,
  escapeAttr,
  escapeText,
  formatRef,
  formatSelection,
  isRef,
  parseRef,
  parseRefs,
  refFromInfo,
  refLabel,
  sameRef,
  unescapeXml,
  type ElementRef,
  type Ref,
} from "./refs.ts"
import type { ElementInfo } from "./selection.ts"

const key = { src: "_components/Button.tsx:27:5", usedAt: "checkout/compact/CompactCheckout.tsx:28:13", index: 0, loose: "button|Button|_components/Button.tsx|checkout/compact/CompactCheckout.tsx", looseIndex: 0, looseCount: 1 }

function info(overrides: Partial<ElementInfo> = {}): ElementInfo {
  return {
    frameId: "checkout/compact",
    name: "Button",
    tag: "button",
    crumbs: ["CompactLight", "CompactCheckout", "Button"],
    usedAt: { file: "checkout/compact/CompactCheckout.tsx", line: 28, col: 13 },
    definedIn: { file: "checkout/compact/CompactCheckout.tsx", line: 28, col: 13 },
    nth: 1,
    count: 1,
    key,
    ...overrides,
  }
}

describe("formatRef", () => {
  it("formats a frame", () => {
    expect(formatRef({ kind: "frame", frame: "checkout/mobile" })).toBe('<frame id="checkout/mobile" />')
  })

  it("formats an element with the short path and the used-at location", () => {
    expect(formatRef(refFromInfo(info()))).toBe(
      '<element frame="checkout/compact" path="CompactCheckout › Button" at="checkout/compact/CompactCheckout.tsx:28" />'
    )
  })

  it("adds instance only for repeated JSX and defined-in only when it differs", () => {
    const ref = refFromInfo(info({ nth: 2, count: 3, definedIn: { file: "_components/Button.tsx", line: 27, col: 5 } }))
    expect(formatRef(ref)).toBe(
      '<element frame="checkout/compact" path="CompactCheckout › Button" at="checkout/compact/CompactCheckout.tsx:28" instance="2" defined-in="_components/Button.tsx:27" />'
    )
  })

  it("adds columns when two different elements share a line", () => {
    const ref = refFromInfo(
      info({
        crumbs: ["Pricing", "span"],
        usedAt: { file: "pricing/index.tsx", line: 4, col: 7 },
        definedIn: { file: "pricing/index.tsx", line: 4, col: 19 },
      })
    )
    expect(ref.at).toBe("pricing/index.tsx:4:7")
    expect(ref.definedIn).toBe("pricing/index.tsx:4:19")
    expect(ref.path).toBe("Pricing › span")
  })

  it("escapes attribute values", () => {
    expect(formatRef({ kind: "frame", frame: 'a "b" <c> & d' })).toBe('<frame id="a &quot;b&quot; &lt;c&gt; &amp; d" />')
    expect(formatRef({ kind: "frame", frame: "line\nbreak" })).toBe('<frame id="line&#10;break" />')
  })

  it("leaves out tracking state", () => {
    const tag = formatRef({ ...refFromInfo(info()), stale: true })
    expect(tag).not.toContain("stale")
    expect(tag).not.toContain("key")
  })

  it("formats a selection one reference per line", () => {
    const text = formatSelection([info(), info({ frameId: "pricing", crumbs: ["PricingPage", "Button"] })])
    expect(text.split("\n")).toHaveLength(2)
    expect(text.split("\n")[1]).toMatch(/^<element frame="pricing" path="PricingPage › Button"/)
  })

  it("marks stale selected elements; the marked tag still parses (staleness is re-checked, not pasted)", () => {
    const [live, stale] = formatSelection([info(), { ...info(), stale: true }]).split("\n")
    expect(live).not.toContain("stale")
    expect(stale).toMatch(/ stale="true" \/>$/)
    expect(parseRef(stale)).toEqual(parseRef(live))
  })
})

describe("parseRef", () => {
  const refs: Ref[] = [
    { kind: "frame", frame: "checkout/mobile" },
    { kind: "element", frame: "checkout/compact", path: "CompactCheckout › Button", at: "checkout/compact/CompactCheckout.tsx:28" },
    { kind: "element", frame: "pricing", path: "PricingPage › li", at: "pricing/PricingPage.tsx:40:9", instance: 3, definedIn: "pricing/PricingPage.tsx:40:21" },
    { kind: "frame", frame: 'odd "id" with <brackets> & ampersands' },
    { kind: "element", frame: "x", path: "A › B", at: "x/index.tsx:1", definedIn: "_c/it's.tsx:2" },
  ]

  it.each(refs.map((r) => [formatRef(r), r]))("round-trips %s", (tag, ref) => {
    expect(parseRef(tag)).toEqual(ref)
  })

  it("round-trips what refFromInfo builds (minus the key)", () => {
    const ref = refFromInfo(info({ nth: 2, count: 2, definedIn: { file: "_components/Button.tsx", line: 27, col: 5 } }))
    const plain: Partial<typeof ref> = { ...ref }
    delete plain.key
    expect(parseRef(formatRef(ref))).toEqual(plain)
  })

  it("accepts any attribute order, single quotes, no space before />, and unknown attributes", () => {
    expect(parseRef(`<element at='a.tsx:3' extra="1" path="P › Q" frame="f"/>`)).toEqual({ kind: "element", frame: "f", path: "P › Q", at: "a.tsx:3" })
  })

  it("rejects incomplete or foreign tags", () => {
    for (const text of [
      '<frame />',
      '<frame id="" />',
      '<frame id="a">',
      '<element path="A" />',
      '<element frame="f" />',
      '<div id="a" />',
      'frame id="a"',
      '<frame id="a" /> trailing',
    ]) {
      expect(parseRef(text), text).toBeNull()
    }
  })

  it("ignores a bad instance", () => {
    expect(parseRef('<element frame="f" path="A" instance="0" />')).toEqual({ kind: "element", frame: "f", path: "A" })
    expect(parseRef('<element frame="f" path="A" instance="two" />')).toEqual({ kind: "element", frame: "f", path: "A" })
  })
})

describe("parseRefs (paste recognition)", () => {
  it("splits text around tags", () => {
    const parts = parseRefs('Match <frame id="checkout/compact" /> and <element frame="pricing" path="PricingPage › Button" at="pricing/PricingPage.tsx:40" />.')
    expect(parts).toEqual([
      "Match ",
      { kind: "frame", frame: "checkout/compact" },
      " and ",
      { kind: "element", frame: "pricing", path: "PricingPage › Button", at: "pricing/PricingPage.tsx:40" },
      ".",
    ])
  })

  it("keeps plain text and lookalikes as text", () => {
    expect(parseRefs("just text")).toEqual(["just text"])
    expect(parseRefs("a <b> c")).toEqual(["a <b> c"])
    expect(parseRefs('<frame id="" /> <frame>')).toEqual(['<frame id="" /> <frame>'])
    expect(parseRefs("").some(isRef)).toBe(false)
  })

  it("recognizes several copied tags, one per line", () => {
    const text = formatSelection([info(), info({ frameId: "pricing" })])
    const parts = parseRefs(text)
    expect(parts.filter(isRef)).toHaveLength(2)
    expect(parts.filter((p) => !isRef(p))).toEqual(["\n"])
  })
})

describe("escaping", () => {
  it("escapes text and attributes", () => {
    expect(escapeText('a < b && c > "d"')).toBe('a &lt; b &amp;&amp; c &gt; "d"')
    expect(escapeAttr('"x" & <y>')).toBe("&quot;x&quot; &amp; &lt;y&gt;")
  })

  it("unescapes named and numeric entities, and leaves unknown ones", () => {
    expect(unescapeXml("&lt;&gt;&amp;&quot;&apos;&#10;&#x41;&nope;")).toBe("<>&\"'\nA&nope;")
  })
})

describe("labels and identity", () => {
  it("labels chips", () => {
    expect(refLabel(refFromInfo(info()))).toBe("Button · checkout/compact")
    expect(refLabel({ kind: "frame", frame: "checkout/mobile" })).toBe("checkout/mobile")
  })

  it("compares references by what they point at", () => {
    const a = refFromInfo(info())
    expect(sameRef(a, { ...a, key: undefined, stale: true })).toBe(true)
    expect(sameRef(a, { ...a, instance: 2 })).toBe(false)
    expect(sameRef({ kind: "frame", frame: "x" }, { kind: "frame", frame: "x" })).toBe(true)
    expect(sameRef({ kind: "frame", frame: "x" }, { ...a, frame: "x" })).toBe(false)
  })

  it("cleans untrusted references", () => {
    expect(cleanRef({ kind: "frame", frame: "a", extra: 1 })).toEqual({ kind: "frame", frame: "a" })
    expect(cleanRef({ kind: "element", frame: "a" })).toBeNull()
    expect(cleanRef({ kind: "nope", frame: "a" })).toBeNull()
    const cleaned = cleanRef({ kind: "element", frame: "a", path: "B", instance: 1.5, key: { src: 1 }, stale: true }) as ElementRef
    expect(cleaned).toEqual({ kind: "element", frame: "a", path: "B", stale: true })
  })
})
