import { describe, expect, it } from "vitest"

import { isFrameOwnFile, ordinal, parseStamp } from "./selection.ts"

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [101, "101st"],
    [111, "111th"],
  ])("%i -> %s", (n, text) => expect(ordinal(n)).toBe(text))
})

describe("parseStamp", () => {
  it("parses path:line:col, also with colons in the path", () => {
    expect(parseStamp("checkout/index.tsx:12:5")).toEqual({ file: "checkout/index.tsx", line: 12, col: 5 })
    expect(parseStamp("a:b/x.tsx:1:2")).toEqual({ file: "a:b/x.tsx", line: 1, col: 2 })
  })

  it("rejects anything else", () => {
    expect(parseStamp(null)).toBeNull()
    expect(parseStamp("x.tsx:12")).toBeNull()
    expect(parseStamp(":1:2")).toBeNull()
  })
})

describe("isFrameOwnFile", () => {
  it("accepts files in the frame folder and its hidden subfolders", () => {
    expect(isFrameOwnFile("checkout/compact", "checkout/compact/index.tsx")).toBe(true)
    expect(isFrameOwnFile("checkout/compact", "checkout/compact/CompactCheckout.tsx")).toBe(true)
    expect(isFrameOwnFile("checkout/compact", "checkout/compact/_parts/Row.tsx")).toBe(true)
  })

  it("rejects nested frames, siblings and shared code", () => {
    expect(isFrameOwnFile("checkout/compact", "checkout/compact/dark/index.tsx")).toBe(false)
    expect(isFrameOwnFile("checkout", "checkout/compact/CompactCheckout.tsx")).toBe(false)
    expect(isFrameOwnFile("checkout/compact", "checkout/compact-old/index.tsx")).toBe(false)
    expect(isFrameOwnFile("checkout/compact", "_components/Button.tsx")).toBe(false)
  })
})
