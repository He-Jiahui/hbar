import { useEffect, useRef, useState } from 'react'
import { LumenAiChat01, LumenConversation, LumenFrame, LumenPageHeader, LumenText } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarPromptComposer } from './prompt-composer'
import { HbarComposerAttachmentTransfers } from './composer-attachments'
import { HbarComposerWorkspaceContexts } from './composer-workspace-contexts'
import { HbarDraftImageAttachments } from './session-images'
import type { HbarSessionWorkspaceProps } from './lumen-session-workspace'

/** A confirmed deleted target owns no Host history or execution controls; its authored draft remains editable. */
export function HbarDeletedSessionWorkspace({
  sessionId,
  ...props
}: HbarSessionWorkspaceProps & { readonly sessionId: string }) {
  const runtime = useHbarRuntime()
  const drafts = useHbarRuntimeState(runtime.state.drafts)
  const draft = drafts[sessionId]
  const contexts = draft?.workspaceContexts ?? []
  const locked = draft?.status === 'submitting' || draft?.status === 'unknown'
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const invoke = (operation: Promise<unknown>) => {
    setError(null)
    void operation.catch((reason: unknown) => {
      if (alive.current)
        setError(
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
        )
    })
  }
  const removeAttachment = (id: string, kind: 'image' | 'file') =>
    invoke(
      runtime.commands.execute('draft.removeAttachment', {
        sessionId,
        artifactId: id,
        kind,
        expectedRevision: draft?.revision ?? 0,
      }),
    )
  const composer = (
    <LumenFrame className="hbar-app-react-session-footer" data-hbar-composer-session={sessionId}>
      <HbarPromptComposer
        boundary="none"
        value={draft?.text ?? ''}
        labels={props.labels.prompt}
        attachments={(draft?.attachments ?? []).map((attachment) => ({
          id: attachment.artifact.id,
          kind: attachment.kind,
          name: attachment.artifact.name,
        }))}
        attachmentContent={
          draft && (props.images || contexts.length > 0) ? (
            <>
              <HbarComposerWorkspaceContexts
                contexts={contexts}
                attachments={props.images ? [] : draft.attachments}
                labels={props.labels.workspaceContexts}
                removeAttachmentLabel={(attachment) =>
                  props.labels.prompt.removeAttachment({
                    id: attachment.artifact.id,
                    kind: attachment.kind,
                    name: attachment.artifact.name,
                  })
                }
                removeDisabled={locked}
                onRemove={(contextId) =>
                  invoke(
                    runtime.commands.execute('draft.removeWorkspaceContext', {
                      sessionId,
                      contextId,
                      expectedRevision: draft.revision,
                    }),
                  )
                }
                onRemoveAttachment={(attachment) => removeAttachment(attachment.artifact.id, attachment.kind)}
              />
              {props.images && draft.attachments.length > 0 && (
                <HbarDraftImageAttachments
                  draft={draft}
                  removeLabel={props.labels.prompt.removeAttachment}
                  removeDisabled={locked}
                  onRemove={removeAttachment}
                />
              )}
            </>
          ) : undefined
        }
        context={
          <HbarComposerAttachmentTransfers
            transfers={draft?.attachmentTransfers ?? []}
            labels={props.labels.attachments}
            connected={props.connected}
            onRemove={(item) =>
              invoke(
                runtime.commands.execute('draft.removeAttachmentTransfer', {
                  sessionId,
                  reservationId: item.id,
                  ownerRevision: item.ownerRevision,
                }),
              )
            }
            onReconcile={(item) =>
              invoke(
                runtime.commands.execute('draft.reconcileAttachment', {
                  sessionId,
                  reservationId: item.id,
                  ownerRevision: item.ownerRevision,
                }),
              )
            }
            onAccept={(item) =>
              invoke(
                runtime.commands.execute('draft.acceptReadyAttachment', {
                  sessionId,
                  reservationId: item.id,
                  ownerRevision: item.ownerRevision,
                  expectedRevision: draft?.revision ?? 0,
                }),
              )
            }
          />
        }
        submitting={false}
        uploading={false}
        canSubmit={false}
        canStop={false}
        canAddAttachments={false}
        error={error ? props.labels.error(error) : undefined}
        onChange={(text) => invoke(runtime.commands.execute('draft.setText', { sessionId, text }))}
        onRemoveAttachment={removeAttachment}
        onSubmit={() => {}}
        onStop={() => {}}
      />
    </LumenFrame>
  )
  return (
    <LumenFrame className="hbar-app-react-session-workspace" data-session-deleted={sessionId}>
      <LumenPageHeader title={props.sessionTitle} context={props.workspaceName} />
      <LumenFrame className="hbar-app-react-session-main">
        <LumenAiChat01
          className="hbar-session-ai-chat"
          controlled={{
            body: (
              <LumenConversation
                title={props.labels.conversationTitle(props.sessionTitle)}
                messages={[]}
                empty={
                  <LumenFrame className="hbar-app-react-session-empty">
                    <LumenText as="p" role="status">
                      {props.labels.error('SESSION_DELETED')}
                    </LumenText>
                  </LumenFrame>
                }
                composer={composer}
              />
            ),
          }}
        />
      </LumenFrame>
    </LumenFrame>
  )
}
