import { ShieldCheck, Check, LoaderCircle, X } from 'lucide-react'
import type { Approval } from '@hbar/contracts'
import GlassSurface from '../GlassSurface'
import GlareButton from '../GlareButton'
import { referenceAttributes } from '../production'

export interface ChatApprovalSurfaceLabels {
  readonly approveTool: string
  readonly viewRequest: string
  readonly deny: string
  readonly approve: string
  readonly allowRemember: string
}

export interface ChatApprovalSurfaceProps {
  readonly approval: Approval
  readonly labels: ChatApprovalSurfaceLabels
  readonly impact: string
  readonly summary: string
  readonly resolving: boolean
  onResolve(decision: 'allowed' | 'denied', remember?: boolean): void | Promise<void>
}

/**
 * ReactBits agent-approval surface. It exposes the risk/impact summary and
 * request details while delegating the actual approval RPC to the host.
 *
 * Reference: https://pro.reactbits.dev/docs/app-ui/agent-approval
 */
export default function ChatApprovalSurface({
  approval,
  labels,
  impact,
  summary,
  resolving,
  onResolve,
}: ChatApprovalSurfaceProps) {
  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-5', 'approval')}
      className="approval rb-decision-surface rb-approval-surface"
      aria-busy={resolving}
      data-approval-id={approval.id}
    >
      <GlassSurface className="decision-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="approval-heading">
        <ShieldCheck size={16} />
        <strong>{labels.approveTool}</strong>
        <code>{approval.tool}</code>
      </div>
      <div className="approval-target">
        <p className="approval-impact">{impact}</p>
        <strong>{summary}</strong>
        <details>
          <summary>{labels.viewRequest}</summary>
          <pre>{JSON.stringify(approval.args, null, 2)}</pre>
        </details>
      </div>
      <div className="approval-actions">
        <button className="button" disabled={resolving} onClick={() => void onResolve('denied')}>
          {resolving ? <LoaderCircle size={14} className="spinning" /> : <X size={14} />}
          {labels.deny}
        </button>
        <GlareButton
          className="button primary"
          disabled={resolving}
          onClick={() => void onResolve('allowed')}
          glareColor="color-mix(in srgb, var(--hbar-ok) 62%, transparent)"
        >
          {resolving ? <LoaderCircle size={14} className="spinning" /> : <Check size={14} />}
          {labels.approve}
        </GlareButton>
        <button className="button approval-remember" disabled={resolving} onClick={() => void onResolve('allowed', true)}>
          {resolving ? <LoaderCircle size={14} className="spinning" /> : <ShieldCheck size={14} />}
          {labels.allowRemember}
        </button>
      </div>
    </section>
  )
}
