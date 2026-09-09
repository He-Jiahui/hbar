import { useEffect } from 'react'
import { Database, FolderCog, HardDrive, RefreshCw, RotateCcw, Save, ShieldCheck } from 'lucide-react'
import { usePathSettings } from './path-settings'
import GlareButton from './react-bits/GlareButton'

export default function PathSettings() {
  const state = usePathSettings()
  const load = state.load
  useEffect(() => {
    void load()
  }, [load])
  const busy = state.status === 'loading' || state.status === 'validating' || state.status === 'saving'
  const changed = Boolean(
    state.current && (state.dataRoot !== state.current.dataRoot || state.cacheRoot !== state.current.cacheRoot),
  )
  return (
    <section className="settings-section path-settings">
      <div className="section-toolbar">
        <div>
          <h2>存储目录</h2>
          <p className="section-description">会话和设置使用持久目录；可删除的派生文件进入缓存目录。</p>
        </div>
        <button
          className="button icon-button"
          title="重新读取路径"
          aria-label="重新读取路径"
          onClick={() => void state.load()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="path-root-grid">
        <label>
          <span>
            <Database size={15} />
            数据目录
          </span>
          <input
            value={state.dataRoot}
            onChange={(event) => state.setDataRoot(event.target.value)}
            spellCheck={false}
          />
          <small>sessions、skills、plugins、diagnostics、databases、settings</small>
        </label>
        <label>
          <span>
            <HardDrive size={15} />
            缓存目录
          </span>
          <input
            value={state.cacheRoot}
            onChange={(event) => state.setCacheRoot(event.target.value)}
            spellCheck={false}
          />
          <small>模型、插件构建、Markdown、Mermaid、附件预览和临时文件</small>
        </label>
      </div>
      {state.current && (
        <dl className="path-details">
          <dt>缓存占用</dt><dd>{formatBytes(state.current.cacheBytes)}</dd>
          <dt>会话日志</dt>
          <dd>{state.current.sessions}</dd>
          <dt>SQLite</dt>
          <dd>{state.current.database}</dd>
          <dt>插件</dt>
          <dd>{state.current.plugins}</dd>
          <dt>技能</dt>
          <dd>{state.current.skills}</dd>
          <dt>系统指针</dt>
          <dd>{state.current.pointerFile}</dd>
        </dl>
      )}
      {state.error && (
        <p className="inline-error" role="alert">
          {state.error}
        </p>
      )}
      {state.status === 'saved' && (
        <div className="restart-notice" role="status">
          <FolderCog size={16} />
          <div>
            <strong>路径已更新</strong>
            <span>重启 Host 后，所有客户端会连接到新的数据和缓存目录。</span>
          </div>
        </div>
      )}
      <div className="path-actions">
        <button
          className="button"
          disabled={busy || !state.dataRoot || !state.cacheRoot}
          onClick={() => void state.validate()}
        >
          <ShieldCheck size={14} />
          {state.status === 'validating' ? '验证中' : '验证目录'}
        </button>
        <button className="button" disabled={busy || !changed} onClick={state.reset}>
          <RotateCcw size={14} />
          还原
        </button>
        <GlareButton
          className="button primary"
          disabled={busy || !changed || !state.dataRoot || !state.cacheRoot}
          onClick={() => void state.save()}
        >
          <Save size={14} />
          {state.status === 'saving' ? '应用中' : '应用并在重启后生效'}
        </GlareButton>
      </div>
    </section>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
