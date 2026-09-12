import { useEffect, useRef, useState } from 'react'
import { Check, Circle, LoaderCircle, Network, ShieldCheck } from 'lucide-react'
import { refreshCatalog, useConnection } from './stores'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'
import { useLocale } from './locale'

export default function PairingPage() {
  const { t } = useLocale()
  const [code, setCode] = useState('')
  const [name, setName] = useState('Browser')
  const [error, setError] = useState('')
  const connection = useConnection((state) => state.client)
  const [pendingClient, setPendingClient] = useState<typeof connection>(null)
  const attemptSerial = useRef(0)
  const status = useConnection((state) => state.status)
  const url = useConnection((state) => state.url)
  const connectionError = useConnection((state) => state.error)
  const codeReady = code.length === 8
  const nameReady = Boolean(name.trim())
  const ready = codeReady && nameReady
  // Scope the pending state to the transport that started the request. A host
  // switch must make the form usable immediately even if the old fetch is
  // still in flight; its eventual response is ignored by the attempt guard.
  const busy = pendingClient !== null && pendingClient === connection
  const connecting = busy || status === 'connecting'

  const previousConnection = useRef(connection)
  useEffect(() => {
    if (previousConnection.current === connection) return
    previousConnection.current = connection
    attemptSerial.current += 1
    setPendingClient(null)
    setError('')
  }, [connection])
  useEffect(() => () => {
    attemptSerial.current += 1
  }, [])

  return (
    <main className="pairing-page rb-pairing-page">
      <GlassSurface className="pairing-page-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="pairing-intro">
        <div className="pairing-brand">
          hbar
          <span />
        </div>
        <span className="pairing-eyebrow">{t('secureConnection')}</span>
        <p>{t('pairingIntro')}</p>
      </header>
      <SpotlightCard className="pairing-card" spotlightColor="color-mix(in srgb, var(--rb-accent) 26%, transparent)">
        <form
          className="pairing-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!ready || busy) return
            const attempt = ++attemptSerial.current
            const pairingClient = connection
            if (!pairingClient) {
              setError(t('hostNotConnectedTarget'))
              return
            }
            setPendingClient(pairingClient)
            setError('')
            const isCurrentAttempt = () =>
              attempt === attemptSerial.current && useConnection.getState().client === pairingClient
            void pairingClient
              .pair(code, name.trim())
              .then((host) => {
                if (!isCurrentAttempt()) return
                useConnection.setState({ host })
                return refreshCatalog()
              })
              .catch((failure) => {
                if (isCurrentAttempt()) setError(failure instanceof Error ? failure.message : String(failure))
              })
              .finally(() => {
                if (isCurrentAttempt()) setPendingClient(null)
              })
          }}
        >
          <div className="pairing-heading">
            <div>
              <h1>{connecting ? t('connectHost') : t('pairDevice')}</h1>
              <p>{t('pairingHint')}</p>
            </div>
            <span className={`pairing-state ${connecting ? 'connecting' : 'ready'}`} aria-live="polite">
              <i />
              {connecting ? t('connecting') : t('waitingPairing')}
            </span>
          </div>
          <div className="pairing-host-card" aria-label={t('targetHost')}>
            <span className="pairing-host-icon" aria-hidden="true">
              <Network size={16} />
            </span>
            <div>
              <small>{t('targetHost')}</small>
              <code>{url}</code>
            </div>
          </div>
          <div className="pairing-fields">
            <label>
              {t('pairingCode')}
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                aria-label={t('pairingCode')}
                aria-invalid={code.length > 0 && !codeReady}
              />
            </label>
            <label>
              {t('deviceName')}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label={t('deviceName')}
              />
            </label>
          </div>
          <ol className="pairing-steps" aria-label={t('pairingPreparation')}>
            <li className={codeReady ? 'complete' : ''}>
              <span aria-hidden="true">{codeReady ? <Check size={13} /> : <Circle size={13} />}</span>
              <div>
                <strong>{t('verifyPairingCode')}</strong>
                <small>{codeReady ? t('pairingCodeReady') : t('pairingCodeHint')}</small>
              </div>
            </li>
            <li className={nameReady ? 'complete' : ''}>
              <span aria-hidden="true">{nameReady ? <Check size={13} /> : <Circle size={13} />}</span>
              <div>
                <strong>{t('nameDevice')}</strong>
                <small>{nameReady ? `${t('nameWillDisplay')} ${name.trim()}` : t('deviceNameHint')}</small>
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
            {t('pairAndConnect')}
          </GlareButton>
        </form>
      </SpotlightCard>
      <span className="pairing-footer">hbar / 0.1.0</span>
    </main>
  )
}
