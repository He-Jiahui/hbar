import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import TextField from '@mui/material/TextField'
import Checkbox from '@mui/material/Checkbox'
import Radio from '@mui/material/Radio'
import Slider from '@mui/material/Slider'
import Switch from '@mui/material/Switch'
import { DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui/appearance'
import LumenProvider from '@lumen/app-ui/provider'
import { LumenButton } from '@lumen/app-ui/primitives'
import { LumenCheckBox, LumenComboBox, LumenFormField, LumenInput, LumenToggle } from '@lumen/app-ui/forms'
import { LumenRange } from '@lumen/app-ui/range'
import { LumenToggleButton } from '@lumen/app-ui/toggle-button'
import '../../packages/hbar-app-ui/src/theme.css'

const copy = {
  title: '控件视觉语言与交互验证',
  input: '工作区名称：包含完整说明及较长中文内容的输入标签',
  boxed: '带底色的描边输入',
  error: '需要校正的工作区路径',
  errorMessage: '路径暂时不可用，请检查后重试。',
  check: '启用当前工作区中的完整上下文与附件检索',
  toggle: '自动同步工作区',
  toggleButton: '允许后台检查',
  range: '交互强度',
  defaultRange: '使用原生默认范围的滑块',
  combo: '选择工作区',
  open: '展开工作区列表',
  empty: '没有匹配的工作区',
  loading: '正在读取工作区列表',
  ref: '通过原生引用聚焦',
  glow: '切换发光',
  motion: '切换动态效果',
}

function ControlsFixture() {
  const [value, setValue] = useState('我的工作区')
  const [checked, setChecked] = useState(false)
  const [toggled, setToggled] = useState(false)
  const [buttonToggled, setButtonToggled] = useState(false)
  const [range, setRange] = useState(42)
  const [lastRangeInput, setLastRangeInput] = useState(25)
  const [nativeValue, setNativeValue] = useState(25)
  const [nativeChecked, setNativeChecked] = useState(false)
  const [radio, setRadio] = useState(false)
  const [glow, setGlow] = useState(Number(document.documentElement.dataset.fixtureGlow ?? 65))
  const [motion, setMotion] = useState(document.documentElement.dataset.fixtureMotion !== 'off')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mode = document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark'
  const controlSize =
    document.documentElement.dataset.lumenControlSize === 's'
      ? 's'
      : document.documentElement.dataset.lumenControlSize === 'l'
        ? 'l'
        : 'm'
  return (
    <LumenProvider
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, glow, motion, controlSize }}
      withCssBaseline={false}
    >
      <main className="control-fixture">
        <h1>{copy.title}</h1>
        <section className="control-fixture-fields">
          <LumenFormField controlId="control-input" label={copy.input}>
            <LumenInput
              ref={inputRef}
              id="control-input"
              data-testid="control-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </LumenFormField>
          <LumenFormField controlId="control-boxed" label={copy.boxed}>
            <LumenInput id="control-boxed" variant="boxed" defaultValue="稳定填充与轮廓" />
          </LumenFormField>
          <LumenFormField controlId="control-error" label={copy.error} error={copy.errorMessage}>
            <LumenInput id="control-error" defaultValue="不可用的路径" />
          </LumenFormField>
          <LumenFormField controlId="control-combo" label={copy.combo}>
            <LumenComboBox
              id="control-combo"
              labels={{ open: copy.open, empty: copy.empty, loading: copy.loading }}
              options={[
                { id: 'one', label: '工作区一' },
                { id: 'two', label: '工作区二' },
              ]}
              query={query}
              value={selectedId}
              open={open}
              onQueryChange={setQuery}
              onOpenChange={setOpen}
              onValueChange={(id) => {
                setSelectedId(id)
                setQuery(id === 'one' ? '工作区一' : '工作区二')
                setOpen(false)
              }}
            />
          </LumenFormField>
        </section>
        <section className="control-fixture-row">
          <LumenCheckBox label={copy.check} checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <LumenToggle label={copy.toggle} checked={toggled} onChange={(event) => setToggled(event.target.checked)} />
          <LumenToggleButton label={copy.toggleButton} checked={buttonToggled} onCheckedChange={setButtonToggled} />
          <LumenRange
            aria-label={copy.range}
            value={range}
            min={0}
            max={100}
            onChange={(event) => setRange(event.currentTarget.valueAsNumber)}
          />
          <output aria-label="当前强度">{range}</output>
          <LumenRange
            aria-label={copy.defaultRange}
            defaultValue={25}
            onInput={(event) => setLastRangeInput(event.currentTarget.valueAsNumber)}
          />
          <output aria-label={copy.defaultRange}>{lastRangeInput}</output>
        </section>
        <section className="control-fixture-fields" aria-label="MUI 原生控件">
          <TextField label="MUI 描边" variant="outlined" size="small" />
          <TextField label="MUI 填充" variant="filled" size="small" />
          <TextField label="MUI 标准" variant="standard" />
        </section>
        <section className="control-fixture-row">
          <Checkbox
            checked={nativeChecked}
            onChange={(event) => setNativeChecked(event.target.checked)}
            slotProps={{ input: { 'aria-label': 'MUI 复选' } }}
          />
          <Radio checked={radio} onChange={() => setRadio(true)} slotProps={{ input: { 'aria-label': 'MUI 单选' } }} />
          <Switch
            checked={nativeChecked}
            onChange={(event) => setNativeChecked(event.target.checked)}
            slotProps={{ input: { 'aria-label': 'MUI 开关' } }}
          />
          <Slider
            aria-label="MUI 滑块"
            value={nativeValue}
            onChange={(_event, next) => {
              if (typeof next === 'number') setNativeValue(next)
            }}
          />
        </section>
        <section className="control-fixture-row">
          <LumenButton variant="text" onClick={() => inputRef.current?.focus()}>
            {copy.ref}
          </LumenButton>
          <LumenButton variant="text" onClick={() => setGlow((previous) => (previous === 0 ? 65 : 0))}>
            {copy.glow}
          </LumenButton>
          <LumenButton variant="text" onClick={() => setMotion((previous) => !previous)}>
            {copy.motion}
          </LumenButton>
        </section>
      </main>
    </LumenProvider>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('The control fixture mount is missing')
createRoot(root).render(<ControlsFixture />)
