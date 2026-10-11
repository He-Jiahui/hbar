import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenButton,
  LumenContentText,
  LumenFormField,
  LumenFrame,
  LumenImage,
  LumenPageHeader,
  LumenPopupSelect,
  LumenProvider,
} from '@lumen/app-ui'
import {
  visualUpgradeReportCopy,
  type VisualUpgradeReportCopy,
} from '../../../tests/fixtures/visual-upgrade-report-copy'
import { createVisualUpgradeReportModel, type VisualUpgradeCapture } from './visual-upgrade-report-model'
import 'hbar-app-ui/theme.css'
import './visual-upgrade-report.css'

function CaptureImage({
  capture,
  copy,
}: {
  readonly capture: VisualUpgradeCapture
  readonly copy: VisualUpgradeReportCopy
}) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <LumenContentText context="feedback.message" role="alert">
      {copy.failed}
    </LumenContentText>
  ) : (
    <LumenImage
      src={capture.src}
      alt={`${copy[capture.phase]} · ${copy.families[capture.family] ?? capture.family} · ${capture.width}`}
      loading="eager"
      onError={() => setFailed(true)}
      className="visual-report-image"
    />
  )
}

export function VisualUpgradeReport({
  initialLocale,
  initialTheme,
}: {
  readonly initialLocale: 'zh-CN' | 'en-US'
  readonly initialTheme: 'dark' | 'light'
}) {
  const [model] = useState(createVisualUpgradeReportModel)
  const data = useStore(model.state)
  const [locale, setLocale] = useState(initialLocale)
  const [theme, setTheme] = useState(initialTheme)
  const [family, setFamily] = useState('conversation')
  const [width, setWidth] = useState(1440)
  const copy = visualUpgradeReportCopy(locale)
  useEffect(() => {
    void model.load()
    return model.dispose
  }, [model])
  useEffect(() => {
    document.title = copy.title
    document.documentElement.dataset.lumenMode = theme
  }, [copy.title, theme])
  const families = [...new Set(data.evidence?.captures.map((capture) => capture.family) ?? [])]
  const widths = [
    ...new Set(
      data.evidence?.captures.filter((capture) => capture.family === family).map((capture) => capture.width) ?? [],
    ),
  ].sort((a, b) => a - b)
  const options = (values: readonly string[], labels: Readonly<Record<string, string>>) =>
    values.map((value) => ({ id: value, value, label: labels[value] ?? value }))
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: theme }} surfaceRole="reading">
      <LumenFrame as="main" className="visual-report">
        <LumenPageHeader
          layout="page"
          title={copy.title}
          context={copy.description}
          actions={
            <LumenButton
              onClick={() => location.assign(`./workbench-acceptance.html?locale=${locale}&theme=${theme}`)}
              variant="text"
            >
              {copy.acceptance}
            </LumenButton>
          }
        />
        <LumenFrame className="visual-report-controls">
          <LumenFormField label={copy.family} controlId="report-family">
            <LumenPopupSelect
              id="report-family"
              value={family}
              selectedLabel={copy.families[family]}
              options={options(families, copy.families)}
              onValueChange={(value) => {
                const available =
                  data.evidence?.captures
                    .filter((capture) => capture.family === value)
                    .map((capture) => capture.width) ?? []
                if (!available.includes(width)) setWidth(available.includes(1440) ? 1440 : (available[0] ?? 1440))
                setFamily(value)
              }}
            />
          </LumenFormField>
          <LumenFormField label={copy.locale} controlId="report-locale">
            <LumenPopupSelect
              id="report-locale"
              value={locale}
              options={options(['zh-CN', 'en-US'], copy.locales)}
              onValueChange={(value) => {
                if (value === 'zh-CN' || value === 'en-US') setLocale(value)
              }}
            />
          </LumenFormField>
          <LumenFormField label={copy.theme} controlId="report-theme">
            <LumenPopupSelect
              id="report-theme"
              value={theme}
              options={options(['dark', 'light'], copy.themes)}
              onValueChange={(value) => {
                if (value === 'dark' || value === 'light') setTheme(value)
              }}
            />
          </LumenFormField>
          <LumenFormField label={copy.width} controlId="report-width">
            <LumenPopupSelect
              id="report-width"
              value={String(width)}
              options={options(widths.map(String), {})}
              onValueChange={(value) => setWidth(Number(value))}
            />
          </LumenFormField>
        </LumenFrame>
        {data.status === 'loading' ? (
          <LumenContentText context="feedback.message" role="status">
            {copy.loading}
          </LumenContentText>
        ) : data.status === 'error' ? (
          <LumenFrame className="visual-report-error">
            <LumenContentText context="feedback.message" role="alert">
              {copy.failed}
            </LumenContentText>
            <LumenButton variant="text" onClick={() => void model.load()}>
              {copy.retry}
            </LumenButton>
          </LumenFrame>
        ) : (
          <LumenFrame className="visual-report-comparison">
            {(['before', 'after'] as const).map((phase) => {
              const capture = data.evidence?.captures.find(
                (item) =>
                  item.phase === phase &&
                  item.family === family &&
                  item.locale === locale &&
                  item.theme === theme &&
                  item.width === width,
              )
              return (
                <LumenFrame as="section" key={phase} className="visual-report-column">
                  <LumenContentText context="section.title">{copy[phase]}</LumenContentText>
                  <LumenContentText context="section.description" tone="muted">
                    {copy.provenance(data.evidence?.[phase])}
                  </LumenContentText>
                  {capture ? (
                    <CaptureImage key={capture.src} capture={capture} copy={copy} />
                  ) : (
                    <LumenContentText context="feedback.message">{copy.missing}</LumenContentText>
                  )}
                </LumenFrame>
              )
            })}
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenProvider>
  )
}

const parameters = new URLSearchParams(location.search)
const root = document.getElementById('root')
if (!root) throw new Error('Visual report root unavailable')
createRoot(root).render(
  <VisualUpgradeReport
    initialLocale={parameters.get('locale') === 'en-US' ? 'en-US' : 'zh-CN'}
    initialTheme={parameters.get('theme') === 'light' ? 'light' : 'dark'}
  />,
)
