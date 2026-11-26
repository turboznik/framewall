import { useEffect, useRef } from "react"
import { ClipboardCopyIcon, PencilIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"

import type { Comment } from "../../shared/comments"
import {
  cancelDraft,
  clearComments,
  commentStore,
  copyAllComments,
  deleteComment,
  editComment,
  setFocused,
  submitDraft,
  type Draft,
} from "@/board/comment-store"
import { revealRef } from "@/canvas/actions"
import { CommentComposer } from "@/components/CommentComposer"
import { RefChip } from "@/components/RefChip"
import { Kbd, SmallIconButton } from "@/components/SelectionPanel"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? "⌘" : "Ctrl"

export function PinNumber({ n, stale, onClick }: { n: number; stale?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      tabIndex={onClick ? 0 : -1}
      className={cn(
        "mt-px flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[8px_8px_8px_2px] px-1 text-[10px] font-semibold tabular-nums",
        stale ? "bg-muted text-muted-foreground" : "bg-comment text-white",
        onClick && "focus-visible:outline-2 focus-visible:outline-ring"
      )}
      title={onClick ? "Show on the canvas" : undefined}
      onClick={onClick}
    >
      {n}
    </button>
  )
}

function StaleBadge({ comment }: { comment: Comment }) {
  const why =
    comment.target.kind === "frame"
      ? "This frame isn't on the board any more. The comment is kept and exported with stale=\"true\"."
      : "This element wasn't found after the last edit (or its frame is gone). The comment is kept and exported with stale=\"true\"."
  return (
    <span
      data-stale
      className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-amber-500/12 px-1.5 text-[10px] leading-4 font-medium text-amber-700 dark:text-amber-400"
      title={why}
    >
      <TriangleAlertIcon className="size-2.5" />
      Stale
    </span>
  )
}

/** Comment text with its references as chips. */
function Body({ comment }: { comment: Comment }) {
  return (
    <div className="text-xs leading-5 break-words whitespace-pre-wrap text-foreground/90">
      {comment.body.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{i === 0 ? seg.text.replace(/^\s+/, "") : seg.text}</span>
        ) : (
          <RefChip key={seg.id} target={seg.ref} className="mx-px" />
        )
      )}
    </div>
  )
}

function ComposerFooter({ draft }: { draft: Draft }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span
        className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden text-[11px] whitespace-nowrap text-muted-foreground min-[400px]:flex"
        title={`Type @ to reference a frame or a selected element. ${MOD}+Enter to ${draft.editing ? "save" : "add"}, Esc to cancel.`}
      >
        <Kbd>@</Kbd> reference
        <span className="pl-1" />
        <Kbd>{MOD}</Kbd>
        <Kbd>↵</Kbd>
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={cancelDraft}>
          Cancel
        </Button>
        <Button size="sm" className="bg-comment text-white hover:bg-comment/90" onClick={() => submitDraft()}>
          {draft.editing ? "Save" : "Add comment"}
        </Button>
      </span>
    </div>
  )
}

function CommentCard({ comment, n, focused, draft }: { comment: Comment; n: number; focused: boolean; draft: Draft | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const editing = draft?.editing === comment.id
  const stale = !!comment.target.stale

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [focused])

  return (
    <div
      ref={ref}
      data-comment={comment.id}
      data-focused={focused || undefined}
      className={cn(
        "group/comment rounded-md border bg-background px-2.5 py-2 transition-colors",
        focused ? "border-comment shadow-[inset_0_0_0_1px_var(--comment)]" : "hover:border-foreground/20"
      )}
      onPointerDown={() => !focused && setFocused(comment.id)}
    >
      <div className="flex items-start gap-2">
        <PinNumber n={n} stale={stale} onClick={() => void revealRef(comment.target)} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <RefChip target={comment.target} />
          {stale && <StaleBadge comment={comment} />}
        </div>
        {!editing && (
          <span className="-mt-0.5 -mr-1 flex shrink-0 items-center opacity-60 group-hover/comment:opacity-100 group-data-focused/comment:opacity-100">
            <SmallIconButton label="Edit comment" onClick={() => editComment(comment.id)}>
              <PencilIcon />
            </SmallIconButton>
            <SmallIconButton label="Delete comment" onClick={() => deleteComment(comment.id)}>
              <Trash2Icon />
            </SmallIconButton>
          </span>
        )}
      </div>
      <div className="mt-1.5 pl-6">
        {editing && draft ? (
          <>
            <CommentComposer draft={draft} placeholder="Comment…" />
            <ComposerFooter draft={draft} />
          </>
        ) : (
          <Body comment={comment} />
        )}
      </div>
    </div>
  )
}

function NewComment({ draft, n }: { draft: Draft; n: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Braces matter: newer browsers return a promise from scrollIntoView.
    ref.current?.scrollIntoView({ block: "nearest" })
  }, [])
  return (
    <div ref={ref} data-new-comment className="rounded-md border border-comment bg-background px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--comment)]">
      <div className="flex items-center gap-2">
        <PinNumber n={n} />
        <span className="shrink-0 text-xs text-muted-foreground">on</span>
        <RefChip target={draft.target} />
      </div>
      <div className="mt-1.5 pl-6">
        <CommentComposer draft={draft} placeholder="What should change? Type @ to reference a frame…" />
        <ComposerFooter draft={draft} />
      </div>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="px-3 pt-1 pb-3 text-xs leading-relaxed text-muted-foreground">
      <p className="text-foreground/85">No comments yet.</p>
      <p>
        Select an element (<Kbd>S</Kbd>, then click) or a frame (click its label) and press <Kbd>C</Kbd>. Comments
        collect here until you copy them for an agent.
      </p>
    </div>
  )
}

/** The comments tab's header actions. */
export function CommentsActions() {
  const { comments } = useStore(commentStore)
  if (!comments.length) return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={copyAllComments} aria-label="Copy all comments">
        <ClipboardCopyIcon />
        <span className="hidden min-[400px]:inline">Copy all</span>
      </Button>
      <SmallIconButton label="Clear all comments" onClick={clearComments} className="size-6">
        <Trash2Icon className="size-3" />
      </SmallIconButton>
    </>
  )
}

/**
 * The buffered comments in order, and the composer for a new one. The focused card's ring is an
 * inset shadow: an outer one would be clipped by this scroll area (at the top, or when scrolled).
 */
export function CommentsList() {
  const { comments, draft, focused, loaded } = useStore(commentStore)
  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
      {loaded && !comments.length && !draft && <EmptyHint />}
      {comments.map((comment, i) => (
        <CommentCard key={comment.id} comment={comment} n={i + 1} focused={focused === comment.id} draft={draft} />
      ))}
      {draft && !draft.editing && <NewComment key={JSON.stringify(draft.target)} draft={draft} n={comments.length + 1} />}
    </div>
  )
}
