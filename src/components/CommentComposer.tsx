import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { FrameIcon, SquareDashedMousePointerIcon } from "lucide-react"

import { walkItems } from "../../shared/board"
import type { BodySegment } from "../../shared/comments"
import { cleanRef, isRef, parseRefs, refFromInfo, refName, type Ref } from "../../shared/refs"
import { treeStore } from "@/board/board-store"
import { cancelDraft, highlightRef, newId, setDraftBody, submitDraft, type Draft } from "@/board/comment-store"
import { pickStore } from "@/board/pick-store"
import { revealRef } from "@/canvas/actions"
import { chipNode } from "@/components/RefChip"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * The comment text editor: a contenteditable where references are chips
 * (non-editable spans). `@` opens a list of frames and selected elements; a
 * pasted reference tag becomes a chip, anything else pastes as plain text.
 * The DOM is the source of truth while typing; every change is read back into
 * the draft in the store, so the draft survives the panel switching tabs.
 */

// ---------------------------------------------------------------------------
// DOM <-> body segments

function readBody(root: HTMLElement): BodySegment[] {
  const out: BodySegment[] = []
  let text = ""
  const flush = () => {
    if (text) out.push({ type: "text", text: text.replace(/\u00a0/g, " ") })
    text = ""
  }
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? ""
      else if (child instanceof HTMLElement) {
        if (child.dataset.ref) {
          let ref: Ref | null = null
          try {
            ref = cleanRef(JSON.parse(child.dataset.ref))
          } catch {
            /* not ours */
          }
          if (ref) {
            flush()
            out.push({ type: "ref", id: child.dataset.refId || newId(), ref })
          }
        } else if (child.tagName === "BR") {
          // The browser keeps a trailing <br> so an empty last line shows; it isn't text.
          if (child !== root.lastChild) text += "\n"
        } else if (child.tagName === "DIV" || child.tagName === "P") {
          if (text || out.length) text += "\n"
          walk(child)
        } else walk(child)
      }
    }
  }
  walk(root)
  flush()
  return out
}

function textNodes(text: string): Node[] {
  const nodes: Node[] = []
  text.split("\n").forEach((line, i) => {
    if (i) nodes.push(document.createElement("br"))
    if (line) nodes.push(document.createTextNode(line))
  })
  return nodes
}

function renderBody(root: HTMLElement, body: BodySegment[]): void {
  const nodes: Node[] = []
  for (const seg of body) {
    if (seg.type === "ref") nodes.push(chipNode(seg.ref, seg.id))
    else nodes.push(...textNodes(seg.text))
  }
  if (nodes.at(-1)?.nodeName === "BR") nodes.push(document.createElement("br"))
  root.replaceChildren(...nodes)
}

