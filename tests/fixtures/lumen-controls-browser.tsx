import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui/appearance'
import LumenProvider from '@lumen/app-ui/provider'
import {
  LumenComboBox,
  LumenDialog,
  LumenFormField,
  LumenInput,
  LumenActionMenu,
  LumenPopupSelect,
  LumenToggle,
  LumenToggleGroup,
  type LumenControlOption,
} from '@lumen/app-ui'
import { FloatingSurface } from '../../packages/app-react/src/floating-surface'
import { HbarSessionProjectContext } from '../../packages/app-react/src/session-project-context'
import '../../packages/hbar-app-ui/src/theme.css'

const copyByLocale = {
  en: {
    title: 'Lumen controls geometry fixture',
    protocol: 'Protocol',
    model: 'Model search',
    thinking: 'Thinking level',
    capabilities: 'Supported levels',
    enabled: 'Provider enabled',
    openProtocol: 'Open protocol choices',
    openModel: 'Open model choices',
    placeholder: 'Choose a protocol',
    empty: 'No matching models',
    loading: 'Loading models',
    outside: 'Outside panel',
    short: 'Responses',
    long: 'A deliberately long protocol label that should wrap in the popup without widening the panel',
    anthropic: 'Anthropic Messages',
    disabled: 'Temporarily unavailable',
    modelShort: 'Short model',
    modelLong: 'A long model display name that must stay inside the panel and remain readable',
    modelDetail: 'Local fixture · no paid provider',
    modelDisabled: 'Disabled model',
    catalog: 'Catalog fixture',
    loadMore: 'Load more models',
    levels: ['Off', 'Low', 'High', 'Max'],
  },
  zh: {
    title: 'Lumen 控件几何验证 fixture',
    protocol: '协议',
    model: '模型搜索',
    thinking: '思考等级',
    capabilities: '支持的等级',
    enabled: '启用供应商',
    openProtocol: '打开协议选项',
    openModel: '打开模型选项',
    placeholder: '选择协议',
    empty: '没有匹配的模型',
    loading: '正在加载模型',
    outside: '面板外部',
    short: 'Responses',
    long: '一个很长的协议标签，弹层中应当换行且不撑宽工具面板',
    anthropic: 'Anthropic 消息',
    disabled: '暂不可用',
    modelShort: '短模型',
    modelLong: '一个很长的模型显示名称，必须留在面板内并保持可读',
    modelDetail: '本地 fixture · 不使用付费供应商',
    modelDisabled: '禁用模型',
    catalog: '目录 fixture',
    loadMore: '加载更多模型',
    levels: ['关闭', '低', '高', '最大'],
  },
} as const

const contextCopyByLocale = {
  en: {
    project: (name: string) => `Current project: ${name}`,
    branch: (name: string) => `Current branch: ${name}`,
    branchCaption: (name: string) => name,
    loading: 'Reading branch…',
    unavailable: (code: string) => `Branch unavailable: ${code}`,
    disconnected: 'Branch offline',
    retry: 'Retry',
  },
  zh: {
    project: (name: string) => `当前工程：${name}`,
    branch: (name: string) => `当前分支：${name}`,
    branchCaption: (name: string) => name,
    loading: '读取分支中…',
    unavailable: (code: string) => `分支不可用：${code}`,
    disconnected: '分支离线',
    retry: '重试',
  },
} as const

function localizedCopy() {
  return document.documentElement.lang.startsWith('zh') ? copyByLocale.zh : copyByLocale.en
}

