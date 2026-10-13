import { useId } from 'react'
import { Copy, Link2, RefreshCw, Shield, Trash2 } from 'lucide-react'
import { nodeInviteSchema } from '@hbar/contracts/node-registry'
import type { NodeListPage } from '@hbar/contracts/node-management'
import type { NodeCapabilities } from '@hbar/contracts/node'
import type { z } from 'zod'
import { LumenButton, LumenContentText, LumenFrame, LumenIcon, LumenInput } from '@lumen/app-ui'
import './node-management-settings.css'

type NodeInvite = z.infer<typeof nodeInviteSchema>

export interface NodeManagementSettingsLabels {
  readonly title: string
  readonly description: string
  readonly inviteName: string
  readonly inviteNamePlaceholder: string
  readonly invite: string
  readonly inviteBusy: string
  readonly refresh: string
  readonly cancel: string
  readonly loadMore: string
  readonly loading: string
  readonly empty: string
  readonly listError: (code: string) => string
  readonly inviteError: (code: string) => string
  readonly revokeError: (code: string) => string
  readonly retry: string
  readonly offline: string
  readonly online: string
  readonly lastSeen: (date: string) => string
  readonly formatDate: (timestamp: number) => string
  readonly revoked: string
  readonly revoke: string
  readonly revokeConfirm: (name: string) => string
  readonly unavailable: string
  readonly capabilitySummary: (capabilities: NodeCapabilities) => string
  readonly rootsSummary: (roots: NodeCapabilities['roots']) => string
  readonly inviteCreated: string
  readonly inviteExpires: (date: string) => string
  readonly inviteFingerprint: string
  readonly copyCode: string
  readonly copyFingerprint: string
  readonly copied: string
  readonly copyFailed: string
  readonly nodeCount: (count: number) => string
  readonly readOnly: string
  readonly accessUnknown: string
  readonly confirmRevoke: string
}

export interface NodeManagementSettingsProps {
  readonly labels: NodeManagementSettingsLabels
  readonly page: NodeListPage | null
  readonly loading: boolean
  readonly loadingMore: boolean
  readonly connected: boolean
  readonly accessKnown: boolean
  readonly readOnly: boolean
  readonly listError: string | null
  readonly inviteName: string
  readonly invite: NodeInvite | null
  readonly inviteBusy: boolean
  readonly inviteError: string | null
  readonly revokingNodeId: string | null
  readonly confirmingNodeId: string | null
  readonly revokeError: string | null
  readonly copied: 'code' | 'fingerprint' | null
  readonly copyError: boolean
  readonly onInviteNameChange: (value: string) => void
  readonly onInvite: () => void
  readonly onRefresh: () => void
  readonly onLoadMore: () => void
  readonly onCancelLoad: () => void
  readonly onRevoke: (nodeId: string) => void
  readonly onConfirmRevoke: () => void
  readonly onCancelRevoke: () => void
  readonly onCopy: (value: string, kind: 'code' | 'fingerprint') => void
}

