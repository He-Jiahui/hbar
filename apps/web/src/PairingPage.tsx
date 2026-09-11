import { useState } from 'react'
import { Check, Circle, LoaderCircle, Network, ShieldCheck } from 'lucide-react'
import { client, refreshCatalog, useConnection } from './stores'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'

export default function PairingPage() {
  const [code, setCode] = useState('')
  const [name, setName] = useState('Browser')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const status = useConnection((state) => state.status)
  const url = useConnection((state) => state.url)
  const connectionError = useConnection((state) => state.error)
  const codeReady = code.length === 8
  const nameReady = Boolean(name.trim())
  const ready = codeReady && nameReady
  const connecting = busy || status === 'connecting'

  return (
    <main className="pairing-page rb-pairing-page">
      <GlassSurface className="pairing-page-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="pairing-intro">
        <div className="pairing-brand">
          hbar
          <span />
        </div>
        <span className="pairing-eyebrow">安全连接</span>
        <p>把这个浏览器配对到你的 hbar Host，之后即可在任意设备继续同一个工作台。</p>
      </header>
      <SpotlightCard className="pairing-card" spotlightColor="color-mix(in srgb, var(--rb-accent) 26%, transparent)">
        <form
          className="pairing-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!ready || busy) return
            setBusy(true)
            setError('')
            void client()
              .pair(code, name.trim())
              .then((host) => {
                useConnection.setState({ host })
                return refreshCatalog()
              })
              .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)))
              .finally(() => setBusy(false))
          }}
        >
          <div className="pairing-heading">
            <div>
              <h1>{connecting ? '连接宿主' : '设备配对'}</h1>
              <p>使用 Host 中生成的一次性配对码建立受信任连接。</p>
            </div>
            <span className={`pairing-state ${connecting ? 'connecting' : 'ready'}`} aria-live="polite">
              <i />
              {connecting ? '连接中' : '等待配对'}
            </span>
          </div>
          <div className="pairing-host-card" aria-label="目标 Host">
            <span className="pairing-host-icon" aria-hidden="true">
              <Network size={16} />
            </span>
            <div>
              <small>目标 Host</small>
              <code>{url}</code>
            </div>
          </div>
          <div className="pairing-fields">
            <label>
              配对码
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                aria-label="配对码"
                aria-invalid={code.length > 0 && !codeReady}
              />
            </label>
            <label>
              设备名称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="设备名称"
              />
            </label>
          </div>
          <ol className="pairing-steps" aria-label="配对准备情况">
            <li className={codeReady ? 'complete' : ''}>
              <span aria-hidden="true">{codeReady ? <Check size={13} /> : <Circle size={13} />}</span>
              <div>
                <strong>验证配对码</strong>
                <small>{codeReady ? '8 位配对码已准备好' : '输入 Host 显示的 8 位代码'}</small>
              </div>
            </li>
            <li className={nameReady ? 'complete' : ''}>
              <span aria-hidden="true">{nameReady ? <Check size={13} /> : <Circle size={13} />}</span>
              <div>
                <strong>命名此设备</strong>
                <small>{nameReady ? `将显示为 ${name.trim()}` : '为这台设备填写可识别名称'}</small>
              </div>
            </li>
          </ol>
          {(error || connectionError) && (
            <p className="inline-error" role="alert">
              {error || connectionError}
            </p>
          )}
          <GlareButton className="button primary pair-submit" disabled={busy || !ready}>
            {busy ? <LoaderCircle size={16} className="spinning" /> : <ShieldCheck size={16} />}
            配对并连接
          </GlareButton>
        </form>
      </SpotlightCard>
      <span className="pairing-footer">hbar / 0.1.0</span>
    </main>
  )
}
