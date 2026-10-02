import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Checkbox from '@mui/material/Checkbox'
import Radio from '@mui/material/Radio'
import Slider from '@mui/material/Slider'
import Switch from '@mui/material/Switch'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenButton,
  LumenCheckBox,
  LumenDivider,
  LumenFrame,
  LumenFormField,
  LumenIndicator,
  LumenInput,
  LumenOption,
  LumenProvider,
  LumenRange,
  LumenText,
  LumenSelect,
  LumenSurface,
  LumenToggle,
  type LumenSize,
} from '@lumen/app-ui'
import { visualLanguageCopy } from '../../../tests/fixtures/lumen-visual-language-copy'
import 'hbar-app-ui/theme.css'
import './visual-language-preview.css'

const parameters = new URLSearchParams(location.search)
const locale = parameters.get('locale') === 'en-US' ? 'en-US' : 'zh-CN'
const copy = visualLanguageCopy[locale]
const variants = ['contained', 'outlined', 'text'] as const
const tones = ['neutral', 'info', 'success', 'warning', 'danger'] as const
const sizes = ['s', 'm', 'l'] as const

function VisualLanguagePreview() {
  const [mode, setMode] = useState<'light' | 'dark'>(parameters.get('theme') === 'light' ? 'light' : 'dark')
  const [size, setSize] = useState<LumenSize>('m')
  const [glowing, setGlowing] = useState(parameters.get('glow') !== '0')
  const [motion, setMotion] = useState(parameters.get('motion') !== 'off')
  const [running, setRunning] = useState(true)
  const [selected, setSelected] = useState({ contained: true, outlined: true, text: true })
  const [value, setValue] = useState(copy.value)
  const [checked, setChecked] = useState(true)
  const [synced, setSynced] = useState(false)
  const [range, setRange] = useState(42)
  const actionRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = copy.title
    document.documentElement.dataset.hbarAppUiTheme = mode
    document.documentElement.dataset.lumenMode = mode
  }, [mode])
  return (
    <LumenProvider
      appearance={{
        ...DEFAULT_LUMEN_APPEARANCE,
        mode,
        controlSize: size,
        textSize: size,
        cornerSize: size,
        glow: glowing ? 65 : 0,
        motion,
      }}
      withCssBaseline={false}
    >
      <LumenFrame as="main" className="lumen-visual-language">
        <LumenFrame as="header" className="visual-language-heading">
          <LumenText as="h1">{copy.title}</LumenText>
          <LumenText as="p">{copy.description}</LumenText>
        </LumenFrame>
        <LumenFrame as="section" className="visual-language-toolbar">
          <LumenFrame
            as="a"
            className="visual-language-catalog-link"
            href={`/components.html?${new URLSearchParams({ locale, theme: mode }).toString()}`}
          >
            {copy.catalog}
          </LumenFrame>
          <LumenButton
            variant="outlined"
            onClick={() => setMode((previous) => (previous === 'dark' ? 'light' : 'dark'))}
          >
            {copy.theme}
          </LumenButton>
          <LumenToggle label={copy.glow} checked={glowing} onChange={(event) => setGlowing(event.target.checked)} />
          <LumenToggle label={copy.motion} checked={motion} onChange={(event) => setMotion(event.target.checked)} />
          <LumenSelect
            aria-label={copy.size}
            value={size}
            onChange={(event) => {
              const next = event.target.value
              if (next === 's' || next === 'm' || next === 'l') setSize(next)
            }}
          >
            {sizes.map((tier) => (
              <LumenOption key={tier} value={tier}>
                {copy.sizes[tier]}
              </LumenOption>
            ))}
          </LumenSelect>
          <LumenButton variant="text" onClick={() => setRunning((previous) => !previous)}>
            {running ? copy.finish : copy.start}
          </LumenButton>
          <LumenButton variant="text" onClick={() => actionRef.current?.focus()}>
            {copy.focus}
          </LumenButton>
        </LumenFrame>
        <LumenFrame as="section" className="visual-language-columns">
          {variants.map((variant) => (
            <LumenSurface as="section" key={variant} boundary="horizontal" contentClassName="visual-language-card">
              <LumenText as="h2">{copy.variants[variant]}</LumenText>
              <LumenButton
                ref={variant === 'contained' ? actionRef : undefined}
                data-testid={`preview-${variant}`}
                variant={variant}
              >
                {copy.states.idle}
              </LumenButton>
              <LumenFrame className="visual-language-row">
                {tones.map((tone) => (
                  <LumenButton key={tone} variant={variant} tone={tone}>
                    {copy.tones[tone]}
                  </LumenButton>
                ))}
              </LumenFrame>
              <LumenDivider />
              <LumenFrame className="visual-language-stack">
                <LumenButton
                  variant={variant}
                  aria-pressed={selected[variant]}
                  onClick={() => setSelected((previous) => ({ ...previous, [variant]: !previous[variant] }))}
                >
                  {copy.states.selected}
                </LumenButton>
                <LumenButton variant={variant} loading={running} disabled={running}>
                  {copy.states.running}
                </LumenButton>
                <LumenButton variant={variant} disabled>
                  {copy.states.disabled}
                </LumenButton>
                <LumenButton variant={variant} tone="danger" indicatorState="failed">
                  {copy.states.failed}
                </LumenButton>
              </LumenFrame>
              <LumenFrame className="visual-language-row">
                {sizes.map((tier) => (
                  <LumenButton key={tier} variant={variant} size={tier}>
                    {copy.sizes[tier]}
                  </LumenButton>
                ))}
              </LumenFrame>
            </LumenSurface>
          ))}
        </LumenFrame>
        <LumenSurface as="section" boundary="horizontal" contentClassName="visual-language-card">
          <LumenText as="h2">{copy.controls}</LumenText>
          <LumenFrame className="visual-language-fields">
            <LumenFormField controlId="preview-input" label={copy.input}>
              <LumenInput id="preview-input" value={value} onChange={(event) => setValue(event.target.value)} />
            </LumenFormField>
            <LumenFormField controlId="preview-error" label={copy.error} error={copy.errorMessage}>
              <LumenInput id="preview-error" defaultValue={copy.value} />
            </LumenFormField>
          </LumenFrame>
          <LumenFrame className="visual-language-fields">
            <LumenCheckBox
              label={copy.check}
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <LumenToggle label={copy.toggle} checked={synced} onChange={(event) => setSynced(event.target.checked)} />
            <LumenRange
              aria-label={copy.range}
              value={range}
              min={0}
              max={100}
              onChange={(event) => setRange(event.target.valueAsNumber)}
            />
            <LumenText as="output" aria-label={copy.range}>{range}</LumenText>
          </LumenFrame>
        </LumenSurface>
        <LumenSurface as="section" boundary="horizontal" contentClassName="visual-language-card">
          <LumenText as="h2">{copy.native}</LumenText>
          <LumenFrame className="visual-language-row">
            {variants.map((variant) => (
              <Button key={variant} variant={variant}>
                {copy.variants[variant]}
              </Button>
            ))}
          </LumenFrame>
          <LumenFrame className="visual-language-fields">
            {(['outlined', 'filled', 'standard'] as const).map((variant) => (
              <TextField key={variant} label={copy.input} variant={variant} size="small" />
            ))}
          </LumenFrame>
          <LumenFrame className="visual-language-row">
            <Checkbox slotProps={{ input: { 'aria-label': copy.check } }} />
            <Radio slotProps={{ input: { 'aria-label': copy.check } }} />
            <Switch slotProps={{ input: { 'aria-label': copy.toggle } }} />
            <Slider aria-label={copy.range} defaultValue={42} />
          </LumenFrame>
        </LumenSurface>
        <LumenFrame as="section" className="visual-language-columns" aria-label={copy.materials}>
          {(['glass', 'frost', 'solid'] as const).map((material) => (
            <LumenSurface
              as="section"
              key={material}
              material={material}
              contentClassName="visual-language-card"
              state={running ? 'running' : 'idle'}
            >
              <LumenFrame className="visual-language-row">
                <LumenIndicator state={running ? 'running' : 'idle'} />
                <LumenText as="h2">{copy[material]}</LumenText>
              </LumenFrame>
            </LumenSurface>
          ))}
        </LumenFrame>
      </LumenFrame>
    </LumenProvider>
  )
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing visual language preview root')
createRoot(root).render(<VisualLanguagePreview />)
