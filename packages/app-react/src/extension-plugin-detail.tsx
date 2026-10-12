import { useState, type ReactNode } from 'react'
import { ArrowLeft, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenStatus,
  LumenText,
} from '@lumen/app-ui'
import {
  EXTENSION_PAGE_SIZE,
  type ExtensionWorkspaceActionState,
  type ExtensionWorkspaceDetailState,
} from '@hbar/app-runtime'
import { ExtensionPagination, type ExtensionPaginationLabels } from './extension-pagination'
import { extensionMessages } from './extension-messages'
import './extension-plugin-detail.css'

type Plugin = NonNullable<ExtensionWorkspaceDetailState['plugin']>

export interface ExtensionPluginDetailLabels {
  readonly title: string
  readonly back: string
  readonly retry: string
  readonly loading: string
  readonly missing: string
  readonly readOnly: string
  readonly required: string
  readonly commands: string
  readonly commandUsage: string
  readonly services: string
  readonly requires: string
  readonly panels: string
  readonly renderers: string
  readonly source: string
  readonly installation: string
  readonly runtime: string
  readonly project: string
  readonly notReported: string
  readonly declared: string
  readonly emptyCommands: string
  readonly status: Readonly<Record<Plugin['status'], string>>
  readonly installScope: Readonly<Record<NonNullable<Plugin['installScope']>, string>>
  readonly runtimeScope: Readonly<Record<NonNullable<Plugin['runtimeScope']>, string>>
  readonly metadata: (id: string, version: string) => string
  readonly error: (code: string) => string
  readonly count: (count: number) => string
  readonly pagination: ExtensionPaginationLabels
  readonly actions: {
    readonly title: string
    readonly scope: string
    readonly enable: string
    readonly disable: string
    readonly pending: string
    readonly confirmed: string
    readonly unknown: string
    readonly readCurrent: string
    readonly error: (code: string) => string
  }
}

function Collection<Item>({
  title,
  items,
  render,
}: {
  readonly title: string
  readonly items: readonly Item[]
  readonly render: (item: Item) => ReactNode
}) {
  const { t } = extensionMessages.useMessages()
  const labels = t('detail')
  const [requestedPage, setPage] = useState(0)
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(items.length / EXTENSION_PAGE_SIZE) - 1))
  if (!items.length) return null
  return (
    <LumenFrame as="section" className="hbar-app-react-plugin-capability">
      <LumenFrame as="header">
        <LumenText as="h4">{title}</LumenText>
        <LumenContentText context="record.description">{labels.count(items.length)}</LumenContentText>
      </LumenFrame>
      <LumenCollection as="ul">
        {items.slice(page * EXTENSION_PAGE_SIZE, (page + 1) * EXTENSION_PAGE_SIZE).map((item, index) => (
          <LumenCollectionItem as="li" key={index}>
            {render(item)}
          </LumenCollectionItem>
        ))}
      </LumenCollection>
      <ExtensionPagination count={items.length} page={page} onPage={setPage} />
    </LumenFrame>
  )
}

function declaration(value: Readonly<Record<string, unknown>>, labels: ExtensionPluginDetailLabels) {
  const id = typeof value.id === 'string' ? value.id : null
  const title = typeof value.title === 'string' ? value.title : id
  return (
    <>
      <LumenContentText context="record.title">{title ?? labels.notReported}</LumenContentText>
      {id && title !== id && <LumenText as="code">{id}</LumenText>}
    </>
  )
}

