import { LumenFrame, LumenOption, LumenText } from '@lumen/app-ui'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  HbarAppUiCheckBox,
  HbarAppUiComboBox,
  HbarAppUiField,
  HbarAppUiInput,
  HbarAppUiMultiSelect,
  HbarAppUiSelect,
  HbarAppUiTextarea,
} from 'hbar-app-ui'
import { formControlsAuditCopy } from '../../../tests/fixtures/hbar-app-ui-form-controls-audit'
import 'hbar-app-ui/theme.css'
import './form-controls-audit.css'

const parameters = new URLSearchParams(location.search)
const locale = parameters.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US'
const scenario = parameters.get('scenario')
const copy = formControlsAuditCopy[locale]
document.documentElement.lang = locale
document.documentElement.dataset.hbarAppUiTheme = parameters.get('theme') === 'light' ? 'light' : 'dark'

function FormControlsAudit() {
  const initial = copy.models[0]!
  const [providerName, setProviderName] = useState(copy.providerValue)
  const [protocol, setProtocol] = useState('openai-responses')
  const [modelId, setModelId] = useState<string | null>(initial.id)
  const [query, setQuery] = useState(initial.label)
  const [editingQuery, setEditingQuery] = useState(false)
  const [open, setOpen] = useState(parameters.get('open') === '1' || scenario === 'loading')
  const [endpoint, setEndpoint] = useState(
    scenario === 'error' ? 'https://api.example.test/{ACCOUNT_ID}/v1' : copy.endpointValue,
  )
  const [notes, setNotes] = useState(
    scenario === 'long' ? Array.from({ length: 5 }, () => copy.notesValue).join(' ') : copy.notesValue,
  )
  const [visible, setVisible] = useState(true)
  const [imageInput, setImageInput] = useState(true)
  const [thinkingLevels, setThinkingLevels] = useState<readonly string[]>(['off', 'medium', 'high'])
  const [thinkingQuery, setThinkingQuery] = useState('')
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const options = useMemo(
    () =>
      editingQuery
        ? copy.models.filter((model) =>
            `${model.label} ${model.detail ?? ''}`.toLocaleLowerCase().includes(normalizedQuery),
          )
        : copy.models,
    [editingQuery, normalizedQuery],
  )
  const selected = copy.models.find((model) => model.id === modelId)
  const disabled = scenario === 'disabled'

  return (
    <LumenFrame as="main" className="form-controls-audit-host">
      <LumenFrame as="section" className="form-controls-audit-panel" aria-labelledby="form-controls-title">
        <LumenFrame as="header">
          <LumenText as="h1" id="form-controls-title">{copy.title}</LumenText>
          <LumenText as="p">{copy.description}</LumenText>
        </LumenFrame>
        <LumenFrame as="form" onSubmit={(event) => event.preventDefault()}>
          <LumenFrame className="form-controls-audit-row">
            <HbarAppUiField
              controlId="provider-name"
              label={copy.providerLabel}
              description={copy.providerDescription}
              required
              requiredIndicator={copy.requiredIndicator}
            >
              <HbarAppUiInput
                id="provider-name"
                value={providerName}
                disabled={disabled}
                onChange={(event) => setProviderName(event.currentTarget.value)}
              />
            </HbarAppUiField>
            <HbarAppUiField controlId="provider-protocol" label={copy.protocolLabel}>
              <HbarAppUiSelect
                id="provider-protocol"
                value={protocol}
                disabled={disabled}
                onChange={(event) => setProtocol(event.currentTarget.value)}
              >
                {copy.protocols.map((option) => (
                  <LumenOption key={option.id} value={option.id}>
                    {option.label}
                  </LumenOption>
                ))}
              </HbarAppUiSelect>
            </HbarAppUiField>
          </LumenFrame>
          <HbarAppUiField controlId="provider-model" label={copy.modelLabel} description={copy.modelDescription}>
            <HbarAppUiComboBox
              id="provider-model"
              value={modelId}
              query={query}
              open={open}
              options={options}
              labels={copy.combo}
              placeholder={copy.modelPlaceholder}
              disabled={disabled}
              loading={scenario === 'loading'}
              onQueryChange={(value) => {
                setQuery(value)
                setEditingQuery(true)
              }}
              onOpenChange={setOpen}
              onValueChange={(value) => {
                setModelId(value)
                setEditingQuery(false)
              }}
            />
          </HbarAppUiField>
          <HbarAppUiField
            controlId="provider-endpoint"
            label={copy.endpointLabel}
            hint={copy.endpointHint}
            {...(scenario === 'error' ? { error: copy.endpointError } : {})}
          >
            <HbarAppUiInput
              id="provider-endpoint"
              type="url"
              value={endpoint}
              disabled={disabled}
              onChange={(event) => setEndpoint(event.currentTarget.value)}
            />
          </HbarAppUiField>
          <HbarAppUiField controlId="provider-notes" label={copy.notesLabel}>
            <HbarAppUiTextarea
              id="provider-notes"
              value={notes}
              disabled={disabled}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          </HbarAppUiField>
          <HbarAppUiField
            controlId="provider-thinking-levels"
            label={copy.thinkingLabel}
            description={copy.thinkingDescription}
          >
            <HbarAppUiMultiSelect
              id="provider-thinking-levels"
              values={thinkingLevels}
              query={thinkingQuery}
              open={thinkingOpen}
              options={copy.thinkingLevels}
              labels={{ ...copy.combo, remove: copy.removeThinking }}
              placeholder={copy.thinkingPlaceholder}
              disabled={disabled}
              onQueryChange={setThinkingQuery}
              onOpenChange={setThinkingOpen}
              onValuesChange={(values) => {
                setThinkingLevels(values)
                setThinkingQuery('')
                setThinkingOpen(false)
              }}
            />
          </HbarAppUiField>
          <LumenFrame className="form-controls-audit-checks">
            <HbarAppUiCheckBox
              checked={visible}
              disabled={disabled}
              label={copy.visibleLabel}
              description={copy.visibleDescription}
              onChange={(event) => setVisible(event.currentTarget.checked)}
            />
            <HbarAppUiCheckBox
              checked={imageInput}
              disabled={disabled}
              label={copy.imageLabel}
              description={copy.imageDescription}
              onChange={(event) => setImageInput(event.currentTarget.checked)}
            />
          </LumenFrame>
        </LumenFrame>
        <LumenText as="output" aria-label={copy.selectedLabel}>{selected?.label ?? query}</LumenText>
      </LumenFrame>
    </LumenFrame>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing visual audit root')
createRoot(root).render(<FormControlsAudit />)
