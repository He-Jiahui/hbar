import type { LumenCommandListProps, LumenCommandMenuContent } from '@lumen/app-ui'
import type { CommandPreviewFixtures } from './commandPreviewFixtures'
import {
  selectCommandPreviewItems,
  selectCommandPreviewSelection,
  type CommandPreviewModelState,
  type CommandPreviewRequest,
  type CommandPreviewStoreApi,
} from './commandPreviewModel'

export function commandPreviewHints(
  fixture: CommandPreviewFixtures,
  primary: string,
  count?: number,
  total?: number,
): NonNullable<LumenCommandListProps['hints']> {
  return {
    items: [
      { id: 'execute', key: '↵', label: primary },
      { id: 'close', key: 'esc', label: fixture.hints.close },
    ],
    ...(count === undefined ? {} : { result: fixture.hints.result(count, total ?? count) }),
  }
}

/** Pure content projection. All mutable drafts and safe request actions belong to the owned store. */
export function projectCommandWorkflowPreview(
  state: CommandPreviewModelState,
  store: CommandPreviewStoreApi,
  fixture: CommandPreviewFixtures,
  list: LumenCommandListProps,
  report: (request: CommandPreviewRequest | undefined) => void,
): LumenCommandMenuContent {
  const ownerId = state.ownerId
  const overlay = {
    open: state.open,
    closeLabel: fixture.labels.close,
    onOpen: () => {
      store.getState().setOpen(ownerId, true)
    },
    onClose: () => {
      store.getState().setOpen(ownerId, false)
    },
  }
  if (state.variant === 3) {
    const { item: selected } = selectCommandPreviewSelection(state)
    const kind = selected?.kind
    const selectedDetail = fixture.search.details.find((detail) => detail.id === selected?.id)
    const detail =
      selected && (kind === 'doc' || kind === 'person' || kind === 'workflow')
        ? {
            id: selected.id,
            kind: fixture.search.copy.kinds[kind],
            title: selected.label,
            description: selected.description ?? '',
            fields: selectedDetail?.fields ?? [],
            body: selectedDetail?.body ?? '',
            openLabel: fixture.search.copy.open,
            busy: false,
          }
        : undefined
    return {
      search: {
        ...overlay,
        title: fixture.search.copy.title,
        trigger: fixture.search.copy.trigger,
        scopeLabel: fixture.search.copy.scope,
        scopeRole: 'tabs',
        showOpenResult: false,
        scopes: fixture.search.scopes,
        scopeId: state.scopeId,
        onScopeChange: (id) => {
          store.getState().setScope(ownerId, id)
        },
        missingDetail: fixture.search.copy.missing,
        onOpenResult: (id) => report(store.getState().requestCommand(ownerId, { actionId: 'open', targetId: id })),
        list: {
          ...list,
          labels: { ...fixture.labels, search: fixture.search.copy.title },
          hints: commandPreviewHints(fixture, fixture.labels.execute, list.items.length, fixture.search.items.length),
        },
        detail,
      },
    }
  }
  if (state.variant === 4) {
    const inlineAction = fixture.inlineActions.find((action) => action.id === state.pageId)
    if (inlineAction) {
      const argumentsSnapshot = state.argumentsByPage[state.pageId] ?? {}
      const fields = inlineAction.fields.map((field) => ({ ...field, value: argumentsSnapshot[field.id] ?? '' }))
      const reviewing = state.step === 2
      const fieldValues = fields.map((field) =>
        field.kind === 'choice'
          ? (field.options.find((option) => option.id === field.value)?.label ?? '')
          : field.value,
      )
      const summary = inlineAction.summary(fieldValues)
      return {
        invite: {
          ...overlay,
          title: inlineAction.title,
          trigger: fixture.invite.trigger,
          labels: { ...fixture.invite.labels, step: fixture.invite.step(state.step) },
          email: state.email,
          roleId: state.roleId,
          roles: fixture.invite.roles,
          busy: false,
          canReview: false,
          error: undefined,
          onBack: () => {
            if (store.getState().step === 2) store.getState().setStep(ownerId, 1)
            else store.getState().backPage(ownerId)
          },
          onEmailChange: () => {},
          onRoleChange: () => {},
          onReview: () => {},
          inlineAction: {
            title: inlineAction.title,
            step: fixture.invite.step(state.step),
            backLabel: reviewing ? fixture.invite.backDetails : fixture.invite.labels.back,
            actionLabel: reviewing ? inlineAction.confirm : fixture.invite.labels.review,
            fields,
            summary: reviewing ? summary : undefined,
            hints: commandPreviewHints(fixture, reviewing ? fixture.hints.confirm : fixture.hints.review),
            canSubmit: fields.every(
              (field) =>
                Boolean(field.value.trim()) &&
                (field.kind !== 'choice' || field.options.some((option) => option.id === field.value)),
            ),
            onBack: () => {
              if (store.getState().step === 2) store.getState().setStep(ownerId, 1)
              else store.getState().backPage(ownerId)
            },
            onChange: (id, value) => {
              store.getState().setArgument(ownerId, state.pageId, id, value)
            },
            onSubmit: () =>
              report(
                store
                  .getState()
                  .requestArguments(ownerId, state.pageId, reviewing ? 'confirm' : 'review', argumentsSnapshot),
              ),
          },
        },
      }
    }
    const role = fixture.invite.roles.find((item) => item.id === state.roleId)
    const reviewing = state.step === 2 && state.pageId === 'details'
    const actions = state.pageId === 'actions'
    return {
      invite: {
        ...overlay,
        title: actions ? fixture.invite.trigger : fixture.invite.labels.title,
        trigger: fixture.invite.trigger,
        labels: { ...fixture.invite.labels, step: fixture.invite.step(state.step) },
        actionList: actions
          ? {
              ...list,
              labels: {
                ...fixture.labels,
                search: fixture.invite.actionSearch,
                available: fixture.invite.actionAvailable,
              },
              hints: commandPreviewHints(fixture, fixture.hints.choose),
            }
          : undefined,
        email: state.email,
        roleId: state.roleId,
        roles: fixture.invite.roles,
        busy: false,
        canReview: Boolean(state.email.trim() && role),
        error: undefined,
        hints: commandPreviewHints(fixture, reviewing ? fixture.hints.confirm : fixture.hints.review),
        onBack: () => {
          if (store.getState().step === 2) store.getState().setStep(ownerId, 1)
          else store.getState().backPage(ownerId)
        },
        onEmailChange: (value) => {
          store.getState().setEmail(ownerId, value)
        },
        onRoleChange: (id) => {
          store.getState().setRole(ownerId, id)
        },
        onReview: () => {
          if (store.getState().pageId !== 'details' || !state.roleId) return
          report(store.getState().requestReview(ownerId, { email: state.email, roleId: state.roleId }))
        },
        confirmation: reviewing
          ? {
              summary: fixture.invite.summary(state.email, role?.label ?? ''),
              backLabel: fixture.invite.backDetails,
              confirmLabel: fixture.invite.confirm,
              onConfirm: () => {
                if (store.getState().pageId !== 'details' || !state.roleId) return
                report(store.getState().requestConfirm(ownerId, { email: state.email, roleId: state.roleId }))
              },
            }
          : undefined,
      },
    }
  }
  if (state.variant === 5) {
    const items = selectCommandPreviewItems(state)
    return {
      assistant: {
        ...overlay,
        title: fixture.assistant.labels.search,
        trigger: fixture.assistant.labels.search,
        labels: fixture.assistant.labels,
        query: state.query,
        suggestions: fixture.assistant.suggestions,
        canAsk: Boolean(state.query.trim()) && items.length === 0,
        busy: false,
        error: undefined,
        results: {
          ...list,
          labels: { ...fixture.labels, search: fixture.assistant.labels.search },
          hints: commandPreviewHints(fixture, fixture.hints.run, items.length, fixture.assistant.commands.length),
        },
        hints: commandPreviewHints(fixture, fixture.hints.ask, 0, fixture.assistant.commands.length),
        onQueryChange: (value) => {
          store.getState().setQuery(ownerId, value)
        },
        onAsk: () => report(store.getState().requestAsk(ownerId, state.query)),
        onSuggestion: (id) => {
          store.getState().useSuggestion(ownerId, id)
        },
      },
    }
  }
  return {}
}