function caretToEnd(root: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  const sel = getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** The selection's range when it is inside `root`. */
function rangeIn(root: HTMLElement): Range | null {
  const sel = getSelection()
  if (!sel?.rangeCount) return null
  const range = sel.getRangeAt(0)
  return root.contains(range.commonAncestorContainer) ? range : null
}

/** Insert nodes at the caret (replacing any selected text) and put the caret after them. */
function insertNodes(root: HTMLElement, nodes: Node[]): void {
  let range = rangeIn(root)
  if (!range) {
    caretToEnd(root)
    range = rangeIn(root)!
  }
  range.deleteContents()
  const fragment = document.createDocumentFragment()
  fragment.append(...nodes)
  const last = fragment.lastChild
  range.insertNode(fragment)
  if (last) {
    range.setStartAfter(last)
    range.collapse(true)
    const sel = getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

/** The `@query` right before the caret, if any. */
function mentionAt(root: HTMLElement): { node: Text; start: number; end: number; query: string } | null {
  const sel = getSelection()
  if (!sel?.rangeCount || !sel.isCollapsed) return null
  const node = sel.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null
  const before = (node.textContent ?? "").slice(0, sel.anchorOffset)
  const m = /(^|\s)@([^\s@]*)$/.exec(before)
  if (!m) return null
  const query = m[2] ?? ""
  return { node: node as Text, start: sel.anchorOffset - query.length - 1, end: sel.anchorOffset, query }
}

// ---------------------------------------------------------------------------
// The `@` list

interface Option {
  key: string
  ref: Ref
  label: string
  detail: string
}

function useOptions(query: string | null): { elements: Option[]; frames: Option[] } {
  const tree = useStore(treeStore)
  const { items } = useStore(pickStore)
  return useMemo(() => {
    if (query === null) return { elements: [], frames: [] }
    const q = query.toLowerCase()
    const elements: Option[] = items
      .filter((item) => !item.stale)
      .map((item) => {
        const ref = refFromInfo(item)
        return { key: `e:${item.uid}`, ref, label: refName(ref), detail: ref.frame }
      })
      .filter((o) => !q || o.label.toLowerCase().includes(q) || o.detail.toLowerCase().includes(q))
      .slice(0, 5)
    const frames: { option: Option; rank: number }[] = []
    walkItems(tree.items, (item) => {
      if (item.kind !== "frame") return
      const id = item.id.toLowerCase()
      const title = (item.title ?? "").toLowerCase()
      const rank = !q ? 2 : id.startsWith(q) || id.includes(`/${q}`) ? 0 : title.startsWith(q) ? 1 : id.includes(q) || title.includes(q) ? 2 : -1
      if (rank < 0) return
      frames.push({ option: { key: `f:${item.id}`, ref: { kind: "frame", frame: item.id }, label: item.id, detail: item.title ?? "" }, rank })
    })
    frames.sort((a, b) => a.rank - b.rank)
    return { elements, frames: frames.slice(0, 8).map((f) => f.option) }
  }, [query, items, tree])
}

function MentionList({
  elements,
  frames,
  index,
  onPick,
  onHover,
}: {
  elements: Option[]
  frames: Option[]
  index: number
  onPick: (o: Option) => void
  onHover: (i: number) => void
}) {
  const all = [...elements, ...frames]
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    listRef.current?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" })
  }, [index])
  const row = (o: Option) => {
    const i = all.indexOf(o)
    return (
      <div
        key={o.key}
        role="option"
        aria-selected={i === index}
        data-mention-option
        className={cn(
          "flex h-7 cursor-default items-center gap-2 rounded-[5px] px-2 text-xs",
          i === index ? "bg-accent text-accent-foreground" : "text-foreground/85"
        )}
        onPointerDown={(e) => {
          // Keep the editor's caret.
          e.preventDefault()
          onPick(o)
        }}
        onPointerMove={() => i !== index && onHover(i)}
      >
        {o.ref.kind === "frame" ? (
          <FrameIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <SquareDashedMousePointerIcon className="size-3.5 shrink-0 text-selection" />
        )}
        <span className={cn("min-w-0 shrink truncate", o.ref.kind === "frame" ? "font-mono text-[11px]" : "font-medium")}>{o.label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{o.detail}</span>
      </div>
    )
  }
  return (
    <div ref={listRef} role="listbox" aria-label="References" className="max-h-52 overflow-y-auto border-t p-1">
      {!all.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">No frames or selected elements match.</p>}
      {elements.length > 0 && <p className="px-2 pt-1 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase">Selected</p>}
      {elements.map(row)}
      {frames.length > 0 && <p className="px-2 pt-1 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase">Frames</p>}
      {frames.map(row)}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function CommentComposer({ draft, placeholder }: { draft: Draft; placeholder: string }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [mention, setMention] = useState<{ query: string; index: number } | null>(null)
  const { elements, frames } = useOptions(mention?.query ?? null)
  const options = [...elements, ...frames]
  const empty = !draft.body.some((s) => s.type === "ref" || s.text.length)
  const hoveredChip = useRef<HTMLElement | null>(null)

  // The body is rendered once; after that the DOM leads (see above).
  useLayoutEffect(() => {
    const el = editorRef.current!
    renderBody(el, draft.body)
    el.focus()
    caretToEnd(el)
    return () => {
      if (hoveredChip.current) highlightRef(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateMention = () => {
    const m = mentionAt(editorRef.current!)
    setMention((prev) => (m ? { query: m.query, index: prev && prev.query === m.query ? prev.index : 0 } : null))
  }

  const sync = () => {
    setDraftBody(readBody(editorRef.current!))
    updateMention()
  }

  const pickOption = (o: Option) => {
    const el = editorRef.current!
    const m = mentionAt(el)
    if (m) {
      const range = document.createRange()
      range.setStart(m.node, m.start)
      range.setEnd(m.node, m.end)
      const sel = getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    insertNodes(el, [chipNode(o.ref, newId()), document.createTextNode(" ")])
    setMention(null)
    sync()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (mention) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const n = options.length
        if (n) setMention({ ...mention, index: (mention.index + (e.key === "ArrowDown" ? 1 : n - 1)) % n })
        return
      }
      if ((e.key === "Enter" && !mod) || e.key === "Tab") {
        const option = options[Math.min(mention.index, options.length - 1)]
        if (option) {
          e.preventDefault()
          pickOption(option)
          return
        }
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setMention(null)
        return
      }
    }
    if (e.key === "Enter" && mod) {
      e.preventDefault()
      submitDraft()
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (!document.execCommand("insertLineBreak")) document.execCommand("insertHTML", false, "<br>")
      sync()
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      cancelDraft()
    } else if (mod && /^[biu]$/i.test(e.key)) {
      // No rich text.
      e.preventDefault()
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    if (!text) return
    const parts = parseRefs(text)
    if (!parts.some(isRef)) {
      if (!document.execCommand("insertText", false, text)) insertNodes(editorRef.current!, textNodes(text))
    } else {
      const nodes = parts.flatMap((part) => (isRef(part) ? [chipNode(part, newId())] : textNodes(part)))
      insertNodes(editorRef.current!, nodes)
    }
    sync()
  }

  const chipAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>("[data-ref]") : null

  const refOf = (chip: HTMLElement): Ref | null => {
    try {
      return cleanRef(JSON.parse(chip.dataset.ref ?? ""))
    } catch {
      return null
    }
  }

  return (
    <div className="rounded-md border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
      <div className="relative">
        {empty && (
          <span className="pointer-events-none absolute top-1.5 left-2 text-xs leading-5 text-muted-foreground/70">{placeholder}</span>
        )}
        <div
          ref={editorRef}
          data-composer
          role="textbox"
          aria-multiline="true"
          aria-label="Comment"
          aria-autocomplete="list"
          aria-expanded={!!mention}
          contentEditable="true"
          suppressContentEditableWarning
          spellCheck
          className="max-h-48 min-h-[3.25rem] overflow-y-auto px-2 py-1.5 text-xs leading-5 break-words whitespace-pre-wrap outline-none"
          onInput={sync}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (!["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) updateMention()
          }}
          onPointerUp={updateMention}
          onPaste={onPaste}
          onDrop={(e) => e.preventDefault()}
          onBlur={() => setMention(null)}
          onPointerMove={(e) => {
            const chip = chipAt(e.target)
            if (chip === hoveredChip.current) return
            hoveredChip.current = chip
            highlightRef(chip ? refOf(chip) : null)
          }}
          onPointerLeave={() => {
            if (!hoveredChip.current) return
            hoveredChip.current = null
            highlightRef(null)
          }}
          onClick={(e) => {
            const chip = chipAt(e.target)
            const ref = chip && refOf(chip)
            if (ref) void revealRef(ref)
          }}
        />
      </div>
      {mention && (
        <MentionList
          elements={elements}
          frames={frames}
          index={Math.min(mention.index, Math.max(0, options.length - 1))}
          onPick={pickOption}
          onHover={(index) => setMention({ ...mention, index })}
        />
      )}
    </div>
  )
}
