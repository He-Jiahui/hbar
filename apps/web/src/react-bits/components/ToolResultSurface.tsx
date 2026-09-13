import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Wrench, X } from 'lucide-react'
import type { ContentBlock } from '@hbar/contracts'
import SpotlightCard from '../SpotlightCard'
import { referenceAttributes } from '../production'

export interface ToolResultSurfaceLabels {
  readonly before: string
  readonly after: string
}

export interface ToolResultSurfaceProps {
  readonly block: Extract<ContentBlock, { type: 'tool_result' }>
  readonly labels: ToolResultSurfaceLabels
  renderCode?: ((value: string) => ReactNode) | undefined
}

function resultDetails(block: Extract<ContentBlock, { type: 'tool_result' }>) {
  const details = block.details
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined
  const record = details as Record<string, unknown>
  return {
    before: typeof record.before === 'string' ? record.before : undefined,
    after: typeof record.after === 'string' ? record.after : undefined,
    path: typeof record.path === 'string' ? record.path : undefined,
  }
}

/**
 * ReactBits Tool Result surface. It preserves the reference's compact
 * success/error row, expandable payload, and before/after patch tabs while
 * accepting a host-provided code renderer.
 *
 * References:
 * - https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2
 * - https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-3
 * - https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-5
 */
export default function ToolResultSurface({ block, labels, renderCode }: ToolResultSurfaceProps) {
  const [open, setOpen] = useState(false)
  const [diff, setDiff] = useState<'after' | 'before'>('after')
  const details = resultDetails(block)
  const code = details?.[diff]
  return (
    <SpotlightCard
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2', 'session-chat')}
      className={`tool-result rb-tool-result-surface ${block.isError ? 'tool-failed' : ''}`}
      spotlightColor={
        block.isError
          ? 'color-mix(in srgb, var(--hbar-er) 24%, transparent)'
          : 'color-mix(in srgb, var(--rb-accent) 22%, transparent)'
      }
    >
      <button type="button" className="tool-summary" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={13} />
        <span>{block.name}</span>
        <span className="tool-path">{details?.path ?? block.text.split('\n')[0]?.slice(0, 90)}</span>
        {block.isError ? <X size={13} className="danger" /> : <Check size={13} className="success" />}
      </button>
      {open && (
        <div className="tool-content" data-state="open">
          {details?.after !== undefined ? (
            <>
              <div className="segmented" role="tablist">
                <button type="button" role="tab" aria-selected={diff === 'before'} className={diff === 'before' ? 'selected' : ''} onClick={() => setDiff('before')}>
                  {labels.before}
                </button>
                <button type="button" role="tab" aria-selected={diff === 'after'} className={diff === 'after' ? 'selected' : ''} onClick={() => setDiff('after')}>
                  {labels.after}
                </button>
                <span>{details.path}</span>
              </div>
              {renderCode ? renderCode(code ?? '') : <pre>{code ?? ''}</pre>}
            </>
          ) : (
            <pre>{block.text}</pre>
          )}
        </div>
      )}
    </SpotlightCard>
  )
}
