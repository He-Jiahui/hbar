import { LumenFrame, LumenText } from '@lumen/app-ui'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HbarAppUiButton, HbarAppUiPromptComposer, type HbarAppUiComposerAttachment } from 'hbar-app-ui'
import { promptAuditCopy } from '../../../tests/fixtures/hbar-app-ui-prompt-audit'
import 'hbar-app-ui/theme.css'
import './prompt-audit.css'

const parameters = new URLSearchParams(location.search)
const locale = parameters.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US'
const copy = promptAuditCopy[locale]
const scenario = parameters.get('scenario')
document.documentElement.lang = locale
document.documentElement.dataset.hbarAppUiTheme = parameters.get('theme') === 'light' ? 'light' : 'dark'

function PromptAudit() {
  const [value, setValue] = useState(
    scenario === 'long' ? Array.from({ length: 40 }, () => copy.draft).join('\n') : copy.draft,
  )
  const [attachments, setAttachments] = useState<readonly HbarAppUiComposerAttachment[]>(
    scenario === 'attachments' ? [{ id: 'review', kind: 'file', name: copy.attachment }] : [],
  )
  const [submitted, setSubmitted] = useState('')
  const [running, setRunning] = useState(scenario === 'running')
  return (
    <LumenFrame as="main" className="prompt-audit-host">
      <HbarAppUiPromptComposer
        value={value}
        labels={copy.labels}
        attachments={attachments}
        disabled={scenario === 'disabled'}
        submitting={false}
        uploading={false}
        canSubmit={Boolean(value.trim()) && !running}
        canStop={running}
        canAddAttachments={true}
        error={scenario === 'error' ? copy.error : undefined}
        controls={<HbarAppUiButton>{copy.thinking}</HbarAppUiButton>}
        modelPicker={<HbarAppUiButton>{copy.model}</HbarAppUiButton>}
        onChange={setValue}
        onAddAttachments={(files) =>
          setAttachments((current) => [
            ...current,
            ...files.map((file) => ({ id: file.name, kind: 'file' as const, name: file.name })),
          ])
        }
        onRemoveAttachment={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
        onSubmit={() => {
          setSubmitted(value)
          setValue('')
        }}
        onStop={() => setRunning(false)}
      />
      <LumenText as="output" aria-label={copy.submitted}>{submitted}</LumenText>
    </LumenFrame>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing visual audit root')
createRoot(root).render(<PromptAudit />)