export function ExtensionPluginDetail({
  detail,
  connected,
  action,
  refreshing,
  operationError,
  onBack,
  onRetry,
  onSetEnabled,
}: {
  readonly detail: Readonly<ExtensionWorkspaceDetailState>
  readonly connected: boolean
  readonly action: Readonly<ExtensionWorkspaceActionState> | undefined
  readonly refreshing: boolean
  readonly operationError?: string | null
  readonly onBack: () => void
  readonly onRetry: () => void
  readonly onSetEnabled: (enabled: boolean) => void
}) {
  const { t } = extensionMessages.useMessages()
  const labels = t('detail')
  const plugin = detail.plugin
  const commandMap = new Map(
    (plugin?.contributes?.commands ?? plugin?.terminalCommands ?? []).map((command) => [command.id, command]),
  )
  const commands = [...commandMap.values()]
  return (
    <LumenFrame className="hbar-app-react-plugin-detail" aria-label={labels.title}>
      <LumenFrame as="header" className="hbar-app-react-plugin-detail-navigation">
        <LumenButton variant="text" onClick={onBack}>
          <LumenIcon icon={ArrowLeft} tier="md" />
          {labels.back}
        </LumenButton>
        {!plugin && (
          <LumenButton variant="text" disabled={!connected || refreshing} onClick={onRetry}>
            <LumenIcon icon={RefreshCw} tier="md" />
            {action?.status === 'unknown' ? labels.actions.readCurrent : labels.retry}
          </LumenButton>
        )}
      </LumenFrame>
      {detail.status === 'loading' && (
        <LumenContentText context="feedback.message" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {detail.status === 'error' && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(detail.error ?? 'EXECUTION_FAILED')}
        </LumenContentText>
      )}
      {detail.status === 'missing' && (
        <LumenContentText context="feedback.message" role="status">
          {labels.missing}
        </LumenContentText>
      )}
      {!plugin && action?.status === 'unknown' && (
        <LumenContentText context="feedback.message" role="status">
          {labels.actions.unknown}
        </LumenContentText>
      )}
      {plugin && (
        <>
          <LumenFrame as="section" className="hbar-app-react-plugin-detail-summary">
            <LumenFrame as="header">
              <LumenContentText context="section.subtitle">{plugin.name}</LumenContentText>
              <LumenStatus
                value={labels.status[plugin.status]}
                tone={plugin.status === 'active' ? 'success' : plugin.status === 'failed' ? 'danger' : 'neutral'}
              />
            </LumenFrame>
            <LumenContentText context="record.description">
              {labels.metadata(plugin.id, plugin.version)}
            </LumenContentText>
            {plugin.description && (
              <LumenContentText context="section.description">{plugin.description}</LumenContentText>
            )}
            <LumenCollection as="dl">
              <LumenFrame>
                <LumenCollectionItem as="dt">{labels.source}</LumenCollectionItem>
                <LumenCollectionItem as="dd">{plugin.packageName ?? plugin.path ?? plugin.id}</LumenCollectionItem>
              </LumenFrame>
              {plugin.installScope && (
                <LumenFrame>
                  <LumenCollectionItem as="dt">{labels.installation}</LumenCollectionItem>
                  <LumenCollectionItem as="dd">{labels.installScope[plugin.installScope]}</LumenCollectionItem>
                </LumenFrame>
              )}
              {plugin.runtimeScope && (
                <LumenFrame>
                  <LumenCollectionItem as="dt">{labels.runtime}</LumenCollectionItem>
                  <LumenCollectionItem as="dd">{labels.runtimeScope[plugin.runtimeScope]}</LumenCollectionItem>
                </LumenFrame>
              )}
              {plugin.projectId && (
                <LumenFrame>
                  <LumenCollectionItem as="dt">{labels.project}</LumenCollectionItem>
                  <LumenCollectionItem as="dd">{plugin.projectId}</LumenCollectionItem>
                </LumenFrame>
              )}
            </LumenCollection>
            {plugin.required && <LumenContentText context="section.description">{labels.required}</LumenContentText>}
            {plugin.error && (
              <LumenContentText context="feedback.message" role="alert">
                {plugin.error}
              </LumenContentText>
            )}
          </LumenFrame>
          <LumenFrame as="section" className="hbar-app-react-plugin-actions" aria-label={labels.actions.title}>
            <LumenContentText context="section.description">{labels.actions.scope}</LumenContentText>
            <LumenFrame role="group" aria-label={labels.actions.title}>
              {!plugin.required && action?.status !== 'unknown' && (
                <LumenButton
                  variant="outlined"
                  disabled={!connected || refreshing || action?.status === 'submitting'}
                  loading={action?.status === 'submitting'}
                  onClick={() => onSetEnabled(plugin.status !== 'active')}
                >
                  <LumenIcon icon={plugin.status === 'active' ? ToggleLeft : ToggleRight} tier="sm" />
                  {action?.status === 'submitting'
                    ? labels.actions.pending
                    : plugin.status === 'active'
                      ? labels.actions.disable
                      : labels.actions.enable}
                </LumenButton>
              )}
              <LumenButton
                variant="text"
                disabled={!connected || refreshing || action?.status === 'submitting'}
                onClick={onRetry}
              >
                <LumenIcon icon={RefreshCw} tier="sm" />
                {action?.status === 'unknown' ? labels.actions.readCurrent : labels.retry}
              </LumenButton>
            </LumenFrame>
            {action?.status === 'succeeded' && (
              <LumenContentText context="feedback.message" role="status">
                {labels.actions.confirmed}
              </LumenContentText>
            )}
            {action?.status === 'unknown' && (
              <LumenContentText context="feedback.message" role="status">
                {labels.actions.unknown}
              </LumenContentText>
            )}
            {action?.status === 'failed' && (
              <LumenContentText context="feedback.message" role="alert">
                {labels.actions.error(action.error ?? 'EXECUTION_FAILED')}
              </LumenContentText>
            )}
            {operationError && (
              <LumenContentText context="feedback.message" role="alert">
                {labels.actions.error(operationError)}
              </LumenContentText>
            )}
          </LumenFrame>
          <LumenContentText context="section.description" className="hbar-app-react-plugin-detail-hint">
            {labels.readOnly}
          </LumenContentText>
          <Collection
            title={labels.commands}
            items={commands}
            render={(command) => (
              <>
                <LumenContentText context="record.title">{command.title}</LumenContentText>
                <LumenText as="code">{command.id}</LumenText>
                {command.description && (
                  <LumenContentText context="section.description">{command.description}</LumenContentText>
                )}
                <LumenText as="code" aria-label={labels.commandUsage}>
                  {command.usage}
                </LumenText>
              </>
            )}
          />
          {!commands.length && (
            <LumenContentText context="section.description" className="hbar-app-react-extension-empty">
              {labels.emptyCommands}
            </LumenContentText>
          )}
          <Collection
            title={labels.services}
            items={[...new Set(plugin.provides)]}
            render={(item) => <LumenText as="code">{item}</LumenText>}
          />
          <Collection
            title={labels.requires}
            items={[...new Set(plugin.requires)]}
            render={(item) => <LumenText as="code">{item}</LumenText>}
          />
          <Collection
            title={labels.panels}
            items={plugin.contributes?.panels ?? []}
            render={(item) => declaration(item, labels)}
          />
          <Collection
            title={labels.renderers}
            items={plugin.contributes?.renderers ?? []}
            render={(item) => declaration(item, labels)}
          />
          {Boolean(plugin.contributes?.panels.length || plugin.contributes?.renderers.length) && (
            <LumenContentText context="section.description" className="hbar-app-react-plugin-detail-hint">
              {labels.declared}
            </LumenContentText>
          )}
        </>
      )}
    </LumenFrame>
  )
}
