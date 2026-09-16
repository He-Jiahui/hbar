import { APP_VERSION, DEVICE_NAME_MAX_LENGTH, PAIRING_CODE_LENGTH } from '@hbar/contracts'
import { HbarAppUiButton } from 'hbar-app-ui'
import { HbarAppUiCodeVerification } from 'hbar-app-ui/authentication'
import { useConnection, useWorkbench } from './stores'
import { useLocale } from './locale'
import { editPairing, retryPairingConnection, submitPairing, usePairing } from './pairing-model'
import './pairing.css'

const productName = 'hbar'

export default function Pairing() {
  const { t } = useLocale()
  const theme = useWorkbench((state) => state.theme)
  const status = useConnection((state) => state.status)
  const url = useConnection((state) => state.url)
  const connectionError = useConnection((state) => state.error)
  const code = usePairing((state) => state.code),
    name = usePairing((state) => state.name),
    busy = usePairing((state) => state.busy),
    error = usePairing((state) => state.error)
  return (
    <main className="pairing-page" data-hbar-app-ui-theme={theme === 'dark' ? 'dark' : 'light'}>
      <div className="pairing-brand">{productName}</div>
      <HbarAppUiCodeVerification
        labels={{
          title: status === 'connecting' ? t('pairingConnecting') : t('pairingTitle'),
          description: t('pairingDescription'),
          code: t('pairingCode'),
          codeDigit: (index) => `${t('pairingCode')} ${index}`,
          helper: t('pairingHint'),
          submit: busy ? t('pairingConnecting') : t('pairingSubmit'),
        }}
        codeLength={PAIRING_CODE_LENGTH}
        presentation="single"
        value={code}
        busy={busy}
        canSubmit={status === 'pairing' && code.length === PAIRING_CODE_LENGTH && Boolean(name.trim())}
        error={error || connectionError || undefined}
        onCodeChange={(value) => editPairing('code', value)}
        onSubmit={() => void submitPairing()}
        context={<code className="pairing-host">{url}</code>}
        secondaryActions={
          status === 'disconnected' && (
            <HbarAppUiButton onClick={retryPairingConnection}>{t('pairingRetry')}</HbarAppUiButton>
          )
        }
        footer={<span className="pairing-footer">{`${productName} / ${APP_VERSION}`}</span>}
      >
        <label>
          {t('pairingDevice')}
          <input
            value={name}
            maxLength={DEVICE_NAME_MAX_LENGTH}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => editPairing('name', event.currentTarget.value)}
          />
        </label>
      </HbarAppUiCodeVerification>
    </main>
  )
}
