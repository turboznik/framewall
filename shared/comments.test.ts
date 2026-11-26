import { describe, expect, it } from "vitest"

import {
  cleanComments,
  formatBody,
  formatComments,
  isBodyEmpty,
  normalizeBody,
  plainBody,
  segmentsFromText,
  type Comment,
} from "./comments.ts"
import { formatRef, type ElementRef } from "./refs.ts"

const button: ElementRef = {
  kind: "element",
  frame: "checkout/compact",
  path: "CompactCheckout › Button",
  at: "checkout/compact/CompactCheckout.tsx:28",
}
const pricingButton: ElementRef = { kind: "element", frame: "pricing", path: "PricingPage › Button", at: "pricing/PricingPage.tsx:40" }

const comments: Comment[] = [
  {
    id: "c1",
    target: button,
    body: [
      { type: "text", text: "Make this the primary action, styled like " },
      { type: "ref", id: "r1", ref: pricingButton },
      { type: "text", text: "." },
    ],
    createdAt: "2026-11-22T00:00:00.000Z",
  },
  {
    id: "c2",
    target: { kind: "frame", frame: "checkout/mobile" },
    body: [
      { type: "text", text: "Too cramped. Match the spacing in " },
      { type: "ref", id: "r2", ref: { kind: "frame", frame: "checkout/compact" } },
      { type: "text", text: "." },
    ],
    createdAt: "2026-11-22T00:00:01.000Z",
  },
]

describe("formatComments", () => {
  it("prints the buffer as one tag per comment", () => {
    expect(formatComments("/work/shop/board", comments)).toBe(
      [
        '<framewall board="/work/shop/board">',
        '  <comment element="CompactCheckout › Button" frame="checkout/compact" at="checkout/compact/CompactCheckout.tsx:28">',
        '    Make this the primary action, styled like <element frame="pricing" path="PricingPage › Button" at="pricing/PricingPage.tsx:40" />.',
        "  </comment>",
        '  <comment frame="checkout/mobile">',
        '    Too cramped. Match the spacing in <frame id="checkout/compact" />.',
        "  </comment>",
        "</framewall>",
      ].join("\n")
    )
  })

  it("escapes the user's text so only real references read as tags", () => {
    const text = formatComments("/b", [
      { id: "x", target: { kind: "frame", frame: "f" }, body: [{ type: "text", text: 'Use <Button> & "primary", not <frame id="f" />' }], createdAt: "" },
    ])
    expect(text).toContain('    Use &lt;Button&gt; &amp; "primary", not &lt;frame id="f" /&gt;')
  })

  it("marks stale comments and adds instance / defined-in to the target", () => {
    const text = formatComments("/b", [
      {
        id: "x",
        target: { ...button, instance: 2, definedIn: "_components/Button.tsx:27", stale: true },
        body: [{ type: "text", text: "gone?" }],
        createdAt: "",
      },
    ])
    expect(text.split("\n")[1]).toBe(
      '  <comment element="CompactCheckout › Button" frame="checkout/compact" at="checkout/compact/CompactCheckout.tsx:28" instance="2" defined-in="_components/Button.tsx:27" stale="true">'
    )
  })

  it("indents multi-line text and keeps blank lines empty", () => {
    const text = formatComments("/b", [
      { id: "x", target: { kind: "frame", frame: "f" }, body: [{ type: "text", text: "  one\n\ntwo  \n" }], createdAt: "" },
    ])
    expect(text.split("\n").slice(1, 6)).toEqual(['  <comment frame="f">', "    one", "", "    two", "  </comment>"])
  })

  it("escapes the board path and handles an empty buffer and empty text", () => {
    expect(formatComments('/a "b"', [])).toBe('<framewall board="/a &quot;b&quot;">\n</framewall>')
    const text = formatComments("/b", [{ id: "x", target: { kind: "frame", frame: "f" }, body: [], createdAt: "" }])
    expect(text.split("\n")[1]).toBe('  <comment frame="f" />')
  })
})

describe("bodies", () => {
  it("turns pasted text with tags into segments and back", () => {
    let n = 0
    const text = `Like ${formatRef(pricingButton)} & <b>bold</b>`
    const body = segmentsFromText(text, () => `id${++n}`)
    expect(body).toEqual([
      { type: "text", text: "Like " },
      { type: "ref", id: "id1", ref: pricingButton },
      { type: "text", text: " & <b>bold</b>" },
    ])
    expect(formatBody(body)).toBe(`Like ${formatRef(pricingButton)} &amp; &lt;b&gt;bold&lt;/b&gt;`)
    expect(plainBody(body)).toBe("Like @Button · pricing & <b>bold</b>")
  })

  it("normalizes and detects empty bodies", () => {
    expect(normalizeBody([{ type: "text", text: "a" }, { type: "text", text: "" }, { type: "text", text: "b" }])).toEqual([{ type: "text", text: "ab" }])
    expect(isBodyEmpty([{ type: "text", text: "  \n" }])).toBe(true)
    expect(isBodyEmpty([{ type: "ref", id: "r", ref: pricingButton }])).toBe(false)
  })
})

describe("cleanComments", () => {
  it("keeps valid comments, drops malformed ones and duplicates", () => {
    const cleaned = cleanComments([
      comments[0],
      { ...comments[0] },
      null,
      { id: "bad" },
      { id: "t", target: { kind: "frame", frame: "f" }, body: [{ type: "text", text: 1 }, { type: "ref", id: "r", ref: { kind: "x" } }, { type: "text", text: "ok" }] },
    ])
    expect(cleaned.map((c) => c.id)).toEqual(["c1", "t"])
    expect(cleaned[0]).toEqual(comments[0])
    expect(cleaned[1].body).toEqual([{ type: "text", text: "ok" }])
    expect(cleanComments("nope")).toEqual([])
  })
})