export function NodeManagementSettings(props: NodeManagementSettingsProps) {
  const { labels, page } = props
  const invite = props.invite
  const inputId = useId()
  return (
    <LumenFrame as="section" className="hbar-node-management" aria-labelledby={`${inputId}-title`}>
      <LumenFrame className="hbar-node-management-heading">
        <LumenFrame>
          <LumenContentText context="section.title" id={`${inputId}-title`}>
            {labels.title}
          </LumenContentText>
          <LumenContentText context="form.description">{labels.description}</LumenContentText>
        </LumenFrame>
        <LumenFrame className="hbar-node-management-toolbar">
          {props.loading ? (
            <LumenButton disabled onClick={props.onCancelLoad}>
              {labels.loading}
            </LumenButton>
          ) : (
            <LumenButton disabled={!props.connected} onClick={props.onRefresh}>
              <LumenIcon icon={RefreshCw} tier="sm" />
              {labels.refresh}
            </LumenButton>
          )}
          {props.loading && <LumenButton onClick={props.onCancelLoad}>{labels.cancel}</LumenButton>}
        </LumenFrame>
      </LumenFrame>

      {props.readOnly && props.accessKnown && (
        <LumenContentText className="hbar-node-management-feedback" context="feedback.message" role="status">
          <LumenIcon icon={Shield} tier="sm" />
          {labels.readOnly}
        </LumenContentText>
      )}
      {!props.accessKnown && (
        <LumenContentText className="hbar-node-management-feedback" context="feedback.message" role="status">
          {labels.accessUnknown}
        </LumenContentText>
      )}
      <LumenFrame
        as="form"
        className="hbar-node-management-invite"
        onSubmit={(event) => {
          event.preventDefault()
          props.onInvite()
        }}
      >
        <label htmlFor={inputId}>{labels.inviteName}</label>
        <LumenInput
          id={inputId}
          value={props.inviteName}
          placeholder={labels.inviteNamePlaceholder}
          disabled={!props.connected || props.readOnly || props.inviteBusy}
          maxLength={160}
          onChange={(event) => props.onInviteNameChange(event.currentTarget.value)}
        />
        <LumenButton
          type="submit"
          tone="primary"
          disabled={!props.connected || props.readOnly || props.inviteBusy || !props.inviteName.trim()}
          loading={props.inviteBusy}
        >
          <LumenIcon icon={Link2} tier="sm" />
          {props.inviteBusy ? labels.inviteBusy : labels.invite}
        </LumenButton>
      </LumenFrame>
      {props.inviteError && (
        <LumenContentText className="hbar-node-management-feedback" context="feedback.message" role="alert">
          {labels.inviteError(props.inviteError)}
        </LumenContentText>
      )}
      {invite && (
        <LumenFrame className="hbar-node-management-invitation" role="status">
          <LumenContentText context="section.title">{labels.inviteCreated}</LumenContentText>
          <LumenFrame className="hbar-node-management-invite-value">
            <code>{invite.code}</code>
            <LumenButton disabled={props.readOnly} onClick={() => props.onCopy(invite.code, 'code')}>
              <LumenIcon icon={Copy} tier="sm" />
              {props.copied === 'code' ? labels.copied : labels.copyCode}
            </LumenButton>
          </LumenFrame>
          <LumenContentText context="form.help">
            {labels.inviteExpires(labels.formatDate(invite.expiresAt))}
          </LumenContentText>
          <LumenFrame className="hbar-node-management-invite-value">
            <code>{invite.fingerprint}</code>
            <LumenButton disabled={props.readOnly} onClick={() => props.onCopy(invite.fingerprint, 'fingerprint')}>
              <LumenIcon icon={Copy} tier="sm" />
              {props.copied === 'fingerprint' ? labels.copied : labels.copyFingerprint}
            </LumenButton>
          </LumenFrame>
          {props.copyError && (
            <LumenContentText context="feedback.message" role="alert">
              {labels.copyFailed}
            </LumenContentText>
          )}
        </LumenFrame>
      )}

      {props.listError && (
        <LumenFrame className="hbar-node-management-error">
          <LumenContentText context="feedback.message" role="alert">
            {labels.listError(props.listError)}
          </LumenContentText>
          <LumenButton disabled={!props.connected} onClick={props.onRefresh}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      {!props.listError && !props.page && props.loading && (
        <LumenContentText context="feedback.message" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {!props.listError && page && (
        <>
          <LumenContentText context="form.help">{labels.nodeCount(page.items.length)}</LumenContentText>
          {page.items.length === 0 ? (
            <LumenContentText context="feedback.message">{labels.empty}</LumenContentText>
          ) : (
            <ul className="hbar-node-management-list" aria-label={labels.title}>
              {page.items.map((node) => {
                const capabilities = node.capabilities
                const activeConfirm = props.confirmingNodeId === node.nodeId
                return (
                  <li className="hbar-node-management-row" key={node.nodeId}>
                    <LumenFrame className="hbar-node-management-row-main">
                      <LumenFrame className="hbar-node-management-row-heading">
                        <LumenContentText context="record.title">{node.name}</LumenContentText>
                        <LumenContentText context="form.help" tone={node.online ? 'success' : 'muted'}>
                          {node.revokedAt !== null ? labels.revoked : node.online ? labels.online : labels.offline}
                        </LumenContentText>
                      </LumenFrame>
                      <LumenContentText context="form.help">
                        {labels.lastSeen(
                          node.lastSeenAt === null ? labels.unavailable : labels.formatDate(node.lastSeenAt),
                        )}
                      </LumenContentText>
                      {capabilities ? (
                        <>
                          <LumenContentText context="form.help">
                            {labels.capabilitySummary(capabilities)}
                          </LumenContentText>
                          <LumenContentText context="form.help">
                            {labels.rootsSummary(capabilities.roots)}
                          </LumenContentText>
                        </>
                      ) : (
                        <LumenContentText context="form.help">{labels.unavailable}</LumenContentText>
                      )}
                    </LumenFrame>
                    <LumenFrame className="hbar-node-management-row-actions">
                      {activeConfirm ? (
                        <>
                          <LumenContentText context="feedback.message">
                            {labels.revokeConfirm(node.name)}
                          </LumenContentText>
                          <LumenButton
                            tone="danger"
                            disabled={props.readOnly || props.revokingNodeId === node.nodeId}
                            loading={props.revokingNodeId === node.nodeId}
                            onClick={props.onConfirmRevoke}
                          >
                            {labels.confirmRevoke}
                          </LumenButton>
                          <LumenButton disabled={props.revokingNodeId === node.nodeId} onClick={props.onCancelRevoke}>
                            {labels.cancel}
                          </LumenButton>
                        </>
                      ) : (
                        node.revokedAt === null && (
                          <LumenButton
                            tone="danger"
                            disabled={!props.connected || props.readOnly || props.revokingNodeId !== null}
                            onClick={() => props.onRevoke(node.nodeId)}
                          >
                            <LumenIcon icon={Trash2} tier="sm" />
                            {labels.revoke}
                          </LumenButton>
                        )
                      )}
                      {props.revokeError && props.confirmingNodeId === node.nodeId && (
                        <LumenContentText context="feedback.message" role="alert">
                          {labels.revokeError(props.revokeError)}
                        </LumenContentText>
                      )}
                    </LumenFrame>
                  </li>
                )
              })}
            </ul>
          )}
          {page.nextCursor && (
            <LumenButton
              disabled={!props.connected || props.loadingMore}
              loading={props.loadingMore}
              onClick={props.onLoadMore}
            >
              {labels.loadMore}
            </LumenButton>
          )}
        </>
      )}
    </LumenFrame>
  )
}