function LumenControlsFixture() {
  const copy = localizedCopy()
  const contextCopy = document.documentElement.lang.startsWith('zh') ? contextCopyByLocale.zh : contextCopyByLocale.en
  const mode = document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark'
  const controlSize =
    document.documentElement.dataset.lumenControlSize === 's'
      ? 's'
      : document.documentElement.dataset.lumenControlSize === 'l'
        ? 'l'
        : 'm'
  const [protocol, setProtocol] = useState('responses')
  const [model, setModel] = useState<string | null>('model-long')
  const [query, setQuery] = useState('A long model display name that must stay inside the panel and remain readable')
  const [modelOpen, setModelOpen] = useState(false)
  const [modelPage, setModelPage] = useState(1)
  const [thinking, setThinking] = useState<string | null>('high')
  const [capabilities, setCapabilities] = useState<readonly string[]>(['low', 'high'])
  const [enabled, setEnabled] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProtocol, setDialogProtocol] = useState<string | null>(null)
  const [appSurfaceOpen, setAppSurfaceOpen] = useState(false)
  const dialogAnchorRef = useRef<HTMLButtonElement>(null)
  const appSurfaceAnchorRef = useRef<HTMLButtonElement>(null)
  const appSurfaceSearchRef = useRef<HTMLInputElement>(null)
  const [lastAction, setLastAction] = useState('')
  const protocols: readonly LumenControlOption[] = [
    { id: 'responses', label: copy.short },
    { id: 'anthropic', label: copy.anthropic },
    { id: 'long-protocol', label: copy.long },
    { id: 'disabled', label: copy.disabled, disabled: true },
  ]
  const allModels: readonly LumenControlOption[] = [
    { id: 'model-short', label: copy.modelShort },
    { id: 'model-long', label: copy.modelLong, detail: copy.modelDetail },
    { id: 'model-disabled', label: copy.modelDisabled, disabled: true },
    ...Array.from({ length: 60 }, (_, index) => ({ id: `catalog-${index}`, label: `${copy.catalog} ${index}` })),
  ]
  const models = allModels.slice(0, Math.min(allModels.length, modelPage * 20 + 3))
  const thinkingLevels: readonly LumenControlOption[] = [
    { id: 'off', label: copy.levels[0] },
    { id: 'low', label: copy.levels[1] },
    { id: 'high', label: copy.levels[2] },
    { id: 'max', label: copy.levels[3] },
  ]

  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, controlSize }} withCssBaseline={false}>
      <main className="lumen-controls-fixture">
        <h1>{copy.title}</h1>
        <section className="lumen-controls-panel" aria-label="Lumen control panel">
          <LumenFormField controlId="protocol-select" label={copy.protocol}>
            <LumenPopupSelect
              id="protocol-select"
              aria-label={copy.openProtocol}
              value={protocol}
              options={protocols}
              onValueChange={setProtocol}
              placeholder={copy.placeholder}
            />
          </LumenFormField>
          <LumenFormField controlId="stale-select" label="Stale persisted choice">
            <LumenPopupSelect
              id="stale-select"
              value="removed-protocol"
              selectedLabel="Previously selected protocol no longer available"
              options={protocols.filter((option) => option.id !== 'responses')}
              onValueChange={setProtocol}
            />
          </LumenFormField>
          <LumenFormField controlId="model-combo" label={copy.model}>
            <LumenComboBox
              id="model-combo"
              value={model}
              query={query}
              open={modelOpen}
              options={models}
              labels={{ open: copy.openModel, empty: copy.empty, loading: copy.loading }}
              onQueryChange={setQuery}
              onOpenChange={setModelOpen}
              onValueChange={(value) => {
                setModel(value)
                setQuery(models.find((option) => option.id === value)?.label ?? '')
                setModelOpen(false)
              }}
              loadMoreLabel={copy.loadMore}
              onLoadMore={() => setModelPage((previous) => Math.min(previous + 1, 4))}
            />
          </LumenFormField>
          <LumenToggleGroup
            id="thinking-group"
            type="single"
            value={thinking}
            options={thinkingLevels}
            onValueChange={setThinking}
            aria-label={copy.thinking}
          />
          <LumenToggleGroup
            id="capability-group"
            type="multiple"
            values={capabilities}
            options={thinkingLevels}
            onValuesChange={setCapabilities}
            aria-label={copy.capabilities}
          />
          <LumenToggle
            label={copy.enabled}
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
          <LumenInput aria-label="Long field" defaultValue={copy.long} />
        </section>
        <section className="lumen-surface-fixture" aria-label="Nested floating surfaces">
          <button ref={dialogAnchorRef} type="button" data-testid="open-dialog" onClick={() => setDialogOpen(true)}>
            Open nested dialog
          </button>
          <button
            ref={appSurfaceAnchorRef}
            type="button"
            data-testid="open-app-surface"
            onClick={() => setAppSurfaceOpen(true)}
          >
            Open app surface
          </button>
          <LumenDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Nested Lumen dialog"
            closeLabel="Close nested dialog"
            appearance="panel"
          >
            <div className="lumen-dialog-fixture">
              <form data-testid="dialog-form">
                <LumenPopupSelect
                  id="dialog-protocol-select"
                  name="dialog-protocol"
                  required
                  aria-label={copy.openProtocol}
                  value={dialogProtocol}
                  options={protocols}
                  onValueChange={setDialogProtocol}
                />
              </form>
            </div>
          </LumenDialog>
          <FloatingSurface
            open={appSurfaceOpen}
            onClose={() => setAppSurfaceOpen(false)}
            anchorRef={appSurfaceAnchorRef}
            initialFocusRef={appSurfaceSearchRef}
            label="App React surface"
          >
            <LumenInput ref={appSurfaceSearchRef} type="search" aria-label="App surface search" />
            <button type="button" data-testid="close-app-surface" onClick={() => setAppSurfaceOpen(false)}>
              Close app surface
            </button>
          </FloatingSurface>
          <LumenActionMenu
            label="Fixture actions"
            items={[
              { id: 'open', label: 'Open action' },
              { id: 'disabled', label: 'Disabled action', disabled: true },
              { id: 'delete', label: 'Delete action', tone: 'danger' },
            ]}
            onAction={setLastAction}
          />
          <output data-testid="last-action">{lastAction}</output>
        </section>
        <section className="lumen-context-panel" aria-label="Session project context geometry">
          <HbarSessionProjectContext
            workspaceName="hbar"
            workspacePath="D:/fixtures/hbar"
            sessionId="session-fixture"
            workspaceId="workspace-fixture"
            connected
            context={{
              sessionId: 'session-fixture',
              workspaceId: 'workspace-fixture',
              status: 'ready',
              branch: 'feature/ui',
              error: null,
            }}
            labels={contextCopy}
            onRetry={() => undefined}
          />
          <HbarSessionProjectContext
            workspaceName="A deliberately long project name that must ellipsize without moving the branch badge"
            workspacePath="D:/fixtures/a-deliberately-long-project-name"
            sessionId="session-fixture"
            workspaceId="workspace-fixture"
            connected
            context={{
              sessionId: 'session-fixture',
              workspaceId: 'workspace-fixture',
              status: 'ready',
              branch: 'feature/long-branch-name-that-must-remain-available-in-title',
              error: null,
            }}
            labels={contextCopy}
            onRetry={() => undefined}
          />
        </section>
        <button type="button" className="lumen-controls-outside">
          {copy.outside}
        </button>
        <output data-testid="control-state">
          {JSON.stringify({ protocol, model, thinking, capabilities, enabled })}
        </output>
      </main>
    </LumenProvider>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('The Lumen controls fixture mount is missing')
createRoot(root).render(<LumenControlsFixture />)
