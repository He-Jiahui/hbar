import { useEffect, useId, useState } from 'react'
import { useStore } from 'zustand'
import {
  Activity,
  FolderTree,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Square,
  TerminalSquare,
} from 'lucide-react'
import type { NodeConsoleEntryModel, NodeConsoleModel, NodeConsoleState } from './node-console-contract'
import {
  LumenButton,
  LumenCheckBoxControl,
  LumenCollection,
  LumenCollectionItem,
  LumenContentText,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenOption,
  LumenSelect,
  LumenText,
} from '@lumen/app-ui'
import './node-console.css'

export type {
  NodeConsoleEntryModel,
  NodeConsoleEntryState,
  NodeConsoleModel,
  NodeConsoleState,
} from './node-console-contract'

type Floor = NonNullable<NodeConsoleState['policyDraft']>
type Tab = 'overview' | 'audit' | 'confirmations' | 'sessions'

export interface HbarNodeConsoleLabels {
  readonly title: string
  readonly description: string
  readonly refresh: string
  readonly loading: string
  readonly retry: string
  readonly roleUnknown: string
  readonly role: (role: 'operator' | 'observer') => string
  readonly linked: string
  readonly unlinked: string
  readonly linkPending: string
  readonly connection: string
  readonly node: string
  readonly platform: string
  readonly fingerprint: string
  readonly roots: string
  readonly noRoots: string
  readonly rootAccess: (access: 'read' | 'write') => string
  readonly securityFloor: string
  readonly process: string
  readonly network: string
  readonly terminal: string
  readonly confinement: string
  readonly confinementMode: (mode: Floor['osConfinement']) => string
  readonly protectedPaths: string
  readonly protectedPathsValue: (paths: readonly string[]) => string
  readonly maxConcurrent: string
  readonly maxTimeout: string
  readonly readOnly: string
  readonly savePolicy: string
  readonly policyFailure: (code: string) => string
  readonly policyConflict: string
  readonly running: string
  readonly noRunning: string
  readonly paused: string
  readonly active: string
  readonly pause: string
  readonly resume: string
  readonly terminate: string
  readonly actionFailure: (code: string) => string
  readonly audit: string
  readonly noAudit: string
  readonly auditTime: (timestamp: number) => string
  readonly auditTool: (tool: string, decision: string, backend: string, code: string | number | null) => string
  readonly auditIdentity: (entry: NodeConsoleState['audit'][number]) => string
  readonly confirmations: string
  readonly noConfirmations: string
  readonly confirmationSummary: (source: string, tool: string, root: string, expiresAt: number) => string
  readonly confirmationIdentity: (identity: NodeConsoleState['confirmations'][number]['identity']) => string
  readonly confirmationState: (state: string) => string
  readonly approve: string
  readonly reject: string
  readonly confirmationFailure: (code: string) => string
  readonly staleConfirmation: string
  readonly moreAudit: string
  readonly conversations: string
  readonly noSessions: string
  readonly moreSessions: string
  readonly selectSession: string
  readonly noMessages: string
  readonly messageRole: (role: string) => string
  readonly messageToolCall: (name: string, argumentsJson: string) => string
  readonly messageTime: (timestamp: number) => string
  readonly truncated: string
  readonly snapshotUnavailable: string
  readonly error: (code: string) => string
  readonly pairDevice: string
  readonly pairingDescription: string
  readonly deviceName: string
  readonly pairingCode: string
  readonly pairingCodeHelp: string
  readonly pairAction: string
  readonly pairing: string
  readonly forgetDevice: string
  readonly forgetDeviceHelp: string
  readonly pairFailure: (code: string) => string
  readonly credentialFailure: (code: string) => string
  readonly storageFailure: (code: string) => string
  readonly forgetFailure: (code: string) => string
}

export interface HbarNodeConsoleEntryProps {
  readonly entry: NodeConsoleEntryModel
  readonly labels: HbarNodeConsoleLabels
}

