import { useState, type ReactNode } from 'react'
import { FileText, Image, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { SessionDraftState } from '@hbar/app-runtime'
import { composerFiles } from './composer-attachment-input'
import './composer-attachments.css'

type Transfer = SessionDraftState['attachmentTransfers'][number]

export interface HbarComposerAttachmentLabels {
  readonly label: string
  readonly drop: string
  readonly status: (status: Transfer['status']) => string
  readonly remove: (name: string) => string
  readonly reconcile: (name: string) => string
  readonly check: string
  readonly accept: string
  readonly acceptNamed: (name: string) => string
  readonly error: (code: string) => string
}

export function HbarComposerAttachmentDropTarget({
  enabled,
  label,
  children,
  onAdd,
}: {
  readonly enabled: boolean
  readonly label: string
  readonly children: ReactNode
  readonly onAdd: (files: readonly File[]) => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <LumenFrame
      className="hbar-composer-attachment-target"
      data-dragging={enabled && dragging ? true : undefined}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(enabled)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = enabled ? 'copy' : 'none'
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        setDragging(false)
      }}
      onDrop={(event) => {
        const files = composerFiles(event.dataTransfer)
        if (files.length === 0) return
        event.preventDefault()
        setDragging(false)
        if (enabled) onAdd(files)
      }}
      onPaste={(event) => {
        const files = composerFiles(event.clipboardData)
        if (files.length === 0) return
        event.preventDefault()
        if (enabled) onAdd(files)
      }}
    >
      {children}
      {enabled && dragging && (
        <LumenFrame className="hbar-composer-attachment-drop-overlay" role="status">
          <LumenText>{label}</LumenText>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

/** At most twelve transfers; the queue owns scrolling so errors cannot displace the prompt controls. */
export function HbarComposerAttachmentTransfers({
  transfers,
  labels,
  connected,
  onRemove,
  onReconcile,
  onAccept,
}: {
  readonly transfers: readonly Transfer[]
  readonly labels: HbarComposerAttachmentLabels
  readonly connected: boolean
  readonly onRemove: (transfer: Transfer) => void
  readonly onReconcile: (transfer: Transfer) => void
  readonly onAccept: (transfer: Transfer) => void
}) {
  if (transfers.length === 0) return null
  return (
    <LumenFrame className="hbar-composer-attachment-transfers" role="list" aria-label={labels.label}>
      {transfers.map((transfer) => {
        const busy =
          transfer.status === 'preparing' || transfer.status === 'uploading' || transfer.status === 'reconciling'
        const removable = transfer.status === 'preparing' || transfer.status === 'failed' || transfer.status === 'ready'
        return (
          <LumenFrame
            key={transfer.id}
            role="listitem"
            className="hbar-composer-attachment-transfer"
            data-status={transfer.status}
          >
            <LumenIcon icon={busy ? LoaderCircle : transfer.kind === 'image' ? Image : FileText} tier="sm" />
            <LumenFrame className="hbar-composer-attachment-transfer-copy">
              <LumenText as="span" className="hbar-composer-attachment-name" title={transfer.name}>
                {transfer.name}
              </LumenText>
              <LumenText as="span" className="hbar-composer-attachment-status" role="status">
                {labels.status(transfer.status)}
              </LumenText>
              {transfer.error && (
                <LumenText as="span" className="hbar-composer-attachment-error">
                  {labels.error(transfer.error)}
                </LumenText>
              )}
            </LumenFrame>
            <LumenFrame className="hbar-composer-attachment-actions">
              {transfer.status === 'unknown' && (
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  indicator="none"
                  disabled={!connected}
                  aria-label={labels.reconcile(transfer.name)}
                  title={labels.reconcile(transfer.name)}
                  onClick={() => onReconcile(transfer)}
                >
                  <LumenIcon icon={RefreshCw} tier="sm" />
                  {labels.check}
                </LumenButton>
              )}
              {transfer.status === 'ready' && (
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  indicator="none"
                  aria-label={labels.acceptNamed(transfer.name)}
                  onClick={() => onAccept(transfer)}
                >
                  {labels.accept}
                </LumenButton>
              )}
              {removable && (
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  indicator="none"
                  aria-label={labels.remove(transfer.name)}
                  title={labels.remove(transfer.name)}
                  onClick={() => onRemove(transfer)}
                >
                  <LumenIcon icon={X} tier="sm" />
                </LumenButton>
              )}
            </LumenFrame>
          </LumenFrame>
        )
      })}
    </LumenFrame>
  )
}
