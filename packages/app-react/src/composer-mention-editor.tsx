import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, File, Folder, Search } from 'lucide-react'
import { defaultKeymap, history, historyKeymap, insertNewline, invertedEffects } from '@codemirror/commands'
import { Compartment, EditorState, Prec, StateEffect, StateField, Transaction } from '@codemirror/state'
import { Decoration, EditorView, keymap, placeholder, WidgetType } from '@codemirror/view'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import {
  isWorkspaceRelativePath,
  parseComposerFilePage,
  parseComposerPathSearch,
  type PromptMention,
} from '@hbar/app-runtime'
import { mapMentionSpans, nearestMentionBoundary } from './composer-mention-model'
import { HbarComposerSlashMenu, type HbarComposerSlashLabels } from './composer-slash-menu'
import { shouldSubmitExactSlashOnSend, slashMatches, slashTokenAt, type LocalSlashCommand } from './composer-slash'
import './composer-mention-editor.css'

const MAX_ROWS = 50
type Candidate = { readonly path: string; readonly directory: boolean; readonly label: string }
type Trigger = { readonly from: number; readonly to: number; readonly term: string; readonly revision: number }
type SearchState = {
  readonly target: string
  readonly revision: number
  readonly status: 'loading' | 'ready' | 'error'
  readonly choices: readonly Candidate[]
  readonly nextCursor: string | null
  readonly truncated: boolean
  readonly loadingMore: boolean
  readonly error: string | null
}

export interface HbarComposerMentionLabels {
  readonly menu: string
  readonly root: string
  readonly search: string
  readonly browsing: (path: string) => string
  readonly empty: string
  readonly emptyPage: string
  readonly loading: string
  readonly disconnected: string
  readonly error: (code: string) => string
  readonly retry: string
  readonly more: string
  readonly truncated: string
  readonly limit: string
  readonly browse: (name: string) => string
  readonly select: (name: string) => string
  readonly hint: string
}

export interface HbarComposerMentionEditorProps {
  readonly sessionId: string
  readonly workspaceId: string
  readonly revision: number
  readonly text: string
  readonly mentions: readonly PromptMention[]
  readonly disabled: boolean
  readonly connected: boolean
  readonly inputLabel: string
  readonly placeholder: string
  readonly labels: HbarComposerMentionLabels
  readonly slashLabels: HbarComposerSlashLabels
  readonly files: { execute(name: string, input: unknown): Promise<unknown> }
  readonly onContent: (text: string, mentions: readonly PromptMention[], revision: number) => Promise<unknown>
  readonly onSubmit: () => void
  /** Local exact commands that the owning Session route can safely confirm from its send key. */
  readonly submitSlashCommands?: readonly LocalSlashCommand[] | undefined
  /** Monotonic request from the composer plus menu; local commands remain standalone-only. */
  readonly slashOpenRequest?: number | undefined
  /** Monotonic focus request after a nearby composer action is confirmed. */
  readonly focusRequest?: number | undefined
  /** Null keeps editing available while the Host-owned shortcut is unresolved, but never submits from a key. */
  readonly sendBehavior?: 'enter' | 'modifierEnter' | null | undefined
}

function errorCode(value: unknown): string {
  return value && typeof value === 'object' && 'code' in value && typeof value.code === 'string'
    ? value.code
    : 'EXECUTION_FAILED'
}

class MentionWidget extends WidgetType {
  constructor(readonly mention: PromptMention) {
    super()
  }
  eq(other: MentionWidget) {
    return this.mention.path === other.mention.path && this.mention.label === other.mention.label
  }
  toDOM() {
    const pill = document.createElement('span')
    pill.className = 'hbar-composer-mention-pill'
    pill.textContent = `@${this.mention.label}`
    pill.title = this.mention.path
    pill.setAttribute('aria-label', `@${this.mention.label}`)
    return pill
  }
}