export function HbarNodeConsoleEntry({ entry, labels }: HbarNodeConsoleEntryProps) {
  const state = useStore(entry.store)
  const id = useId()
  if (state.phase === 'ready' && state.consoleModel && state.device) {
    return (
      <LumenFrame className="hbar-node-console-entry">
        <LumenFrame className="hbar-node-console-device-heading">
          <LumenContentText context="form.help" role="status">
            {labels.role(state.device.role)}
          </LumenContentText>
          <LumenButton onClick={() => void entry.forgetDevice()}>{labels.forgetDevice}</LumenButton>
        </LumenFrame>
        <LumenContentText context="form.help">{labels.forgetDeviceHelp}</LumenContentText>
        {state.errorCode && (
          <LumenContentText context="feedback.message" role="alert">
            {labels.forgetFailure(state.errorCode)}
          </LumenContentText>
        )}
        <HbarNodeConsole model={state.consoleModel} labels={labels} />
      </LumenFrame>
    )
  }
  if (state.phase === 'loading' || state.phase === 'pairing')
    return (
      <LumenFrame as="section" className="hbar-node-console-entry" aria-busy="true">
        <LumenContentText context="feedback.message" role="status">
          {state.phase === 'pairing' ? labels.pairing : labels.loading}
        </LumenContentText>
      </LumenFrame>
    )
  return (
    <LumenFrame as="section" className="hbar-node-console-entry" aria-labelledby={`${id}-pair-title`}>
      <LumenContentText context="section.title" id={`${id}-pair-title`}>
        {labels.pairDevice}
      </LumenContentText>
      <LumenContentText context="form.description">{labels.pairingDescription}</LumenContentText>
      {state.phase === 'failed' && state.errorCode && (
        <LumenFrame className="hbar-node-console-error" role="alert">
          <LumenContentText context="feedback.message">
            {state.errorKind === 'storage' ? labels.storageFailure(state.errorCode) : labels.error(state.errorCode)}
          </LumenContentText>
          <LumenButton onClick={() => void entry.retryLoad()}>{labels.retry}</LumenButton>
        </LumenFrame>
      )}
      {state.phase !== 'failed' && (
        <LumenFrame
          as="form"
          className="hbar-node-console-pair-form"
          onSubmit={(event) => {
            event.preventDefault()
            void entry.pair()
          }}
        >
          <LumenFrame as="label" htmlFor={`${id}-name`}>
            <LumenContentText context="form.label">{labels.deviceName}</LumenContentText>
          </LumenFrame>
          <LumenInput
            id={`${id}-name`}
            autoComplete="nickname"
            maxLength={160}
            value={state.deviceName}
            disabled={state.phase !== 'unpaired'}
            onChange={(event) => entry.setDeviceName(event.currentTarget.value)}
          />
          <LumenFrame as="label" htmlFor={`${id}-code`}>
            <LumenContentText context="form.label">{labels.pairingCode}</LumenContentText>
          </LumenFrame>
          <LumenInput
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={state.pairingCode}
            disabled={state.phase !== 'unpaired'}
            aria-describedby={`${id}-code-help`}
            onChange={(event) => entry.setPairingCode(event.currentTarget.value)}
          />
          <LumenContentText id={`${id}-code-help`} context="form.help">
            {labels.pairingCodeHelp}
          </LumenContentText>
          {state.errorCode && (
            <LumenContentText context="feedback.message" role="alert">
              {state.errorKind === 'credentials'
                ? labels.credentialFailure(state.errorCode)
                : labels.pairFailure(state.errorCode)}
            </LumenContentText>
          )}
          <LumenButton
            type="submit"
            tone="primary"
            disabled={
              state.phase !== 'unpaired' || state.deviceName.trim().length === 0 || !/^\d{8}$/u.test(state.pairingCode)
            }
          >
            {labels.pairAction}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

export interface HbarNodeConsoleProps {
  readonly model: NodeConsoleModel
  readonly labels: HbarNodeConsoleLabels
}

/**
 * Reference: https://pro.reactbits.dev/docs/app-ui/monitoring — flowing node status and bounded audit/session panes;
 * https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-3 — compact live state with nearby stop controls.
 * The standalone shell keeps Raycast navigation hierarchy, Cursor action density, and the current Lumen reading surface.
 */

function updateRootAccess(floor: Floor, rootId: string, access: 'read' | 'write'): Floor {
  return { ...floor, roots: floor.roots.map((root) => (root.rootId === rootId ? { ...root, access } : root)) }
}

export function HbarNodeConsole({ model, labels }: HbarNodeConsoleProps) {
  const state = useStore(model.store)
  const id = useId()
  const operator = state.role === 'operator' && state.roleVerified
  const observer = state.role === 'observer' && state.roleVerified
  const canObserve = operator || observer
  const editable = operator && state.policyDraft !== null && !state.busy
  const policy = state.policyDraft
  const [tab, setTab] = useStateTab(state.role === 'operator' ? 'overview' : 'sessions')

  useEffect(() => {
    model.start()
    return () => model.stop()
  }, [model])

  const error = state.connectionError ?? state.actionError
  return (
    <LumenFrame as="section" className="hbar-node-console" aria-labelledby={`${id}-title`} aria-busy={state.busy}>
      <LumenFrame className="hbar-node-console-heading">
        <LumenFrame className="hbar-node-console-heading-copy">
          <LumenContentText context="section.title" id={`${id}-title`}>
            {labels.title}
          </LumenContentText>
          <LumenContentText context="form.description">{labels.description}</LumenContentText>
        </LumenFrame>
        <LumenFrame className="hbar-node-console-actions">
          <LumenButton disabled={state.busy || !state.role} loading={state.busy} onClick={() => void model.refresh()}>
            <LumenIcon icon={RefreshCw} tier="sm" />
            {state.busy ? labels.loading : labels.refresh}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>

      {state.role === null ? (
        <LumenContentText context="feedback.message" role="status">
          {labels.roleUnknown}
        </LumenContentText>
      ) : (
        <LumenContentText className="hbar-node-console-role" context="form.help" role="status">
          <LumenIcon icon={Shield} tier="sm" />
          {labels.role(state.role)}
        </LumenContentText>
      )}
      {error && (
        <LumenFrame className="hbar-node-console-error" role="alert">
          <LumenContentText context="feedback.message">{labels.error(error)}</LumenContentText>
          <LumenButton disabled={!state.role} onClick={() => void model.refresh()}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}

      <LumenFrame as="nav" className="hbar-node-console-tabs" aria-label={labels.title}>
        {operator && (
          <LumenButton aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}>
            <LumenIcon icon={Activity} tier="sm" />
            {labels.title}
          </LumenButton>
        )}
        {operator && (
          <LumenButton
            aria-current={tab === 'audit' ? 'page' : undefined}
            onClick={() => {
              setTab('audit')
              void model.loadAudit()
            }}
          >
            <LumenIcon icon={Shield} tier="sm" />
            {labels.audit}
          </LumenButton>
        )}
        {operator && (
          <LumenButton
            aria-current={tab === 'confirmations' ? 'page' : undefined}
            onClick={() => {
              setTab('confirmations')
              void model.loadConfirmations()
              void model.loadPolicy()
            }}
          >
            <LumenIcon icon={Shield} tier="sm" />
            {labels.confirmations}
          </LumenButton>
        )}
        {canObserve && (
          <LumenButton
            aria-current={tab === 'sessions' ? 'page' : undefined}
            onClick={() => {
              setTab('sessions')
              if (state.sessions.length === 0) void model.loadSessions()
            }}
          >
            <LumenIcon icon={MessageSquareText} tier="sm" />
            {labels.conversations}
          </LumenButton>
        )}
      </LumenFrame>

      {operator && tab === 'overview' && (
        <LumenFrame className="hbar-node-console-overview">
          <LumenFrame as="section" className="hbar-node-console-section" aria-labelledby={`${id}-connection`}>
            <LumenContentText context="section.subtitle" id={`${id}-connection`}>
              {labels.connection}
            </LumenContentText>
            {state.status ? (
              <>
                <LumenCollection as="dl" className="hbar-node-console-facts">
                  <LumenCollectionItem as="div">
                    <LumenContentText context="metric.label">{labels.linked}</LumenContentText>
                    <LumenContentText context="metric.value" data-state={state.status.linked ? 'success' : 'warning'}>
                      {state.status.linked ? labels.linked : labels.unlinked}
                    </LumenContentText>
                  </LumenCollectionItem>
                  <LumenCollectionItem as="div">
                    <LumenContentText context="metric.label">{labels.node}</LumenContentText>
                    <LumenContentText context="metric.value">{state.status.capabilities.nodeId}</LumenContentText>
                  </LumenCollectionItem>
                  <LumenCollectionItem as="div">
                    <LumenContentText context="metric.label">{labels.platform}</LumenContentText>
                    <LumenContentText context="metric.value">{state.status.capabilities.platform}</LumenContentText>
                  </LumenCollectionItem>
                  <LumenCollectionItem as="div">
                    <LumenContentText context="metric.label">{labels.fingerprint}</LumenContentText>
                    <LumenContentText context="metric.value">
                      <LumenContentText context="code.inline">{state.status.fingerprint}</LumenContentText>
                    </LumenContentText>
                  </LumenCollectionItem>
                </LumenCollection>
                <LumenContentText context="form.help">
                  {state.status.connection.phase === 'online'
                    ? labels.linked
                    : state.status.connection.reasonCode
                      ? labels.error(state.status.connection.reasonCode)
                      : labels.linkPending}
                </LumenContentText>
              </>
            ) : (
              <LumenContentText context="feedback.message">
                {state.busy ? labels.loading : labels.snapshotUnavailable}
              </LumenContentText>
            )}
          </LumenFrame>

          <LumenFrame as="section" className="hbar-node-console-section" aria-labelledby={`${id}-roots`}>
            <LumenContentText context="section.subtitle" id={`${id}-roots`}>
              <LumenIcon icon={FolderTree} tier="sm" />
              {labels.roots}
            </LumenContentText>
            {state.status?.capabilities.roots.length ? (
              <LumenCollection className="hbar-node-console-list">
                {state.status.capabilities.roots.map((root) => (
                  <LumenCollectionItem as="li" key={root.rootId} className="hbar-node-console-row">
                    <LumenContentText context="record.title">{root.name}</LumenContentText>
                    <LumenContentText context="code.inline">{root.nodePath}</LumenContentText>
                    <LumenContentText context="record.description">{labels.rootAccess(root.access)}</LumenContentText>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            ) : (
              <LumenContentText context="feedback.message">
                {state.status ? labels.noRoots : labels.snapshotUnavailable}
              </LumenContentText>
            )}
          </LumenFrame>

          <LumenFrame as="section" className="hbar-node-console-section" aria-labelledby={`${id}-floor`}>
            <LumenFrame className="hbar-node-console-section-heading">
              <LumenContentText context="section.subtitle" id={`${id}-floor`}>
                {labels.securityFloor}
              </LumenContentText>
              {policy && state.floor && JSON.stringify(policy) !== JSON.stringify(state.floor) && (
                <LumenButton
                  tone="primary"
                  disabled={!editable}
                  loading={state.busy}
                  onClick={() => void model.updatePolicy(policy)}
                >
                  {labels.savePolicy}
                </LumenButton>
              )}
            </LumenFrame>
            {policy ? (
              <LumenFrame className="hbar-node-console-policy">
                <LumenFrame as="label">
                  <LumenCheckBoxControl
                    checked={policy.process}
                    disabled={!editable}
                    onChange={(event) => model.setPolicyDraft({ ...policy, process: event.currentTarget.checked })}
                  />
                  <LumenContentText context="form.label">{labels.process}</LumenContentText>
                </LumenFrame>
                <LumenFrame as="label">
                  <LumenCheckBoxControl
                    checked={policy.network}
                    disabled={!editable}
                    onChange={(event) => model.setPolicyDraft({ ...policy, network: event.currentTarget.checked })}
                  />
                  <LumenContentText context="form.label">{labels.network}</LumenContentText>
                </LumenFrame>
                <LumenFrame as="label">
                  <LumenCheckBoxControl
                    checked={policy.terminal}
                    disabled={!editable}
                    onChange={(event) => model.setPolicyDraft({ ...policy, terminal: event.currentTarget.checked })}
                  />
                  <LumenContentText context="form.label">{labels.terminal}</LumenContentText>
                </LumenFrame>
                <LumenFrame as="label" htmlFor={`${id}-confinement`}>
                  <LumenContentText context="form.label">{labels.confinement}</LumenContentText>
                </LumenFrame>
                <LumenSelect
                  id={`${id}-confinement`}
                  value={policy.osConfinement}
                  disabled={!editable}
                  onChange={(event) => {
                    const mode = event.currentTarget.value
                    if (mode === 'required' || mode === 'preferred' || mode === 'off')
                      model.setPolicyDraft({ ...policy, osConfinement: mode })
                  }}
                >
                  {(['required', 'preferred', 'off'] as const).map((mode) => (
                    <LumenOption value={mode} key={mode}>
                      {labels.confinementMode(mode)}
                    </LumenOption>
                  ))}
                </LumenSelect>
                <LumenFrame as="label" htmlFor={`${id}-concurrent`}>
                  <LumenContentText context="form.label">{labels.maxConcurrent}</LumenContentText>
                </LumenFrame>
                <LumenInput
                  id={`${id}-concurrent`}
                  type="number"
                  min={1}
                  max={64}
                  value={policy.maxConcurrentProcesses}
                  disabled={!editable}
                  onChange={(event) =>
                    model.setPolicyDraft({ ...policy, maxConcurrentProcesses: Number(event.currentTarget.value) })
                  }
                />
                <LumenFrame as="label" htmlFor={`${id}-timeout`}>
                  <LumenContentText context="form.label">{labels.maxTimeout}</LumenContentText>
                </LumenFrame>
                <LumenInput
                  id={`${id}-timeout`}
                  type="number"
                  min={1000}
                  max={1_200_000}
                  step={1000}
                  value={policy.maxTimeoutMs}
                  disabled={!editable}
                  onChange={(event) =>
                    model.setPolicyDraft({ ...policy, maxTimeoutMs: Number(event.currentTarget.value) })
                  }
                />
                <LumenContentText context="form.help">
                  {labels.protectedPathsValue(policy.protectedPaths)}
                </LumenContentText>
                {policy.roots.map((root) => (
                  <LumenFrame as="label" className="hbar-node-console-root-edit" key={root.rootId}>
                    <LumenContentText context="record.title">{root.name}</LumenContentText>
                    <LumenContentText context="code.inline">{root.path}</LumenContentText>
                    <LumenSelect
                      aria-label={root.name}
                      value={root.access}
                      disabled={!editable}
                      onChange={(event) => {
                        const access = event.currentTarget.value
                        if (access === 'read' || access === 'write')
                          model.setPolicyDraft(updateRootAccess(policy, root.rootId, access))
                      }}
                    >
                      <LumenOption value="read">{labels.rootAccess('read')}</LumenOption>
                      <LumenOption value="write">{labels.rootAccess('write')}</LumenOption>
                    </LumenSelect>
                  </LumenFrame>
                ))}
              </LumenFrame>
            ) : (
              <LumenContentText context="feedback.message">
                {state.policyError ? labels.policyFailure(state.policyError) : labels.snapshotUnavailable}
              </LumenContentText>
            )}
            {state.policyError && (
              <LumenContentText context="feedback.message" role="alert">
                {state.policyError === 'NODE_POLICY_CONFLICT'
                  ? labels.policyConflict
                  : labels.policyFailure(state.policyError)}
              </LumenContentText>
            )}
            {!editable && <LumenContentText context="form.help">{labels.readOnly}</LumenContentText>}
          </LumenFrame>

          <LumenFrame as="section" className="hbar-node-console-section" aria-labelledby={`${id}-running`}>
            <LumenFrame className="hbar-node-console-section-heading">
              <LumenContentText context="section.subtitle" id={`${id}-running`}>
                <LumenIcon icon={TerminalSquare} tier="sm" />
                {labels.running}
              </LumenContentText>
              {state.status && (
                <LumenButton
                  disabled={!operator || state.pausing}
                  loading={state.pausing}
                  onClick={() => void model.setPaused(!state.status?.paused)}
                >
                  <LumenIcon icon={state.status.paused ? Play : Pause} tier="sm" />
                  {state.status.paused ? labels.resume : labels.pause}
                </LumenButton>
              )}
            </LumenFrame>
            {state.status?.running.length ? (
              <LumenCollection className="hbar-node-console-list">
                {state.status.running.map((operationId) => (
                  <LumenCollectionItem as="li" className="hbar-node-console-row" key={operationId}>
                    <LumenContentText context="code.inline">{operationId}</LumenContentText>
                    <LumenButton
                      tone="danger"
                      disabled={!operator || state.pendingOperationId !== null}
                      loading={state.pendingOperationId === operationId}
                      onClick={() => void model.terminate(operationId)}
                    >
                      <LumenIcon icon={Square} tier="sm" />
                      {labels.terminate}
                    </LumenButton>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            ) : (
              <LumenContentText context="feedback.message">
                {state.status ? labels.noRunning : labels.snapshotUnavailable}
              </LumenContentText>
            )}
            {state.actionError && (
              <LumenContentText context="feedback.message" role="alert">
                {labels.actionFailure(state.actionError)}
              </LumenContentText>
            )}
            {state.status && (
              <LumenContentText context="form.help">
                {state.status.paused ? labels.paused : labels.active}
              </LumenContentText>
            )}
          </LumenFrame>
        </LumenFrame>
      )}

      {operator && tab === 'audit' && (
        <LumenFrame as="section" className="hbar-node-console-section" aria-labelledby={`${id}-audit`}>
          <LumenContentText context="section.subtitle" id={`${id}-audit`}>
            {labels.audit}
          </LumenContentText>
          {state.auditError && (
            <LumenFrame className="hbar-node-console-error" role="alert">
              <LumenContentText context="feedback.message">{labels.error(state.auditError)}</LumenContentText>
              <LumenButton disabled={state.loadingAudit} onClick={() => void model.loadAudit()}>
                {labels.retry}
              </LumenButton>
            </LumenFrame>
          )}
          {state.loadingAudit && state.audit.length === 0 ? (
            <LumenContentText context="feedback.message" role="status">
              {labels.loading}
            </LumenContentText>
          ) : state.audit.length ? (
            <LumenCollection as="ol" className="hbar-node-console-list" aria-label={labels.audit}>
              {state.audit.map((entry) => (
                <LumenCollectionItem
                  as="li"
                  className="hbar-node-console-audit-row"
                  key={`${entry.seq}:${entry.operationId}`}
                >
                  <LumenText as="time" dateTime={new Date(entry.time).toISOString()}>
                    {labels.auditTime(entry.time)}
                  </LumenText>
                  <LumenContentText context="code.inline">{entry.operationId}</LumenContentText>
                  <LumenContentText context="record.description">
                    {labels.auditTool(entry.tool, entry.decision, entry.backend, entry.code)}
                  </LumenContentText>
                  <LumenContentText context="form.help">{labels.auditIdentity(entry)}</LumenContentText>
                </LumenCollectionItem>
              ))}
            </LumenCollection>
          ) : (
            <LumenContentText context="feedback.message">{labels.noAudit}</LumenContentText>
          )}
          {state.auditHasMore && (
            <LumenButton
              disabled={state.loadingAudit}
              loading={state.loadingAudit}
              onClick={() => void model.loadAudit(true)}
            >
              {labels.moreAudit}
            </LumenButton>
          )}
        </LumenFrame>
      )}

      {operator && tab === 'confirmations' && (
        <LumenFrame as="section" className="hbar-node-console-section" aria-labelledby={`${id}-confirmations`}>
          <LumenFrame className="hbar-node-console-section-heading">
            <LumenContentText context="section.subtitle" id={`${id}-confirmations`}>
              {labels.confirmations}
            </LumenContentText>
            <LumenButton
              disabled={state.loadingConfirmations || state.resolvingConfirmationId !== null}
              loading={state.loadingConfirmations}
              onClick={() => void model.loadConfirmations()}
            >
              {labels.refresh}
            </LumenButton>
          </LumenFrame>
          {state.confirmationError && (
            <LumenContentText context="feedback.message" role="alert">
              {labels.confirmationFailure(state.confirmationError)}
            </LumenContentText>
          )}
          {state.loadingConfirmations && state.confirmations.length === 0 ? (
            <LumenContentText context="feedback.message" role="status">
              {labels.loading}
            </LumenContentText>
          ) : state.confirmations.length ? (
            <LumenCollection className="hbar-node-console-list" aria-label={labels.confirmations}>
              {state.confirmations.map((item) => {
                const stale = item.identity.floorRevision !== state.policyRevision
                const actionable = item.state === 'waiting' && item.expiresAt > Date.now() && !stale
                return (
                  <LumenCollectionItem
                    as="li"
                    className="hbar-node-console-confirmation-row"
                    key={item.id}
                    data-confirmation-id={item.id}
                  >
                    <LumenFrame className="hbar-node-console-confirmation-copy">
                      <LumenContentText context="record.title">{labels.confirmationState(item.state)}</LumenContentText>
                      <LumenContentText context="record.description">
                        {labels.confirmationSummary(
                          item.identity.source,
                          item.identity.tool,
                          item.identity.rootPath,
                          item.expiresAt,
                        )}
                      </LumenContentText>
                      <LumenContentText context="record.description">
                        {labels.confirmationIdentity(item.identity)}
                      </LumenContentText>
                      <LumenContentText context="message.body">{item.identity.summary}</LumenContentText>
                      <LumenContentText context="code.inline">{item.identity.operationId}</LumenContentText>
                      {stale && item.state === 'waiting' && (
                        <LumenContentText context="control.status" role="status">
                          {labels.staleConfirmation}
                        </LumenContentText>
                      )}
                    </LumenFrame>
                    {actionable && (
                      <LumenFrame className="hbar-node-console-confirmation-actions">
                        <LumenButton
                          tone="primary"
                          disabled={state.resolvingConfirmationId !== null}
                          loading={state.resolvingConfirmationId === item.id}
                          onClick={() => void model.resolveConfirmation(item.id, 'approve')}
                        >
                          {labels.approve}
                        </LumenButton>
                        <LumenButton
                          tone="danger"
                          disabled={state.resolvingConfirmationId !== null}
                          onClick={() => void model.resolveConfirmation(item.id, 'reject')}
                        >
                          {labels.reject}
                        </LumenButton>
                      </LumenFrame>
                    )}
                  </LumenCollectionItem>
                )
              })}
            </LumenCollection>
          ) : (
            <LumenContentText context="feedback.message">{labels.noConfirmations}</LumenContentText>
          )}
        </LumenFrame>
      )}
      {canObserve && tab === 'sessions' && (
        <LumenFrame as="section" className="hbar-node-console-observation" aria-labelledby={`${id}-sessions`}>
          <LumenFrame className="hbar-node-console-section">
            <LumenFrame className="hbar-node-console-section-heading">
              <LumenContentText context="section.subtitle" id={`${id}-sessions`}>
                {labels.conversations}
              </LumenContentText>
              <LumenButton
                disabled={state.loadingSessions || state.loadingMoreSessions}
                loading={state.loadingSessions}
                onClick={() => void model.loadSessions()}
              >
                {labels.refresh}
              </LumenButton>
            </LumenFrame>
            {state.observationError && (
              <LumenContentText context="feedback.message" role="alert">
                {labels.error(state.observationError)}
              </LumenContentText>
            )}
            {state.loadingSessions && state.sessions.length === 0 ? (
              <LumenContentText context="feedback.message" role="status">
                {labels.loading}
              </LumenContentText>
            ) : state.sessions.length ? (
              <LumenCollection className="hbar-node-console-list">
                {state.sessions.map((session) => (
                  <LumenCollectionItem as="li" className="hbar-node-console-session-row" key={session.id}>
                    <LumenButton
                      aria-pressed={state.selectedSessionId === session.id}
                      onClick={() => void model.selectSession(session.id)}
                    >
                      <LumenContentText context="record.title">{session.title}</LumenContentText>
                      <LumenContentText context="record.description">{session.rootId}</LumenContentText>
                    </LumenButton>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            ) : (
              <LumenContentText context="feedback.message">{labels.noSessions}</LumenContentText>
            )}
            {state.sessionCursor && (
              <LumenButton
                disabled={state.loadingMoreSessions}
                loading={state.loadingMoreSessions}
                onClick={() => void model.loadSessions(true)}
              >
                {labels.moreSessions}
              </LumenButton>
            )}
          </LumenFrame>
          <LumenFrame className="hbar-node-console-section">
            <LumenContentText context="section.subtitle">
              {state.snapshot?.session.title ?? labels.selectSession}
            </LumenContentText>
            {state.loadingSnapshot && (
              <LumenContentText context="feedback.message" role="status">
                {labels.loading}
              </LumenContentText>
            )}
            {!state.loadingSnapshot && state.selectedSessionId && !state.snapshot && (
              <LumenContentText context="feedback.message">{labels.snapshotUnavailable}</LumenContentText>
            )}
            {state.snapshot ? (
              <>
                {state.snapshot.hasOlder && <LumenContentText context="form.help">{labels.truncated}</LumenContentText>}
                {state.snapshot.messages.length ? (
                  <LumenCollection as="ol" className="hbar-node-console-messages">
                    {state.snapshot.messages.map((message) => (
                      <LumenCollectionItem as="li" key={message.id}>
                        <LumenFrame className="hbar-node-console-message-heading">
                          <LumenContentText context="record.title">{labels.messageRole(message.role)}</LumenContentText>
                          <LumenText as="time" dateTime={new Date(message.createdAt).toISOString()}>
                            {labels.messageTime(message.createdAt)}
                          </LumenText>
                        </LumenFrame>
                        {message.truncated && (
                          <LumenContentText context="form.help">{labels.truncated}</LumenContentText>
                        )}
                        <LumenFrame className="hbar-node-console-message-body">
                          {message.content.map((content, index) => (
                            <LumenContentText context="message.body" key={`${message.id}:${index}`}>
                              {content.type === 'text' || content.type === 'thinking'
                                ? content.text
                                : content.type === 'tool_call'
                                  ? labels.messageToolCall(content.name, JSON.stringify(content.args))
                                  : content.type === 'tool_result'
                                    ? content.text
                                    : content.artifact.id}
                            </LumenContentText>
                          ))}
                        </LumenFrame>
                      </LumenCollectionItem>
                    ))}
                  </LumenCollection>
                ) : (
                  <LumenContentText context="feedback.message">{labels.noMessages}</LumenContentText>
                )}
              </>
            ) : (
              !state.loadingSnapshot && (
                <LumenContentText context="feedback.message">{labels.selectSession}</LumenContentText>
              )
            )}
          </LumenFrame>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

function useStateTab(initial: Tab): [Tab, (tab: Tab) => void] {
  // Tab selection is presentation-only and does not duplicate a service entity.
  const [tab, setTab] = useState<Tab>(initial)
  return [tab, setTab]
}
