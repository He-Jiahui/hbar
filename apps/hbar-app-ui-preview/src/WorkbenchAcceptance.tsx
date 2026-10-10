import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUp, FileText } from 'lucide-react'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenAdaptiveToolbar,
  LumenButton,
  LumenCollection,
  LumenContentText,
  LumenDialog,
  LumenDisclosure,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenMetricRow,
  LumenPageHeader,
  LumenProvider,
  LumenRecordRow,
  LumenSurface,
} from '@lumen/app-ui'
import {
  workbenchAcceptanceCopy,
  type WorkbenchAcceptanceCopy,
} from '../../../tests/fixtures/workbench-acceptance-copy'
import 'hbar-app-ui/theme.css'
import './workbench-acceptance.css'

export interface WorkbenchAcceptanceProps {
  readonly copy: WorkbenchAcceptanceCopy
  readonly initialTheme: 'dark' | 'light'
}

export function WorkbenchAcceptance({ copy, initialTheme }: WorkbenchAcceptanceProps) {
  const [mode, setMode] = useState(initialTheme)
  const [motion, setMotion] = useState(true)
  const [glow, setGlow] = useState(true)
  const [running, setRunning] = useState(true)
  const [dialog, setDialog] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  useEffect(() => {
    document.title = copy.title
    document.documentElement.dataset.lumenMode = mode
  }, [copy.title, mode])
  return (
    <LumenProvider
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, motion, glow: glow ? 65 : 0 }}
      surfaceRole="reading"
    >
      <LumenFrame as="main" className="workbench-acceptance" data-acceptance-theme={mode}>
        <LumenPageHeader layout="page" title={copy.title} context={copy.description} />
        <LumenFrame className="acceptance-actions" role="group" aria-label={copy.controls}>
          <LumenButton variant="text" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
            {copy.theme}
          </LumenButton>
          <LumenButton variant="text" aria-pressed={motion} onClick={() => setMotion(!motion)}>
            {copy.motion}
          </LumenButton>
          <LumenButton variant="text" aria-pressed={glow} onClick={() => setGlow(!glow)}>
            {copy.glow}
          </LumenButton>
        </LumenFrame>
        <LumenSurface
          surfaceRole="reading"
          material="solid"
          className="acceptance-section"
          contentClassName="acceptance-reading-content"
        >
          <LumenContentText context="section.title">{copy.reading}</LumenContentText>
          <LumenContentText context="message.body">{copy.paragraph}</LumenContentText>
          <LumenContentText context="code.inline">{copy.filename}</LumenContentText>
        </LumenSurface>
        <LumenFrame as="section" className="acceptance-section">
          <LumenContentText context="section.title">{copy.actions}</LumenContentText>
          <LumenFrame className="acceptance-actions">
            <LumenButton variant="contained" tone="primary" onClick={() => setDialog(true)}>
              {copy.primary}
            </LumenButton>
            <LumenButton variant="outlined" onClick={() => setDialog(true)}>
              {copy.secondary}
            </LumenButton>
            <LumenButton variant="text" onClick={() => setDialog(true)}>
              {copy.lightweight}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
        <LumenFrame as="section" className="acceptance-section">
          <LumenContentText context="section.title">{copy.records}</LumenContentText>
          <LumenRecordRow
            leading={<LumenIcon icon={FileText} tier="sm" />}
            title={copy.summary}
            description={copy.filename}
            trailing={
              <LumenContentText context="control.status" tone="success">
                {copy.completed}
              </LumenContentText>
            }
          />
          <LumenRecordRow
            title={copy.summary}
            trailing={
              <LumenContentText context="control.status" tone="warning">
                {copy.empty}
              </LumenContentText>
            }
          />
          <LumenRecordRow
            title={copy.summary}
            trailing={
              <LumenContentText context="control.status" tone="danger">
                {copy.failed}
              </LumenContentText>
            }
          />
          <LumenRecordRow
            title={copy.summary}
            trailing={
              <LumenButton
                variant="text"
                tone={running ? 'info' : 'success'}
                indicatorState={running ? 'running' : 'idle'}
                onClick={() => setRunning(!running)}
                aria-label={copy.toggleRun}
              >
                {running ? copy.running : copy.completed}
              </LumenButton>
            }
          />
          <LumenCollection as="dl">
            <LumenMetricRow label={copy.duration} value={copy.unavailable} />
          </LumenCollection>
          <LumenDisclosure summary={<LumenContentText context="control.label">{copy.details}</LumenContentText>}>
            <LumenContentText context="code.block">{copy.command}</LumenContentText>
            <LumenButton
              variant="text"
              onClick={() => {
                setCopyFailed(false)
                void navigator.clipboard
                  .writeText(copy.command)
                  .then(() => setCopied(true))
                  .catch(() => setCopyFailed(true))
              }}
            >
              {copied ? copy.copied : copy.copy}
            </LumenButton>
            {copyFailed ? (
              <LumenContentText context="feedback.message" role="alert">
                {copy.copyFailed}
              </LumenContentText>
            ) : null}
          </LumenDisclosure>
        </LumenFrame>
        <LumenSurface
          surfaceRole="raised"
          material="solid"
          className="acceptance-section"
          contentClassName="acceptance-reading-content"
        >
          <LumenContentText context="section.title">{copy.toolbar}</LumenContentText>
          <LumenAdaptiveToolbar
            label={copy.toolbar}
            moreLabel={copy.more}
            items={[
              {
                id: 'permission',
                label: copy.permission,
                priority: 40,
                content: (
                  <LumenButton variant="text" onClick={() => setDialog(true)}>
                    {copy.permission}
                  </LumenButton>
                ),
              },
              {
                id: 'project',
                label: copy.project,
                priority: 20,
                content: (
                  <LumenButton variant="text" onClick={() => setDialog(true)}>
                    {copy.project}
                  </LumenButton>
                ),
              },
              {
                id: 'model',
                label: copy.model,
                priority: 100,
                content: (
                  <LumenButton variant="text" onClick={() => setDialog(true)}>
                    {copy.model}
                  </LumenButton>
                ),
              },
              {
                id: 'reasoning',
                label: copy.reasoning,
                priority: 80,
                content: (
                  <LumenButton variant="text" onClick={() => setDialog(true)}>
                    {copy.reasoning}
                  </LumenButton>
                ),
              },
            ]}
            trailing={
              <LumenIconButton variant="contained" tone="primary" label={copy.send} onClick={() => setDialog(true)}>
                <LumenIcon icon={ArrowUp} tier="sm" />
              </LumenIconButton>
            }
          />
        </LumenSurface>
        <LumenFrame as="section" className="acceptance-section">
          <LumenContentText context="section.title">{copy.navigation}</LumenContentText>
          <LumenContentText className="acceptance-navigation" context="navigation.item" title={copy.longTitle}>
            {copy.longTitle}
          </LumenContentText>
        </LumenFrame>
        <LumenDialog
          open={dialog}
          title={copy.dialog}
          closeLabel={copy.close}
          onClose={() => setDialog(false)}
          footer={
            <LumenButton variant="contained" onClick={() => setDialog(false)}>
              {copy.close}
            </LumenButton>
          }
        >
          <LumenContentText context="dialog.body">{copy.dialogBody}</LumenContentText>
        </LumenDialog>
      </LumenFrame>
    </LumenProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing acceptance preview root')
const parameters = new URLSearchParams(location.search)
const locale = parameters.get('locale') === 'en-US' ? 'en-US' : 'zh-CN'
document.documentElement.lang = locale
createRoot(root).render(
  <WorkbenchAcceptance
    copy={workbenchAcceptanceCopy[locale]}
    initialTheme={parameters.get('theme') === 'light' ? 'light' : 'dark'}
  />,
)