const setMentions = StateEffect.define<readonly PromptMention[]>()
function mentionDecorations(mentions: readonly PromptMention[]) {
  return Decoration.set(
    mentions.map((mention) =>
      Decoration.replace({ widget: new MentionWidget(mention) }).range(mention.start, mention.end),
    ),
    true,
  )
}
function triggerAt(view: EditorView, revision: number): Trigger | null {
  if (!view.state.selection.main.empty) return null
  const to = view.state.selection.main.head
  const before = view.state.doc.sliceString(Math.max(0, to - 165), to)
  const match = /(?:^|[\s([{])@([^\s@]*)$/.exec(before)
  if (!match || match[1]!.length > 160) return null
  const from = to - match[1]!.length - 1
  if (view.state.field(mentionField).some((item) => from >= item.start && from < item.end)) return null
  return { from, to, term: match[1]!, revision }
}

const mentionField = StateField.define<readonly PromptMention[]>({
  create: () => [],
  update(value, tr) {
    const explicit = tr.effects.find((effect) => effect.is(setMentions))
    if (explicit) return explicit.value
    return tr.docChanged ? mapMentionSpans(value, tr.changes) : value
  },
  provide: (field) => [
    EditorView.decorations.from(field, mentionDecorations),
    EditorView.atomicRanges.of((view) => mentionDecorations(view.state.field(field))),
  ],
})

function leaf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}
function parent(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.length < 2 ? '.' : parts.slice(0, -1).join('/')
}

export function HbarComposerMentionEditor(props: HbarComposerMentionEditorProps) {
  const menuId = useId()
  const slashMenuId = useId()
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const revisionRef = useRef(props.revision)
  const suppressRef = useRef(false)
  const compositionRef = useRef(false)
  const compositionEndedAt = useRef(0)
  const dismissedRef = useRef<Trigger | null>(null)
  const slashDismissedRef = useRef<Trigger | null>(null)
  const editable = useRef(new Compartment())
  const placeholderSlot = useRef(new Compartment())
  const propsRef = useRef(props)
  propsRef.current = props
  const consumedSlashOpenRequest = useRef(props.slashOpenRequest ?? 0)
  const consumedFocusRequest = useRef(props.focusRequest ?? 0)
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [slashTrigger, setSlashTrigger] = useState<Trigger | null>(null)
  const [slashSelected, setSlashSelected] = useState(0)
  const [browsePath, setBrowsePath] = useState('.')
  const [search, setSearch] = useState<SearchState | null>(null)
  const [selected, setSelected] = useState(0)
  const [localError, setLocalError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const triggerRef = useRef(trigger)
  triggerRef.current = trigger
  const slashTriggerRef = useRef(slashTrigger)
  slashTriggerRef.current = slashTrigger
  const slashSelectedRef = useRef(slashSelected)
  slashSelectedRef.current = slashSelected
  const searchRef = useRef(search)
  searchRef.current = search
  const browseRef = useRef(browsePath)
  browseRef.current = browsePath
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const pagingRef = useRef<string | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const availableSlash = () => propsRef.current.slashLabels.commands.map((item) => item.id)

  useEffect(() => {
    resultsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, search?.choices])

  const write = (view: EditorView) => {
    const current = propsRef.current
    const revision = revisionRef.current
    revisionRef.current += 1 // The local registry enters a synchronous handler before its Promise settles.
    void current.onContent(view.state.doc.toString(), view.state.field(mentionField), revision).catch((reason) => {
      if (
        revisionRef.current !== revision + 1 ||
        propsRef.current.sessionId !== current.sessionId ||
        propsRef.current.workspaceId !== current.workspaceId
      )
        return
      revisionRef.current = propsRef.current.revision
      setLocalError(errorCode(reason))
      const latest = propsRef.current
      const editor = viewRef.current
      if (editor) {
        suppressRef.current = true
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: latest.text },
          effects: setMentions.of(latest.mentions),
        })
        suppressRef.current = false
      }
    })
  }
  const choose = (candidate: Candidate, browse: boolean) => {
    const view = viewRef.current
    const current = propsRef.current
    const active = triggerRef.current
    const result = searchRef.current
    if (
      !view ||
      !current.connected ||
      current.disabled ||
      !active ||
      !result ||
      result.status !== 'ready' ||
      result.revision !== revisionRef.current ||
      active.revision !== revisionRef.current ||
      result.target !==
        `${current.sessionId}:${current.workspaceId}:${browseRef.current}:${active.from}:${active.to}:${active.term}:${generation}` ||
      !result.choices.some((item) => item.path === candidate.path && item.directory === candidate.directory) ||
      view.state.doc.sliceString(active.from, active.to) !== `@${active.term}`
    )
      return
    if (browse && candidate.directory) {
      setBrowsePath(candidate.path)
      setSelected(0)
      view.focus()
      return
    }
    if (view.state.field(mentionField).length >= 40) {
      setLocalError('BUSY')
      return
    }
    const token = `@${candidate.label}`
    const changes = { from: active.from, to: active.to, insert: token }
    const mapped = mapMentionSpans(view.state.field(mentionField), view.state.update({ changes }).changes)
    const mention: PromptMention = {
      start: active.from,
      end: active.from + token.length,
      label: candidate.label,
      path: candidate.path,
      workspaceId: current.workspaceId,
      directory: candidate.directory,
    }
    const mentions = [...mapped, mention].sort((a, b) => a.start - b.start)
    view.dispatch({ changes, selection: { anchor: mention.end }, effects: setMentions.of(mentions) })
    setTrigger(null)
    setSearch(null)
    setBrowsePath('.')
    view.focus()
  }
  const chooseRef = useRef(choose)
  chooseRef.current = choose
  const chooseSlash = (command: LocalSlashCommand) => {
    const view = viewRef.current
    const active = slashTriggerRef.current
    const current = propsRef.current
    if (
      !view ||
      !active ||
      current.disabled ||
      !current.connected ||
      active.revision !== revisionRef.current ||
      !slashMatches(active.term, availableSlash()).includes(command) ||
      view.state.doc.sliceString(active.from, active.to) !== `/${active.term}`
    )
      return
    const replacement = `/${command} `
    view.dispatch({
      changes: { from: active.from, to: active.to, insert: replacement },
      selection: { anchor: active.from + replacement.length },
    })
    setSlashTrigger(null)
    view.focus()
  }
  const chooseSlashRef = useRef(chooseSlash)
  chooseSlashRef.current = chooseSlash

  useEffect(() => {
    if (!host.current) return
    const current = propsRef.current
    const handleEnter = (editor: EditorView, send: boolean): boolean => {
      if (editor.composing) return false
      const slash = slashTriggerRef.current
      const slashChoices = slash ? slashMatches(slash.term, availableSlash()) : []
      const slashChoice = slashChoices[Math.min(slashSelectedRef.current, slashChoices.length - 1)]
      if (slash && slashChoice) {
        if (
          shouldSubmitExactSlashOnSend({
            text: editor.state.doc.toString(),
            activeTerm: slash.term,
            selectedCommand: slashChoice,
            availableCommands: availableSlash(),
            submitCommands: propsRef.current.submitSlashCommands ?? [],
            sendShortcut: send,
          })
        ) {
          setSlashTrigger(null)
          propsRef.current.onSubmit()
        } else chooseSlashRef.current(slashChoice)
        return true
      }
      const menu = searchRef.current
      const candidate = menu?.choices[selectedRef.current]
      if (triggerRef.current && menu?.status === 'ready' && candidate) chooseRef.current(candidate, false)
      else if (triggerRef.current) setTrigger(null)
      else if (send) propsRef.current.onSubmit()
      else return insertNewline(editor)
      return true
    }
    const behavior = () => (propsRef.current.sendBehavior === undefined ? 'enter' : propsRef.current.sendBehavior)
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: current.text,
        extensions: [
          mentionField.init(() => current.mentions),
          history(),
          invertedEffects.of((transaction) =>
            transaction.docChanged ? [setMentions.of(transaction.startState.field(mentionField))] : [],
          ),
          EditorView.lineWrapping,
          placeholderSlot.current.of(placeholder(current.placeholder)),
          EditorView.contentAttributes.of({ 'aria-label': current.inputLabel, 'aria-multiline': 'true' }),
          editable.current.of(EditorView.editable.of(!current.disabled)),
          Prec.high(
            keymap.of([
              { key: 'Shift-Enter', run: (editor) => handleEnter(editor, false) },
              {
                key: 'Enter',
                run: (editor) => handleEnter(editor, behavior() === 'enter'),
              },
              { key: 'Alt-Enter', run: (editor) => handleEnter(editor, behavior() === 'enter') },
              ...(['Ctrl-Enter', 'Meta-Enter'] as const).map((key) => ({
                key,
                run: (editor: EditorView) => handleEnter(editor, behavior() === 'modifierEnter'),
              })),
              ...(['Ctrl-Alt-Enter', 'Meta-Alt-Enter'] as const).map((key) => ({
                key,
                run: (editor: EditorView) => handleEnter(editor, behavior() === 'modifierEnter'),
              })),
              { key: 'Ctrl-Shift-Enter', run: (editor) => handleEnter(editor, false) },
              { key: 'Meta-Shift-Enter', run: (editor) => handleEnter(editor, false) },
              {
                key: 'ArrowDown',
                run: (editor) => {
                  if (slashTriggerRef.current && !editor.composing) {
                    const matches = slashMatches(slashTriggerRef.current.term, availableSlash())
                    if (matches.length) {
                      setSlashSelected((index) => Math.min(matches.length - 1, index + 1))
                      return true
                    }
                  }
                  if (!triggerRef.current || editor.composing) return false
                  setSelected((index) => Math.min((searchRef.current?.choices.length ?? 1) - 1, index + 1))
                  return true
                },
              },
              {
                key: 'ArrowUp',
                run: (editor) => {
                  if (
                    slashTriggerRef.current &&
                    !editor.composing &&
                    slashMatches(slashTriggerRef.current.term, availableSlash()).length
                  ) {
                    setSlashSelected((index) => Math.max(0, index - 1))
                    return true
                  }
                  if (!triggerRef.current || editor.composing) return false
                  setSelected((index) => Math.max(0, index - 1))
                  return true
                },
              },
              {
                key: 'Escape',
                run: (editor) => {
                  if (slashTriggerRef.current && !editor.composing) {
                    slashDismissedRef.current = slashTriggerRef.current
                    setSlashTrigger(null)
                    return true
                  }
                  if (!triggerRef.current || editor.composing) return false
                  dismissedRef.current = triggerRef.current
                  setTrigger(null)
                  setSearch(null)
                  return true
                },
              },
              ...(['Tab', 'ArrowRight'] as const).map((key) => ({
                key,
                run: (editor: EditorView) => {
                  if (key === 'Tab' && slashTriggerRef.current && !editor.composing) {
                    const matches = slashMatches(slashTriggerRef.current.term, availableSlash())
                    const command = matches[Math.min(slashSelectedRef.current, matches.length - 1)]
                    if (command) {
                      chooseSlashRef.current(command)
                      return true
                    }
                  }
                  if (!triggerRef.current || editor.composing) return false
                  const menu = searchRef.current
                  const candidate = menu?.choices[selectedRef.current]
                  if (menu?.status !== 'ready' || !candidate) return false
                  chooseRef.current(candidate, key === 'ArrowRight' && candidate.directory)
                  return true
                },
              })),
              ...historyKeymap,
              ...defaultKeymap,
            ]),
          ),
          EditorView.updateListener.of((update) => {
            if (suppressRef.current) return
            if (update.focusChanged && !update.view.hasFocus) {
              setTrigger(null)
              setSlashTrigger(null)
              setSearch(null)
              return
            }
            if (update.docChanged) {
              dismissedRef.current = null
              slashDismissedRef.current = null
              write(update.view)
              setLocalError(null)
            }
            if (update.docChanged || update.selectionSet) {
              const next = triggerAt(update.view, revisionRef.current)
              const dismissed = dismissedRef.current
              const visible =
                next &&
                dismissed &&
                next.from === dismissed.from &&
                next.to === dismissed.to &&
                next.term === dismissed.term &&
                next.revision === dismissed.revision
                  ? null
                  : next
              if (next && visible) dismissedRef.current = null
              setTrigger(visible)
              const token = update.view.state.selection.main.empty
                ? slashTokenAt(update.view.state.doc.toString(), update.view.state.selection.main.head)
                : null
              const nextSlash =
                token &&
                !update.view.state.field(mentionField).some((item) => token.from >= item.start && token.from < item.end)
                  ? { ...token, revision: revisionRef.current }
                  : null
              const previousSlash = slashDismissedRef.current
              const openSlash =
                nextSlash &&
                slashMatches(nextSlash.term, availableSlash()).length &&
                !(
                  previousSlash &&
                  previousSlash.from === nextSlash.from &&
                  previousSlash.to === nextSlash.to &&
                  previousSlash.term === nextSlash.term &&
                  previousSlash.revision === nextSlash.revision
                )
                  ? nextSlash
                  : null
              setSlashTrigger(openSlash)
              if (openSlash && (!slashTriggerRef.current || slashTriggerRef.current.term !== openSlash.term))
                setSlashSelected(0)
              if (!visible) {
                setBrowsePath('.')
                setSearch(null)
              }
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    const compositionStarted = () => {
      compositionRef.current = true
      compositionEndedAt.current = 0
    }
    const compositionEnded = () => {
      compositionRef.current = false
      compositionEndedAt.current = performance.now()
    }
    const suppressComposingCommand = (event: KeyboardEvent) => {
      const confirming =
        event.key === 'Enter' && compositionEndedAt.current > 0 && performance.now() - compositionEndedAt.current < 80
      if (!compositionRef.current && !event.isComposing && event.keyCode !== 229 && event.key !== 'Enter')
        compositionEndedAt.current = 0
      if (
        (compositionRef.current || event.isComposing || event.keyCode === 229 || confirming) &&
        ['Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'Escape'].includes(event.key)
      )
        event.stopImmediatePropagation()
    }
    view.contentDOM.addEventListener('compositionstart', compositionStarted, { capture: true })
    view.contentDOM.addEventListener('compositionend', compositionEnded, { capture: true })
    view.contentDOM.addEventListener('keydown', suppressComposingCommand, { capture: true })
    return () => {
      view.contentDOM.removeEventListener('compositionstart', compositionStarted, { capture: true })
      view.contentDOM.removeEventListener('compositionend', compositionEnded, { capture: true })
      view.contentDOM.removeEventListener('keydown', suppressComposingCommand, { capture: true })
      viewRef.current = null
      view.destroy()
    }
  }, [props.sessionId, props.workspaceId])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // Local optimistic edits may be ahead of the next React snapshot. Never roll them back with stale props.
    // Equal revisions can be a stale React render while a local editor write is
    // still being projected. Only a newer confirmed revision may replace the
    // editor document; otherwise an old empty value can erase a newer draft.
    if (
      props.revision > revisionRef.current ||
      (props.revision === revisionRef.current && props.text === view.state.doc.toString())
    ) {
      revisionRef.current = props.revision
      if (
        view.state.doc.toString() !== props.text ||
        JSON.stringify(view.state.field(mentionField)) !== JSON.stringify(props.mentions)
      ) {
        suppressRef.current = true
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: props.text },
          effects: setMentions.of(props.mentions),
          annotations: Transaction.addToHistory.of(false),
        })
        suppressRef.current = false
      }
    }
    if (view.state.facet(EditorView.editable) !== !props.disabled) {
      suppressRef.current = true
      view.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!props.disabled)) })
      suppressRef.current = false
    }
    suppressRef.current = true
    view.dispatch({ effects: placeholderSlot.current.reconfigure(placeholder(props.placeholder)) })
    suppressRef.current = false
    view.contentDOM.setAttribute('aria-label', props.inputLabel)
    view.contentDOM.setAttribute('aria-placeholder', props.placeholder)
    view.contentDOM.setAttribute('placeholder', props.placeholder)
  }, [props.revision, props.text, props.mentions, props.disabled, props.inputLabel, props.placeholder])

  useEffect(() => {
    const request = props.slashOpenRequest ?? 0
    if (request <= consumedSlashOpenRequest.current) return
    consumedSlashOpenRequest.current = request
    const view = viewRef.current
    if (!view || props.disabled || !props.connected) return
    const selection = view.state.selection.main
    const mentions = view.state.field(mentionField)
    const position = nearestMentionBoundary(selection.head, mentions)
    const currentToken = selection.empty ? slashTokenAt(view.state.doc.toString(), position) : null
    const insideMention =
      currentToken && mentions.some((item) => currentToken.from >= item.start && currentToken.from < item.end)
    slashDismissedRef.current = null
    if (currentToken && !insideMention && slashMatches(currentToken.term, availableSlash()).length) {
      setSlashSelected(0)
      setSlashTrigger({ ...currentToken, revision: revisionRef.current })
      view.focus()
      return
    }
    const previousCharacter = position > 0 ? view.state.doc.sliceString(position - 1, position) : ''
    const separator = previousCharacter && !/\s/.test(previousCharacter) ? ' ' : ''
    const insertion = `${separator}/`
    view.dispatch({
      changes: { from: position, insert: insertion },
      selection: { anchor: position + insertion.length },
    })
    view.focus()
  }, [props.slashOpenRequest, props.disabled, props.connected])

  useEffect(() => {
    const request = props.focusRequest ?? 0
    if (request <= consumedFocusRequest.current) return
    consumedFocusRequest.current = request
    if (!props.disabled && props.connected) viewRef.current?.focus()
  }, [props.focusRequest, props.disabled, props.connected])

  useEffect(() => {
    const editor = viewRef.current?.contentDOM
    if (!editor) return
    const openMention = Boolean(trigger && (!props.disabled || !props.connected))
    const openSlash = Boolean(slashTrigger && !props.disabled && props.connected)
    const open = openMention || openSlash
    editor.setAttribute('aria-expanded', String(open))
    if (open) {
      editor.setAttribute('aria-controls', openMention ? menuId : slashMenuId)
      editor.setAttribute('aria-autocomplete', 'list')
      const slashCount = openSlash ? slashMatches(slashTrigger!.term, availableSlash()).length : 0
      if (slashCount)
        editor.setAttribute('aria-activedescendant', `${slashMenuId}-option-${Math.min(slashSelected, slashCount - 1)}`)
      else if (search?.status === 'ready' && search.choices[selected])
        editor.setAttribute('aria-activedescendant', `${menuId}-option-${selected}`)
      else editor.removeAttribute('aria-activedescendant')
    } else {
      editor.removeAttribute('aria-controls')
      editor.removeAttribute('aria-autocomplete')
      editor.removeAttribute('aria-activedescendant')
    }
  }, [menuId, slashMenuId, props.disabled, props.connected, search, selected, trigger, slashTrigger, slashSelected])

  useEffect(() => {
    if (!trigger || !props.connected || props.disabled) return
    let live = true
    const target = `${props.sessionId}:${props.workspaceId}:${browsePath}:${trigger.from}:${trigger.to}:${trigger.term}:${generation}`
    const revision = trigger.revision
    setSearch({
      target,
      revision,
      status: 'loading',
      choices: [],
      nextCursor: null,
      truncated: false,
      loadingMore: false,
      error: null,
    })
    setSelected(0)
    const load = async () => {
      try {
        const [listed, found] = await Promise.all([
          props.files
            .execute('file.list', { workspaceId: props.workspaceId, path: browsePath, limit: MAX_ROWS })
            .then(parseComposerFilePage),
          trigger.term
            ? props.files
                .execute('file.find', {
                  workspaceId: props.workspaceId,
                  path: browsePath,
                  query: trigger.term,
                  limit: MAX_ROWS,
                })
                .then(parseComposerPathSearch)
            : Promise.resolve(null),
        ])
        if (!live || revisionRef.current !== revision) return
        const directories = listed.items
          .filter(
            (item) =>
              item.directory &&
              isWorkspaceRelativePath(item.path) &&
              (!trigger.term || item.name.toLocaleLowerCase().includes(trigger.term.toLocaleLowerCase())),
          )
          .map((item) => ({ path: item.path, directory: true, label: item.name }))
        const files = (found ? found.paths : listed.items.filter((item) => !item.directory).map((item) => item.path))
          .filter(isWorkspaceRelativePath)
          .map((path) => ({ path, directory: false, label: leaf(path) }))
        setSearch({
          target,
          revision,
          status: 'ready',
          choices: [...directories, ...files].slice(0, MAX_ROWS * 2),
          nextCursor: listed.nextCursor ?? null,
          truncated: Boolean(found?.truncated),
          loadingMore: false,
          error: null,
        })
      } catch (reason) {
        if (live && revisionRef.current === revision)
          setSearch({
            target,
            revision,
            status: 'error',
            choices: [],
            nextCursor: null,
            truncated: false,
            loadingMore: false,
            error: errorCode(reason),
          })
      }
    }
    const timer = window.setTimeout(() => void load(), 120)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [
    props.files,
    props.sessionId,
    props.workspaceId,
    props.connected,
    props.disabled,
    trigger,
    browsePath,
    generation,
  ])

  const loadMore = () => {
    const menu = searchRef.current
    const active = triggerRef.current
    if (!menu?.nextCursor || !active || menu.status !== 'ready' || menu.loadingMore || menu.choices.length >= 200)
      return
    const target = menu.target
    const cursor = menu.nextCursor
    const pageKey = `${target}:${cursor}`
    if (pagingRef.current === pageKey) return
    pagingRef.current = pageKey
    setSearch((previous) => (previous?.target === target ? { ...previous, loadingMore: true } : previous))
    void props.files
      .execute('file.list', { workspaceId: props.workspaceId, path: browsePath, limit: MAX_ROWS, after: cursor })
      .then(parseComposerFilePage)
      .then((page) => {
        if (searchRef.current?.target !== target || revisionRef.current !== menu.revision) return
        setSearch((previous) =>
          previous?.target === target
            ? {
                ...previous,
                choices: [
                  ...new Map(
                    [
                      ...previous.choices,
                      ...page.items
                        .filter(
                          (item) =>
                            isWorkspaceRelativePath(item.path) &&
                            (!active.term ||
                              (item.directory ? item.name : item.path)
                                .toLocaleLowerCase()
                                .includes(active.term.toLocaleLowerCase())),
                        )
                        .map((item) => ({ path: item.path, directory: item.directory, label: item.name })),
                    ].map((item) => [`${item.directory}:${item.path}`, item] as const),
                  ).values(),
                ].slice(0, 200),
                nextCursor: page.nextCursor ?? null,
                loadingMore: false,
              }
            : previous,
        )
      })
      .catch((reason) => {
        if (searchRef.current?.target === target)
          setSearch((previous) => (previous?.target === target ? { ...previous, loadingMore: false } : previous))
        setLocalError(errorCode(reason))
      })
      .finally(() => {
        if (pagingRef.current === pageKey) pagingRef.current = null
      })
  }

  return (
    <LumenFrame className="hbar-composer-mention-root">
      <LumenFrame ref={host} className="hbar-composer-mention-editor" data-placeholder={props.placeholder} />
      {slashTrigger && props.connected && !props.disabled && (
        <HbarComposerSlashMenu
          id={slashMenuId}
          term={slashTrigger.term}
          selected={slashSelected}
          labels={props.slashLabels}
          onSelect={chooseSlash}
          onHover={setSlashSelected}
        />
      )}
      {trigger && (!props.disabled || !props.connected) && (
        <LumenFrame id={menuId} className="hbar-composer-mention-menu" role="listbox" aria-label={props.labels.menu}>
          <LumenFrame className="hbar-composer-mention-heading">
            <LumenIcon icon={Search} tier="sm" />
            <LumenText>
              {browsePath !== '.'
                ? props.labels.browsing(browsePath)
                : trigger.term
                  ? props.labels.search
                  : props.labels.browsing(props.labels.root)}
            </LumenText>
            {browsePath !== '.' && (
              <LumenButton
                size="s"
                variant="text"
                indicator="none"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setBrowsePath(parent(browsePath))
                  setSelected(0)
                }}
              >
                {props.labels.root}
              </LumenButton>
            )}
          </LumenFrame>
          {!props.connected ? (
            <LumenText className="hbar-composer-mention-feedback" role="status">
              {props.labels.disconnected}
            </LumenText>
          ) : search?.status === 'loading' ? (
            <LumenText className="hbar-composer-mention-feedback" role="status">
              {props.labels.loading}
            </LumenText>
          ) : search?.status === 'error' ? (
            <LumenFrame className="hbar-composer-mention-feedback" role="alert">
              <LumenText>{props.labels.error(search.error ?? 'EXECUTION_FAILED')}</LumenText>
              <LumenButton size="s" variant="text" indicator="none" onClick={() => setGeneration((value) => value + 1)}>
                {props.labels.retry}
              </LumenButton>
            </LumenFrame>
          ) : search?.choices.length ? (
            <LumenFrame ref={resultsRef} className="hbar-composer-mention-results">
              {search.choices.map((item, index) => (
                <LumenFrame className="hbar-composer-mention-row" key={`${item.directory}:${item.path}`}>
                  <LumenButton
                    id={`${menuId}-option-${index}`}
                    role="option"
                    aria-selected={index === selected}
                    aria-label={props.labels.select(item.label)}
                    className="hbar-composer-mention-choice"
                    size="s"
                    variant="text"
                    indicator="none"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => choose(item, false)}
                    title={item.path}
                  >
                    <LumenIcon icon={item.directory ? Folder : File} tier="sm" />
                    <LumenText>{item.label}</LumenText>
                    <LumenText className="hbar-composer-mention-path">
                      {parent(item.path) === '.' ? props.labels.root : parent(item.path)}
                    </LumenText>
                  </LumenButton>
                  {item.directory && (
                    <LumenButton
                      size="s"
                      variant="text"
                      indicator="none"
                      aria-label={props.labels.browse(item.label)}
                      title={props.labels.browse(item.label)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(item, true)}
                    >
                      <LumenIcon icon={ArrowRight} tier="sm" />
                    </LumenButton>
                  )}
                </LumenFrame>
              ))}
              {search.nextCursor && search.choices.length < 200 && (
                <LumenButton
                  size="s"
                  variant="text"
                  indicator="none"
                  disabled={search.loadingMore}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={loadMore}
                >
                  {props.labels.more}
                </LumenButton>
              )}
            </LumenFrame>
          ) : search?.status === 'ready' ? (
            <LumenFrame className="hbar-composer-mention-feedback" role="status">
              <LumenText>{search.nextCursor ? props.labels.emptyPage : props.labels.empty}</LumenText>
              {search.nextCursor && (
                <LumenButton
                  size="s"
                  variant="text"
                  indicator="none"
                  disabled={search.loadingMore}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={loadMore}
                >
                  {props.labels.more}
                </LumenButton>
              )}
            </LumenFrame>
          ) : null}
          {search?.truncated && (
            <LumenText className="hbar-composer-mention-feedback" role="status">
              {props.labels.truncated}
            </LumenText>
          )}
          {search && search.choices.length >= 200 && search.nextCursor && (
            <LumenText className="hbar-composer-mention-feedback" role="status">
              {props.labels.limit}
            </LumenText>
          )}
          <LumenText className="hbar-composer-mention-footer">{props.labels.hint}</LumenText>
        </LumenFrame>
      )}
      {localError && (
        <LumenText className="hbar-composer-mention-feedback" role="alert">
          {props.labels.error(localError)}
        </LumenText>
      )}
    </LumenFrame>
  )
}
