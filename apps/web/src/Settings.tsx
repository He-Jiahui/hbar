import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  Monitor,
  Network,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { providerSchema } from '@hbar/contracts'
import type { Device, ModelInfo, PluginInfo, ProviderConfig } from '@hbar/contracts'
import { client, refreshCatalog, report, useCatalog, useConnection, useWorkbench } from './stores'
import { copyText } from './browser-utils'
import PermissionSelector from './PermissionSelector'
import { permissionPreset } from './permissions'
import { providerFromPreset, providerPresets } from './provider-presets'

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={onClose}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose()
        }
      }}
    >
      <header>
        <h2>{title}</h2>
        <button title="关闭" aria-label="关闭" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      {children}
    </dialog>
  )
}
function ProviderEditor({ provider, close }: { provider?: ModelInfo; close(): void }) {
  const initialPreset = provider
    ? providerPresets.find((preset) => preset.name === provider.name || preset.baseUrl === provider.baseUrl)?.id ?? 'custom'
    : 'deepseek'
  const [presetId, setPresetId] = useState(initialPreset)
  const [value, setValue] = useState<ProviderConfig>(() =>
    provider ? { ...provider } : providerFromPreset(providerPresets.find((preset) => preset.id === 'deepseek')!),
  )
  const [apiKey, setApiKey] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const field = <K extends keyof ProviderConfig>(key: K, next: ProviderConfig[K]) =>
    setValue((current) => ({ ...current, [key]: next }))
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await client().call('provider.save', { provider: providerSchema.parse(value), ...(apiKey ? { apiKey } : {}) })
      await refreshCatalog()
      close()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={provider ? '编辑模型' : '添加模型'} onClose={close}>
      <form onSubmit={(event) => void save(event)} className="settings-form">
        {!provider && (
          <fieldset className="provider-presets">
            <legend>快速开始</legend>
            <div className="provider-preset-grid">
              {providerPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={`provider-preset ${preset.id === presetId ? 'selected' : ''}`}
                  onClick={() => {
                    setPresetId(preset.id)
                    setValue((current) => ({ ...providerFromPreset(preset, current.id), id: current.id }))
                  }}
                >
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
            <p>选择预设后只需填写 API Key；模型和地址都可以继续调整。</p>
          </fieldset>
        )}
        <label>
          名称
          <input autoFocus value={value.name} onChange={(event) => field('name', event.target.value)} required />
        </label>
        <label>
          协议
          <select
            value={value.protocol}
            onChange={(event) => field('protocol', event.target.value as ProviderConfig['protocol'])}
          >
            <option value="openai-completions">OpenAI Chat Completions</option>
            <option value="openai-responses">OpenAI Responses</option>
            <option value="anthropic-messages">Anthropic Messages</option>
            {provider?.protocol === 'mock' && <option value="mock">Local fixture</option>}
          </select>
        </label>
        <label>
          API 地址
          <input type="url" value={value.baseUrl} onChange={(event) => field('baseUrl', event.target.value)} required />
        </label>
        <label>
          模型 ID
          <input value={value.model} onChange={(event) => field('model', event.target.value)} required />
        </label>
        <label>
          API Key
          <div className="input-icon">
            <KeyRound size={14} />
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              placeholder={provider?.hasKey ? '已保存' : '未设置'}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
        </label>
        <details className="advanced">
          <summary>高级设置</summary>
          <div className="form-grid">
            <label>
              上下文窗口
              <input
                type="number"
                min={1024}
                value={value.contextWindow}
                onChange={(event) => field('contextWindow', Number(event.target.value))}
              />
            </label>
            <label>
              最大输出
              <input
                type="number"
                min={64}
                value={value.maxOutput}
                onChange={(event) => field('maxOutput', Number(event.target.value))}
              />
            </label>
            <label>
              输入 / 百万 tokens
              <input
                type="number"
                min={0}
                step="0.01"
                value={value.inputPrice}
                onChange={(event) => field('inputPrice', Number(event.target.value))}
              />
            </label>
            <label>
              输出 / 百万 tokens
              <input
                type="number"
                min={0}
                step="0.01"
                value={value.outputPrice}
                onChange={(event) => field('outputPrice', Number(event.target.value))}
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.imageInput}
              onChange={(event) => field('imageInput', event.target.checked)}
            />
            图片输入
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value.reasoning}
              onChange={(event) => field('reasoning', event.target.checked)}
            />
            推理模型
          </label>
        </details>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button type="button" className="button" onClick={close}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            <Save size={14} />
            保存
          </button>
        </footer>
      </form>
    </Modal>
  )
}
function PluginRow({ plugin }: { plugin: PluginInfo }) {
  const [expanded, setExpanded] = useState(false),
    [config, setConfig] = useState(JSON.stringify(plugin.config, null, 2))
  async function apply(enabled: boolean, configuration?: Record<string, unknown>) {
    try {
      await client().call('plugin.set', { id: plugin.id, enabled, config: configuration })
      await refreshCatalog()
    } catch (error) {
      report(error)
    }
  }
  return (
    <div className="plugin-row">
      <div className="plugin-heading">
        <button className="plugin-expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          <ChevronRight size={14} className={expanded ? 'rotate' : ''} />
          <div>
            <strong>{plugin.name}</strong>
            <span>
              {plugin.id} · {plugin.version}
            </span>
          </div>
        </button>
        <span className={`state-label ${plugin.status === 'active' ? 'success' : ''}`}>
          {plugin.required ? '必需' : plugin.status === 'active' ? '已启用' : '已停用'}
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={`启用 ${plugin.name}`}
          checked={plugin.status === 'active'}
          disabled={plugin.required}
          onChange={(event) => void apply(event.target.checked)}
        />
      </div>
      {expanded && (
        <div className="plugin-detail">
          <dl>
            <dt>提供服务</dt>
            <dd>{plugin.provides.join(', ') || '—'}</dd>
            <dt>依赖服务</dt>
            <dd>{plugin.requires.join(', ') || '—'}</dd>
          </dl>
          <label>
            配置
            <textarea
              aria-label={`${plugin.name} 配置`}
              className="config-editor"
              rows={5}
              value={config}
              onChange={(event) => setConfig(event.target.value)}
            />
          </label>
          <button
            className="button"
            onClick={() => {
              try {
                void apply(true, JSON.parse(config) as Record<string, unknown>)
              } catch (error) {
                report(error)
              }
            }}
          >
            <Save size={13} />
            保存配置
          </button>
        </div>
      )}
    </div>
  )
}
export default function Settings() {
  const [tab, setTab] = useState<'models' | 'permissions' | 'plugins' | 'devices'>('models'),
    [editor, setEditor] = useState<ModelInfo | 'new' | null>(null)
  const [devices, setDevices] = useState<Device[]>([]),
    [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null),
    [pluginPath, setPluginPath] = useState(''),
    [copied, setCopied] = useState(false)
  const data = useCatalog((state) => state.data),
    host = useConnection((state) => state.host),
    approvalMode = useWorkbench((state) => state.approvalMode),
    workspaceId = useWorkbench((state) => state.workspaceId)
  useEffect(() => {
    if (tab === 'devices') void client().call('device.list', {}).then(setDevices).catch(report)
  }, [tab])
  return (
    <div className="settings-panel">
      <div className="page-heading">
        <h1>设置</h1>
        <button title="刷新设置" aria-label="刷新设置" onClick={() => void refreshCatalog().catch(report)}>
          <RefreshCw size={15} />
        </button>
      </div>
      <nav className="settings-tabs">
        <button className={tab === 'models' ? 'selected' : ''} onClick={() => setTab('models')}>
          模型
        </button>
        <button className={tab === 'permissions' ? 'selected' : ''} onClick={() => setTab('permissions')}>
          权限
        </button>
        <button className={tab === 'plugins' ? 'selected' : ''} onClick={() => setTab('plugins')}>
          插件
        </button>
        <button className={tab === 'devices' ? 'selected' : ''} onClick={() => setTab('devices')}>
          设备与连接
        </button>
      </nav>
      {tab === 'permissions' && (
        <section className="settings-section permissions-section">
          <div className="section-toolbar">
            <div>
              <h2>工具权限</h2>
              <p className="section-description">控制 hbar 是否需要在写入文件或运行命令前暂停。</p>
            </div>
            <PermissionSelector compact={false} />
          </div>
          <div className="permission-settings-list">
            <div className="permission-setting-row">
              <div className="permission-setting-icon permission-tone-balanced"><ShieldCheck size={16} /></div>
              <div>
                <strong>当前默认模式</strong>
                <span>{permissionPreset(approvalMode).description}</span>
              </div>
              <span className={`state-label permission-state-${permissionPreset(approvalMode).tone}`}>
                {permissionPreset(approvalMode).label}
              </span>
            </div>
            <div className="permission-note">
              <strong>只对之后发送的消息生效</strong>
              <span>正在运行的任务不会被中途改变。你也可以在聊天输入框旁快速切换。</span>
            </div>
          </div>
        </section>
      )}
      {tab === 'models' && (
        <section className="settings-section">
          <div className="section-toolbar">
            <h2>供应商与模型</h2>
            <button className="button" onClick={() => setEditor('new')}>
              <Plus size={14} />
              添加模型
            </button>
          </div>
          {data?.models.length ? (
            data.models.map((model) => (
              <div className="model-row" key={model.id}>
                <div className="model-icon">
                  <Network size={18} />
                </div>
                <button className="model-details" onClick={() => setEditor(model)}>
                  <strong>{model.name}</strong>
                  <span>{model.model}</span>
                  <small>{model.protocol === 'mock' ? 'Local fixture' : model.baseUrl}</small>
                </button>
                <span className="model-capability">{model.imageInput ? '图文' : '文本'}</span>
                <span className="model-window">{Math.round(model.contextWindow / 1000)}k</span>
                <button
                  title={`删除 ${model.name}`}
                  aria-label={`删除 ${model.name}`}
                  onClick={() => {
                    if (window.confirm(`删除模型 ${model.name}？`))
                      void client().call('provider.delete', { id: model.id }).then(refreshCatalog).catch(report)
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          ) : (
            <div className="empty-list">尚未配置模型</div>
          )}
        </section>
      )}
      {tab === 'plugins' && (
        <section className="settings-section">
          <div className="section-toolbar">
            <h2>已安装插件</h2>
            <span>{data?.plugins.length ?? 0}</span>
          </div>
          {data?.plugins.map((plugin) => (
            <PluginRow key={plugin.id} plugin={plugin} />
          ))}
          <div className="install-plugin">
            <label>
              本地插件目录
              <input
                value={pluginPath}
                placeholder="D:\Plugins\my-plugin"
                onChange={(event) => setPluginPath(event.target.value)}
              />
            </label>
            <button
              className="button"
              disabled={!pluginPath}
              onClick={() =>
                void client()
                  .call('plugin.install', { path: pluginPath, ...(workspaceId ? { projectId: workspaceId } : {}) })
                  .then(() => {
                    setPluginPath('')
                    return refreshCatalog()
                  })
                  .catch(report)
              }
            >
              <Plus size={14} />
              加载可信插件
            </button>
          </div>
        </section>
      )}
      {tab === 'devices' && (
        <section className="settings-section">
          <div className="section-toolbar">
            <h2>宿主连接</h2>
            <span className="success">在线</span>
          </div>
          <div className="host-addresses">
            {host?.addresses.map((address) => (
              <div key={address}>
                <code>{address}</code>
                <button title="复制地址" aria-label="复制地址" onClick={() => void copyText(address).catch(report)}>
                  <Copy size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="section-toolbar">
            <h2>已配对设备</h2>
            <button
              className="button"
              onClick={() => void client().call('pairing.create', {}).then(setPairing).catch(report)}
            >
              <Plus size={14} />
              配对设备
            </button>
          </div>
          {pairing && (
            <div className="pairing-code">
              <code>{pairing.code}</code>
              <span>有效期至 {new Date(pairing.expiresAt).toLocaleTimeString()}</span>
              <button
                title="复制配对码"
                aria-label="复制配对码"
                onClick={() =>
                  void copyText(pairing.code)
                    .then(() => setCopied(true))
                    .catch(report)
                }
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          )}
          {devices.map((device) => (
            <div className="device-row" key={device.id}>
              <Monitor size={17} />
              <div>
                <strong>{device.name}</strong>
                <span>{new Date(device.createdAt).toLocaleString()}</span>
              </div>
              <button
                title={`撤销 ${device.name}`}
                aria-label={`撤销 ${device.name}`}
                onClick={() => {
                  if (window.confirm(`撤销 ${device.name} 的访问权限？`))
                    void client()
                      .call('device.revoke', { id: device.id })
                      .then(() => client().call('device.list', {}))
                      .then(setDevices)
                      .catch(report)
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </section>
      )}
      {editor && (
        <ProviderEditor {...(editor === 'new' ? {} : { provider: editor })} close={() => setEditor(null)} />
      )}
    </div>
  )
}
