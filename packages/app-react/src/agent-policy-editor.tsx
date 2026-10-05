import { useState } from 'react'
import { LumenButton, LumenFormField, LumenFrame, LumenInput, LumenOption, LumenSelect, LumenText } from '@lumen/app-ui'
import type { AgentPolicyEditorEntry, AgentWorkspaceState } from '@hbar/app-runtime'
import { AgentModelPicker, type AgentModelPickerLabels } from './agent-model-picker'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './agent-policy-editor.css'

export interface AgentPolicyEditorLabels {
  readonly title: string
  readonly description: string
  readonly empty: string
  readonly model: string
  readonly chooseModel: string
  readonly difficulty: string
  readonly difficulties: Readonly<Record<'simple' | 'medium' | 'complex', string>>
  readonly thinking: string
  readonly chooseThinking: string
  readonly weight: string
  readonly add: string
  readonly remove: (index: number) => string
  readonly save: string
  readonly saving: string
  readonly loading: string
  readonly retry: string
  readonly refresh: string
  readonly inherit: string
  readonly unsaved: string
  readonly saved: string
  readonly source: (sourceLayer: string, inherited: boolean) => string
  readonly error: (code: string) => string
  readonly thinkingOption: (level: string) => string
}
/** Content-grown, Host-bounded 32-row editor inside the Agent tool pane's owned scroll region. */
export function AgentPolicyEditor({
  labels,
  modelLabels,
  instanceId,
  parentSessionId,
  catalog,
  connected,
  refreshModels,
}: {
  readonly labels: AgentPolicyEditorLabels
  readonly modelLabels: AgentModelPickerLabels
  readonly instanceId: string
  readonly parentSessionId: string
  readonly catalog: AgentWorkspaceState['catalog']
  readonly connected: boolean
  readonly refreshModels: () => void
}) {
  const runtime = useHbarRuntime()
  const policies = useHbarRuntimeState(runtime.state.agentPolicies)
  const entry: AgentPolicyEditorEntry | undefined = policies.entries[parentSessionId]
  const [expanded, setExpanded] = useState(false)
  const invoke = (
    name: 'agentPolicy.load' | 'agentPolicy.add' | 'agentPolicy.remove' | 'agentPolicy.change' | 'agentPolicy.save',
    input: Record<string, unknown> = {},
  ) => {
    void runtime.commands.execute(name, { instanceId, parentSessionId, ...input }).catch(() => {})
  }
  const busy = !connected || entry?.status === 'loading' || entry?.status === 'saving' || entry?.status === 'unknown'
  return (
    <details
      className="hbar-agent-policy-editor"
      open={expanded}
      onToggle={(event) => {
        const next = event.currentTarget.open
        setExpanded(next)
        if (
          next &&
          !entry?.snapshot &&
          entry?.status !== 'loading' &&
          entry?.status !== 'saving' &&
          entry?.status !== 'unknown'
        ) {
          invoke('agentPolicy.load')
          refreshModels()
        }
      }}
    >
      <summary>
        <LumenText as="span" variant="supporting">
          {labels.title}
        </LumenText>
      </summary>
      <LumenText as="p" variant="supporting">
        {labels.description}
      </LumenText>
      {entry?.snapshot && (
        <LumenText as="p" variant="supporting">
          {labels.source(entry.snapshot.sourceLayer, entry.snapshot.inherited)}
        </LumenText>
      )}
      {entry?.status === 'loading' && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {entry?.error && (
        <LumenText as="p" role="alert">
          {labels.error(entry.error)}
        </LumenText>
      )}
      {policies.feedback?.parentSessionId === parentSessionId && (
        <LumenText as="p" role="alert">
          {labels.error(policies.feedback.code)}
        </LumenText>
      )}
      <LumenFrame className="hbar-agent-policy-rows">
        {entry?.rows.map((row, index) => {
          const model = catalog.models.find((item) => item.id === row.modelId)
          const change = (field: string, value: string) => invoke('agentPolicy.change', { rowId: row.id, field, value })
          return (
            <LumenFrame as="fieldset" key={row.id} className="hbar-agent-policy-row" disabled={busy}>
              <LumenFormField controlId={`${row.id}-difficulty`} label={labels.difficulty}>
                <LumenSelect
                  id={`${row.id}-difficulty`}
                  value={row.difficulty}
                  onChange={(event) => change('difficulty', event.currentTarget.value)}
                >
                  {(['simple', 'medium', 'complex'] as const).map((difficulty) => (
                    <LumenOption key={difficulty} value={difficulty}>
                      {labels.difficulties[difficulty]}
                    </LumenOption>
                  ))}
                </LumenSelect>
              </LumenFormField>
              <LumenFormField controlId={`${row.id}-model`} label={labels.model} required>
                <AgentModelPicker
                  id={`${row.id}-model`}
                  value={row.modelId}
                  catalog={catalog}
                  connected={connected}
                  disabled={busy}
                  labels={{ ...modelLabels, choose: labels.chooseModel }}
                  onSelect={(value) => change('modelId', value)}
                  onRetry={refreshModels}
                  required
                />
              </LumenFormField>
              <LumenFormField controlId={`${row.id}-thinking`} label={labels.thinking} required>
                <LumenSelect
                  id={`${row.id}-thinking`}
                  value={row.thinkingLevel}
                  onChange={(event) => change('thinkingLevel', event.currentTarget.value)}
                >
                  <LumenOption value="">{labels.chooseThinking}</LumenOption>
                  {model?.thinkingLevels.map((level) => (
                    <LumenOption key={level} value={level}>
                      {labels.thinkingOption(level)}
                    </LumenOption>
                  ))}
                  {row.thinkingLevel && !model?.thinkingLevels.some((level) => level === row.thinkingLevel) && (
                    <LumenOption value={row.thinkingLevel}>{labels.thinkingOption(row.thinkingLevel)}</LumenOption>
                  )}
                </LumenSelect>
              </LumenFormField>
              <LumenFormField controlId={`${row.id}-weight`} label={labels.weight} required>
                <LumenInput
                  id={`${row.id}-weight`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1_000}
                  step={1}
                  value={row.weight}
                  onChange={(event) => change('weight', event.currentTarget.value)}
                />
              </LumenFormField>
              <LumenButton size="s" variant="text" onClick={() => invoke('agentPolicy.remove', { rowId: row.id })}>
                {labels.remove(index + 1)}
              </LumenButton>
            </LumenFrame>
          )
        })}
      </LumenFrame>
      {entry?.snapshot && !entry.rows.length && <LumenText as="p">{labels.empty}</LumenText>}
      {entry?.snapshot && (
        <LumenText as="p" role="status">
          {entry.dirty ? labels.unsaved : labels.saved}
        </LumenText>
      )}
      <LumenFrame className="hbar-agent-policy-actions">
        <LumenButton
          size="s"
          variant="outlined"
          disabled={busy || !entry?.snapshot || entry.rows.length >= 32}
          onClick={() => invoke('agentPolicy.add')}
        >
          {labels.add}
        </LumenButton>
        <LumenButton
          size="s"
          tone="primary"
          disabled={!connected || entry?.status === 'saving' || !entry?.snapshot}
          onClick={() => invoke('agentPolicy.save')}
        >
          {entry?.status === 'saving' ? labels.saving : entry?.status === 'unknown' ? labels.retry : labels.save}
        </LumenButton>
        <LumenButton
          size="s"
          variant="text"
          disabled={busy || !entry?.snapshot}
          onClick={() => invoke('agentPolicy.save', { inherit: true })}
        >
          {labels.inherit}
        </LumenButton>
        <LumenButton size="s" variant="text" disabled={busy} onClick={() => invoke('agentPolicy.load')}>
          {labels.refresh}
        </LumenButton>
      </LumenFrame>
    </details>
  )
}
