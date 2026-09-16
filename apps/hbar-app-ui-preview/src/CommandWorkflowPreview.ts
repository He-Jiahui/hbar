import { useState } from 'react'
import type { HbarAppUiCommandMenuContent, HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { COMMAND_LABELS } from '../../../tests/fixtures/hbar-app-ui-command-fixtures'
import {
  SEARCH_COMMANDS,
  SEARCH_COPY,
  SEARCH_SCOPES,
  INVITE_FIXTURE,
  ASSISTANT_FIXTURE,
} from '../../../tests/fixtures/hbar-app-ui-command-workflow-fixtures'

export function useCommandWorkflowPreview({ spec, onAction }: HbarAppUiVariantProps): HbarAppUiCommandMenuContent {
  const [source, setSource] = useState(spec.id),
    [open, setOpen] = useState(true),
    [query, setQuery] = useState(''),
    [scope, setScope] = useState('all'),
    [selectedId, setSelectedId] = useState<string | undefined>(SEARCH_COMMANDS[0]?.id),
    [email, setEmail] = useState(INVITE_FIXTURE.email),
    [roleId, setRoleId] = useState(INVITE_FIXTURE.roleId),
    [step, setStep] = useState(1),
    [ask, setAsk] = useState(ASSISTANT_FIXTURE.query)
  if (source !== spec.id) {
    setSource(spec.id)
    setOpen(true)
    setQuery('')
    setScope('all')
    setSelectedId(SEARCH_COMMANDS[0]?.id)
    setEmail(INVITE_FIXTURE.email)
    setRoleId(INVITE_FIXTURE.roleId)
    setStep(1)
    setAsk(ASSISTANT_FIXTURE.query)
  }
  const report = (actionId: string, value?: string) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  const overlay = {
    open,
    closeLabel: COMMAND_LABELS.close,
    onOpen() {
      setOpen(true)
    },
    onClose() {
      setOpen(false)
    },
  }
  const items = SEARCH_COMMANDS.filter(
    (item) =>
      (scope === 'all' || item.kind === scope) &&
      `${item.label} ${item.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const selected = items.find((item) => item.id === selectedId)
  return {
    search: {
      ...overlay,
      title: SEARCH_COPY.title,
      trigger: SEARCH_COPY.trigger,
      scopeLabel: SEARCH_COPY.scope,
      scopes: SEARCH_SCOPES,
      scopeId: scope,
      onScopeChange(id) {
        setScope(id)
        setSelectedId(undefined)
      },
      missingDetail: SEARCH_COPY.missing,
      onOpenResult(id) {
        report('open', id)
      },
      list: {
        labels: {
          ...COMMAND_LABELS,
          search: SEARCH_COPY.title,
          count: (count) => `${count} of ${SEARCH_COMMANDS.length}`,
        },
        items,
        query,
        selectedId: selected?.id,
        selectionLost: Boolean(selectedId && !selected),
        onQueryChange(value) {
          setQuery(value)
          setSelectedId(undefined)
        },
        onSelect: setSelectedId,
        onMove(direction) {
          const index = items.findIndex((item) => item.id === selectedId)
          if (items.length)
            setSelectedId(
              items[
                index < 0 ? (direction > 0 ? 0 : items.length - 1) : (index + direction + items.length) % items.length
              ]!.id,
            )
        },
        onExecute: setSelectedId,
        listStrategy: 'content-grown',
        error: undefined,
      },
      detail: selected
        ? {
            id: selected.id,
            kind: SEARCH_COPY.kinds[selected.kind],
            title: selected.label,
            description: selected.description ?? '',
            fields: SEARCH_COPY.fields,
            body: SEARCH_COPY.body,
            openLabel: SEARCH_COPY.open,
            busy: false,
          }
        : undefined,
    },
    invite: {
      ...overlay,
      title: INVITE_FIXTURE.labels.title,
      trigger: INVITE_FIXTURE.trigger,
      labels: { ...INVITE_FIXTURE.labels, step: INVITE_FIXTURE.step(step) },
      email,
      roleId,
      roles: INVITE_FIXTURE.roles,
      busy: false,
      canReview: Boolean(email.trim()),
      error: undefined,
      onBack() {
        setStep(1)
        report('back')
      },
      onEmailChange: setEmail,
      onRoleChange: setRoleId,
      onReview() {
        setStep(2)
        report('review', `${email}:${roleId}`)
      },
    },
    assistant: {
      ...overlay,
      title: ASSISTANT_FIXTURE.labels.search,
      trigger: ASSISTANT_FIXTURE.labels.search,
      labels: ASSISTANT_FIXTURE.labels,
      query: ask,
      suggestions: ASSISTANT_FIXTURE.suggestions,
      canAsk: Boolean(ask.trim()),
      busy: false,
      error: undefined,
      onQueryChange: setAsk,
      onAsk() {
        report('ask', ask)
      },
      onSuggestion(id) {
        const item = ASSISTANT_FIXTURE.suggestions.find((item) => item.id === id)
        if (item) setAsk(item.label)
      },
    },
  }
}
