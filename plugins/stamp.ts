/**
 * Source stamps for element picking.
 *
 * `stampJsx` adds `data-fw-src="<board-relative path>:<line>:<col>"` to every JSX
 * element of a board file (host tags and components alike). Host elements carry
 * it into the DOM; for components the frame runtime reads it from the React fiber
 * (`memoizedProps`), which works even when a component doesn't forward props.
 *
 * The attribute goes after the element's existing attributes, so it wins over a
 * spread (`<button {...props}>` keeps its own location, not its caller's), and it
 * is inserted on the same line, so line numbers in the output never move.
 *
 * `jsxSnippet` returns the JSX at a stamped location as one line of source, for
 * the reference blocks.
 */

import { parse, type ParserOptions } from "@babel/parser"
import MagicString from "magic-string"

import { STAMP_ATTR } from "../shared/selection.ts"

const PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
  plugins: ["jsx", "typescript"],
  errorRecovery: true,
}

/** Minimal shape of the Babel AST nodes we look at. */
interface Node {
  type: string
  start?: number | null
  end?: number | null
  loc?: { start: { line: number; column: number } } | null
  [key: string]: unknown
}

const SKIP_KEYS = new Set(["loc", "start", "end", "extra", "leadingComments", "trailingComments", "innerComments", "comments", "tokens"])

function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (!node || typeof node !== "object" || typeof (node as Node).type !== "string") return
  visit(node as Node)
  for (const key in node) {
    if (SKIP_KEYS.has(key)) continue
    const value = (node as Record<string, unknown>)[key]
    if (value && typeof value === "object") walk(value, visit)
  }
}

function parseSource(code: string): Node | null {
  try {
    return parse(code, PARSER_OPTIONS) as unknown as Node
  } catch {
    return null
  }
}

/** `<>`, `<Fragment>` and `<React.Fragment>` only accept `key` and `children`. */
function isFragmentName(name: Node): boolean {
  if (name.type === "JSXIdentifier") return name.name === "Fragment"
  if (name.type === "JSXMemberExpression") return (name.property as Node).name === "Fragment"
  return false
}

function hasStamp(attributes: Node[]): boolean {
  return attributes.some(
    (attr) => attr.type === "JSXAttribute" && (attr.name as Node).type === "JSXIdentifier" && (attr.name as Node).name === STAMP_ATTR
  )
}

/** A JSX attribute whose value is exactly `value`. */
function stampAttribute(value: string): string {
  return /^[\w./@+\-:()[\] ]*$/.test(value) ? ` ${STAMP_ATTR}="${value}"` : ` ${STAMP_ATTR}={${JSON.stringify(value)}}`
}

export interface StampResult {
  code: string
  map: ReturnType<MagicString["generateMap"]>
  /** How many elements were stamped. */
  count: number
}

/**
 * Stamp every JSX element in `code`. `relPath` is the file's path relative to the
 * board root (posix). Returns null when there is nothing to stamp or the file
 * doesn't parse (the regular transform then reports the syntax error).
 */
export function stampJsx(code: string, relPath: string, sourceFile = relPath): StampResult | null {
  if (!code.includes("<")) return null
  const ast = parseSource(code)
  if (!ast || ((ast.errors as unknown[] | undefined)?.length ?? 0) > 0) return null
  const s = new MagicString(code)
  let count = 0
  walk(ast, (node) => {
    if (node.type !== "JSXOpeningElement") return
    const name = node.name as Node
    if (name.type === "JSXNamespacedName" || isFragmentName(name)) return
    const attributes = node.attributes as Node[]
    if (hasStamp(attributes)) return
    const loc = node.loc!.start
    const after = attributes.at(-1) ?? (node.typeArguments as Node | null) ?? (node.typeParameters as Node | null) ?? name
    s.appendLeft(after.end!, stampAttribute(`${relPath}:${loc.line}:${loc.column + 1}`))
    count++
  })
  if (!count) return null
  return { code: s.toString(), map: s.generateMap({ source: sourceFile, includeContent: true, hires: "boundary" }), count }
}

/** Longest snippet we put in a reference block. */
export const SNIPPET_MAX = 140

function collapse(text: string): string {
  return text
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+>$/, ">")
    .replace(/\s*\/>$/, " />")
    .trim()
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

/**
 * The JSX element that starts at `line`:`col` (1-based) in `code`, as one line:
 * the whole element when it is written on one line and short, else its opening
 * tag with the line breaks collapsed. Null when no element starts there.
 */
export function jsxSnippet(code: string, line: number, col: number, max = SNIPPET_MAX): string | null {
  const ast = parseSource(code)
  if (!ast) return null
  let found: Node | null = null
  walk(ast, (node) => {
    if (found || (node.type !== "JSXElement" && node.type !== "JSXFragment")) return
    const start = node.loc?.start
    if (start && start.line === line && start.column + 1 === col) found = node
  })
  if (!found) return null
  const element = found as Node
  const whole = code.slice(element.start!, element.end!)
  if (!whole.includes("\n") && whole.length <= max) return whole
  const opening = (element.openingElement ?? element.openingFragment) as Node
  return truncate(collapse(code.slice(opening.start!, opening.end!)), max)
}
