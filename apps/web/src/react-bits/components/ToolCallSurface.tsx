import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import type { ContentBlock } from '@hbar/contracts'
import SpotlightCard from '../SpotlightCard'
import { referenceAttributes } from '../production'

export interface ToolCallSurfaceLabels {
  readonly arguments: string
  readonly callArguments: string
}

export interface ToolCallSurfaceProps {
  readonly block: Extract<ContentBlock, { type: 'tool_call' }>
  readonly labels: ToolCallSurfaceLabels
}

/**
 * ReactBits Tool Calls surface. This is the disclosure row from the Tool
 * Calls reference, kept independent from Client/Zustand so a host can supply
 * any live call block.
 *
 * Reference: https://pro.reactbits.dev/docs/app-ui/tool-calls
 */
export default function ToolCallSurface({ block, labels }: ToolCallSurfaceProps) {
  const [open, setOpen] = useState(false)
  const argumentSummary = String(block.args.path ?? block.args.command ?? '').slice(0, 160)
  return (
    <SpotlightCard
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/tool-calls', 'session-chat')}
      className="tool-call rb-tool-call-surface"
      spotlightColor="color-mix(in srgb, var(--rb-status) 22%, transparent)"
    >
      <button
        type="button"
        className="tool-call-summary"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={13} />
        <span>{block.name}</span>
        <code>{argumentSummary || labels.callArguments}</code>
      </button>
      {open && (
        <div className="tool-call-content" data-state="open">
          <span>{labels.arguments}</span>
          <pre>{JSON.stringify(block.args, null, 2)}</pre>
        </div>
      )}
    </SpotlightCard>
  )
}
