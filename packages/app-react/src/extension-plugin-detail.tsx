import { useState, type ReactNode } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenStatus,
  LumenText,
} from '@lumen/app-ui'
import { EXTENSION_PAGE_SIZE, type ExtensionWorkspaceDetailState } from '@hbar/app-runtime'
import { ExtensionPagination, type ExtensionPaginationLabels } from './extension-pagination'

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
}

function Collection<Item>({
  title,
  items,
  labels,
  render,
}: {
  readonly title: string
  readonly items: readonly Item[]
  readonly labels: ExtensionPluginDetailLabels
  readonly render: (item: Item) => ReactNode
}) {
  const [requestedPage, setPage] = useState(0)
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(items.length / EXTENSION_PAGE_SIZE) - 1))
  if (!items.length) return null
  return (
    <LumenFrame as="section" className="hbar-app-react-plugin-capability">
      <LumenFrame as="header">
        <LumenText as="h4">{title}</LumenText>
        <LumenText as="small">{labels.count(items.length)}</LumenText>
      </LumenFrame>
      <LumenCollection as="ul">
        {items.slice(page * EXTENSION_PAGE_SIZE, (page + 1) * EXTENSION_PAGE_SIZE).map((item, index) => (
          <LumenCollectionItem as="li" key={index}>
            {render(item)}
          </LumenCollectionItem>
        ))}
      </LumenCollection>
      <ExtensionPagination labels={labels.pagination} count={items.length} page={page} onPage={setPage} />
    </LumenFrame>
  )
}

function declaration(value: Readonly<Record<string, unknown>>, labels: ExtensionPluginDetailLabels) {
  const id = typeof value.id === 'string' ? value.id : null
  const title = typeof value.title === 'string' ? value.title : id
  return (
    <>
      <LumenText as="strong">{title ?? labels.notReported}</LumenText>
      {id && title !== id && <LumenText as="code">{id}</LumenText>}
    </>
  )
}

export function ExtensionPluginDetail({
  detail,
  labels,
  connected,
  onBack,
  onRetry,
}: {
  readonly detail: Readonly<ExtensionWorkspaceDetailState>
  readonly labels: ExtensionPluginDetailLabels
  readonly connected: boolean
  readonly onBack: () => void
  readonly onRetry: () => void
}) {
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
        <LumenButton variant="text" disabled={!connected || detail.status === 'loading'} onClick={onRetry}>
          <LumenIcon icon={RefreshCw} tier="md" />
          {labels.retry}
        </LumenButton>
      </LumenFrame>
      {detail.status === 'loading' && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {detail.status === 'error' && (
        <LumenText as="p" role="alert">
          {labels.error(detail.error ?? 'EXECUTION_FAILED')}
        </LumenText>
      )}
      {detail.status === 'missing' && (
        <LumenText as="p" role="status">
          {labels.missing}
        </LumenText>
      )}
      {plugin && (
        <>
          <LumenFrame as="section" className="hbar-app-react-plugin-detail-summary">
            <LumenFrame as="header">
              <LumenText as="h3">{plugin.name}</LumenText>
              <LumenStatus
                value={labels.status[plugin.status]}
                tone={plugin.status === 'active' ? 'success' : plugin.status === 'failed' ? 'danger' : 'neutral'}
              />
            </LumenFrame>
            <LumenText as="small">{labels.metadata(plugin.id, plugin.version)}</LumenText>
            {plugin.description && <LumenText as="p">{plugin.description}</LumenText>}
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
            {plugin.required && <LumenText as="p">{labels.required}</LumenText>}
            {plugin.error && (
              <LumenText as="p" role="alert">
                {plugin.error}
              </LumenText>
            )}
          </LumenFrame>
          <LumenText as="p" className="hbar-app-react-plugin-detail-hint">
            {labels.readOnly}
          </LumenText>
          <Collection
            title={labels.commands}
            items={commands}
            labels={labels}
            render={(command) => (
              <>
                <LumenText as="strong">{command.title}</LumenText>
                <LumenText as="code">{command.id}</LumenText>
                {command.description && <LumenText as="p">{command.description}</LumenText>}
                <LumenText as="code" aria-label={labels.commandUsage}>
                  {command.usage}
                </LumenText>
              </>
            )}
          />
          {!commands.length && (
            <LumenText as="p" className="hbar-app-react-extension-empty">
              {labels.emptyCommands}
            </LumenText>
          )}
          <Collection
            title={labels.services}
            items={[...new Set(plugin.provides)]}
            labels={labels}
            render={(item) => <LumenText as="code">{item}</LumenText>}
          />
          <Collection
            title={labels.requires}
            items={[...new Set(plugin.requires)]}
            labels={labels}
            render={(item) => <LumenText as="code">{item}</LumenText>}
          />
          <Collection
            title={labels.panels}
            items={plugin.contributes?.panels ?? []}
            labels={labels}
            render={(item) => declaration(item, labels)}
          />
          <Collection
            title={labels.renderers}
            items={plugin.contributes?.renderers ?? []}
            labels={labels}
            render={(item) => declaration(item, labels)}
          />
          {Boolean(plugin.contributes?.panels.length || plugin.contributes?.renderers.length) && (
            <LumenText as="p" className="hbar-app-react-plugin-detail-hint">
              {labels.declared}
            </LumenText>
          )}
        </>
      )}
    </LumenFrame>
  )
}
