import { describe, expect, it } from "vitest"

import { jsxSnippet, stampJsx } from "./stamp.ts"

const stamps = (code: string, rel = "a/index.tsx") => {
  const out = stampJsx(code, rel)?.code ?? ""
  return [...out.matchAll(/data-fw-src(?:="([^"]*)"|=\{("(?:[^"\\]|\\.)*")\})/g)].map((m) => m[1] ?? JSON.parse(m[2]))
}

describe("stampJsx", () => {
  it("stamps host elements and components with path:line:col", () => {
    const code = [
      'import { Button } from "../_components/Button"',
      "",
      "export default function Page() {",
      "  return (",
      '    <div className="p-4">',
      "      <Button size=\"lg\">Pay</Button>",
      "    </div>",
      "  )",
      "}",
    ].join("\n")
    expect(stamps(code, "checkout/index.tsx")).toEqual(["checkout/index.tsx:5:5", "checkout/index.tsx:6:7"])
  })

  it("keeps every line where it was", () => {
    const code = "const a = (\n  <ul>\n    {xs.map((x) => (\n      <li key={x}>{x}</li>\n    ))}\n  </ul>\n)\n"
    const out = stampJsx(code, "f.tsx")!
    expect(out.code.split("\n").length).toBe(code.split("\n").length)
    expect(out.code.split("\n")[3]).toBe('      <li key={x} data-fw-src="f.tsx:4:7">{x}</li>')
    expect(out.count).toBe(2)
  })

  it("puts the stamp after spreads so an element keeps its own location", () => {
    const out = stampJsx("const B = (props) => <button type=\"button\" {...props} />", "_c/B.tsx")!.code
    expect(out).toBe('const B = (props) => <button type="button" {...props} data-fw-src="_c/B.tsx:1:22" />')
  })

  it("handles self-closing tags, member expressions and generics", () => {
    expect(stampJsx("x = <br/>", "f.tsx")!.code).toBe('x = <br data-fw-src="f.tsx:1:5"/>')
    expect(stampJsx("x = <Dialog.Root open />", "f.tsx")!.code).toBe('x = <Dialog.Root open data-fw-src="f.tsx:1:5" />')
    expect(stampJsx("x = <List<string> items={a} />", "f.tsx")!.code).toBe(
      'x = <List<string> items={a} data-fw-src="f.tsx:1:5" />'
    )
    expect(stampJsx("x = <List<string> />", "f.tsx")!.code).toBe('x = <List<string> data-fw-src="f.tsx:1:5" />')
  })

  it("leaves fragments alone but stamps their children", () => {
    const code = "x = <><a /><Fragment><b /></Fragment><React.Fragment key={1}><i /></React.Fragment></>"
    expect(stamps(code, "f.tsx")).toEqual(["f.tsx:1:7", "f.tsx:1:22", "f.tsx:1:62"])
  })

  it("is idempotent", () => {
    const once = stampJsx("x = <div><span /></div>", "f.tsx")!.code
    expect(stampJsx(once, "f.tsx")).toBeNull()
  })

  it("counts columns in UTF-16 code units, like editors and the DOM", () => {
    expect(stamps('const s = "é€"; x = <p>ü</p>', "f.tsx")).toEqual(["f.tsx:1:21"])
  })

  it("uses an expression when the path has characters a JSX string can't hold", () => {
    expect(stamps("x = <p />", 'we"ird/a&b {x}.tsx')).toEqual(['we"ird/a&b {x}.tsx:1:5'])
  })

  it("returns null without JSX or on a syntax error", () => {
    expect(stampJsx("export const a = 1 < 2", "f.ts")).toBeNull()
    expect(stampJsx("x = <div><span></div>", "f.tsx")).toBeNull()
  })

  it("still parses TypeScript syntax around JSX", () => {
    const code = "const f = <T,>(x: T) => x as unknown as T\nexport const C = (): JSX.Element => <main />"
    expect(stamps(code, "f.tsx")).toEqual(["f.tsx:2:37"])
  })

  it("produces a source map", () => {
    const out = stampJsx("x = <p />", "f.tsx")!
    expect(out.map.sources).toEqual(["f.tsx"])
    expect(out.map.mappings).not.toBe("")
  })
})

describe("jsxSnippet", () => {
  const code = [
    "export function X() {", // 1
    "  return (", // 2
    '    <div className="p-4">', // 3
    '      <Button variant="outline">Upgrade</Button>', // 4
    "      <Field", // 5
    '        label="Card information"', // 6
    "        trailing={<LockIcon />}", // 7
    "      />", // 8
    '      <Button size="lg" className="mt-6 w-full">', // 9
    "        Pay {money(total)}", // 10
    "      </Button>", // 11
    "    </div>", // 12
    "  )", // 13
    "}", // 14
  ].join("\n")

  it("returns a short one-line element whole", () => {
    expect(jsxSnippet(code, 4, 7)).toBe('<Button variant="outline">Upgrade</Button>')
  })

  it("collapses a multi-line opening tag to one line", () => {
    expect(jsxSnippet(code, 5, 7)).toBe('<Field label="Card information" trailing={<LockIcon />} />')
  })

  it("returns only the opening tag of a multi-line element", () => {
    expect(jsxSnippet(code, 9, 7)).toBe('<Button size="lg" className="mt-6 w-full">')
    expect(jsxSnippet(code, 3, 5)).toBe('<div className="p-4">')
  })

  it("finds nested elements by their column", () => {
    expect(jsxSnippet(code, 7, 19)).toBe("<LockIcon />")
  })

  it("truncates long tags", () => {
    const long = `x = <div className="${"a ".repeat(100)}">\n</div>`
    const snippet = jsxSnippet(long, 1, 5, 40)!
    expect(snippet).toHaveLength(40)
    expect(snippet.endsWith("…")).toBe(true)
  })

  it("returns null when no element starts there", () => {
    expect(jsxSnippet(code, 4, 8)).toBeNull()
    expect(jsxSnippet(code, 99, 1)).toBeNull()
  })
})
