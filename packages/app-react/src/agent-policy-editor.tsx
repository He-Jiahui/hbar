import { useState } from 'react'
import {
  LumenButton,
  LumenFormField,
  LumenFrame,
  LumenInput,
  LumenPopupSelect,
  LumenContentText,
  LumenToggleGroup,
  type LumenControlOption,
} from '@lumen/app-ui'
import type { AgentPolicyEditorEntry, AgentWorkspaceState } from '@hbar/app-runtime'
import { AgentModelPicker, type AgentModelPickerLabels } from './agent-model-picker'
import { HbarLumenDisclosure } from './lumen-disclosure'
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
  const setExpandedAndLoad = (next: boolean) => {
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
  }
  return (
    <HbarLumenDisclosure
      className="hbar-agent-policy-editor"
      label={<LumenContentText context="control.label">{labels.title}</LumenContentText>}
      open={expanded}
      onOpenChange={setExpandedAndLoad}
    >
      <LumenContentText context="form.description">{labels.description}</LumenContentText>
      {entry?.snapshot && (
        <LumenContentText context="form.help">
          {labels.source(entry.snapshot.sourceLayer, entry.snapshot.inherited)}
        </LumenContentText>
      )}
      {entry?.status === 'loading' && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {entry?.error && (
        <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
          {labels.error(entry.error)}
        </LumenContentText>
      )}
      {policies.feedback?.parentSessionId === parentSessionId && (
        <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
          {labels.error(policies.feedback.code)}
        </LumenContentText>
      )}
      <LumenFrame className="hbar-agent-policy-rows">
        {entry?.rows.map((row, index) => {
          const model = catalog.models.find((item) => item.id === row.modelId)
          const change = (field: string, value: string) => invoke('agentPolicy.change', { rowId: row.id, field, value })
          const difficultyOptions: readonly LumenControlOption[] = (['simple', 'medium', 'complex'] as const).map(
            (difficulty) => ({ id: difficulty, label: labels.difficulties[difficulty] }),
          )
          const thinkingOptions: readonly LumenControlOption[] = [
            { id: '', label: labels.chooseThinking },
            ...(model?.thinkingLevels.map((level) => ({ id: level, label: labels.thinkingOption(level) })) ?? []),
            ...(row.thinkingLevel && !model?.thinkingLevels.some((level) => level === row.thinkingLevel)
              ? [{ id: row.thinkingLevel, label: labels.thinkingOption(row.thinkingLevel), disabled: true }]
              : []),
          ]
          return (
            <LumenFrame as="fieldset" key={row.id} className="hbar-agent-policy-row" disabled={busy}>
              <LumenFrame className="hbar-agent-policy-fields">
                <LumenFrame className="hbar-agent-policy-primary-fields">
                  <LumenFormField context={null} controlId={`${row.id}-difficulty`} label={labels.difficulty}>
                    <LumenPopupSelect
                      id={`${row.id}-difficulty`}
                      value={row.difficulty}
                      options={difficultyOptions}
                      onValueChange={(value) => change('difficulty', value)}
                    />
                  </LumenFormField>
                  <LumenFormField context={null} controlId={`${row.id}-model`} label={labels.model} required>
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
                </LumenFrame>
                <LumenFormField
                  context={null}
                  controlId={`${row.id}-thinking`}
                  label={labels.thinking}
                  required
                  className="hbar-agent-policy-thinking"
                >
                  <LumenToggleGroup
                    id={`${row.id}-thinking`}
                    type="single"
                    value={row.thinkingLevel}
                    options={thinkingOptions}
                    disabled={busy}
                    onValueChange={(value) => change('thinkingLevel', value)}
                  />
                </LumenFormField>
                <LumenFrame className="hbar-agent-policy-weight-row">
                  <LumenFormField
                    context={null}
                    controlId={`${row.id}-weight`}
                    label={labels.weight}
                    required
                    className="hbar-agent-policy-weight"
                  >
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
                  <LumenFrame
                    className="hbar-agent-policy-row-actions"
                    role="group"
                    aria-label={labels.remove(index + 1)}
                    tabIndex={0}
                  >
                    <LumenButton
                      size="s"
                      variant="text"
                      onClick={() => invoke('agentPolicy.remove', { rowId: row.id })}
                    >
                      {labels.remove(index + 1)}
                    </LumenButton>
                  </LumenFrame>
                </LumenFrame>
              </LumenFrame>
            </LumenFrame>
          )
        })}
      </LumenFrame>
      {entry?.snapshot && !entry.rows.length && (
        <LumenContentText context="empty.description">{labels.empty}</LumenContentText>
      )}
      {entry?.snapshot && (
        <LumenContentText context="feedback.paragraph" role="status">
          {entry.dirty ? labels.unsaved : labels.saved}
        </LumenContentText>
      )}
      <LumenFrame className="hbar-agent-policy-actions" role="toolbar" aria-label={labels.title} tabIndex={0}>
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
    </HbarLumenDisclosure>
  )
}
