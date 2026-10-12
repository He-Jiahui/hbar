import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { createMessageScope } from './messages'
import { useHbarRuntime } from './runtime'
import './agent-tool-open.css'

export interface HbarAgentToolOpenLabels {
  readonly open: string
  readonly openNamed: (objective: string) => string
  readonly opening: string
  readonly error: (code: string) => string
}

const { Provider: AgentToolOpenMessagesProvider, useMessages: useAgentToolOpenMessages } =
  createMessageScope<HbarAgentToolOpenLabels>()

/** One content-grown action alongside its tool disclosure; no child/status mirror is retained here. */
function AgentToolOpenView({
  parentSessionId,
  messageId,
  callId,
  childSessionId,
  objective,
  sourceTabInstanceKey,
  connected,
}: {
  readonly parentSessionId: string
  readonly messageId: string
  readonly callId: string
  readonly childSessionId: string
  readonly objective: string
  readonly sourceTabInstanceKey: string
  readonly connected: boolean
}) {
  const { t } = useAgentToolOpenMessages()
  const labels: HbarAgentToolOpenLabels = {
    open: t('open'),
    openNamed: t('openNamed'),
    opening: t('opening'),
    error: t('error'),
  }
  const runtime = useHbarRuntime()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      // Our own successful navigation unmounts this source action before the
      // Runtime finishes attaching Back provenance. Cancel reads when leaving
      // elsewhere, but let that already-selected child handoff settle.
      if (runtime.state.navigation.getSnapshot().sessionId !== childSessionId) request.current?.abort()
      request.current = null
    },
    [runtime, parentSessionId, messageId, callId, childSessionId, sourceTabInstanceKey],
  )
  const open = () => {
    if (!connected || request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(null)
    void runtime.commands
      .execute(
        'agentChild.openFromTool',
        { parentSessionId, messageId, callId, sourceTabInstanceKey },
        { signal: controller.signal },
      )
      .catch((reason: unknown) => {
        if (request.current !== controller || controller.signal.aborted) return
        const code = reason && typeof reason === 'object' && 'code' in reason ? reason.code : undefined
        setError(typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'EXECUTION_FAILED')
      })
      .finally(() => {
        if (request.current !== controller) return
        request.current = null
        setBusy(false)
      })
  }
  return (
    <LumenFrame className="hbar-agent-tool-open">
      <LumenButton
        type="button"
        variant="text"
        indicator="none"
        size="s"
        disabled={!connected || busy}
        aria-label={labels.openNamed(objective)}
        onClick={open}
      >
        <LumenIcon icon={ArrowUpRight} tier="sm" />
        {busy ? labels.opening : labels.open}
      </LumenButton>
      {error && (
        <LumenContentText context="message.inline" role="alert">
          {labels.error(error)}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}

/** The legacy labels prop remains the host adapter for existing SDK callers. */
export function HbarAgentToolOpen({
  labels,
  ...identity
}: {
  readonly parentSessionId: string
  readonly messageId: string
  readonly callId: string
  readonly childSessionId: string
  readonly objective: string
  readonly sourceTabInstanceKey: string
  readonly connected: boolean
  readonly labels: HbarAgentToolOpenLabels
}) {
  return (
    <AgentToolOpenMessagesProvider messages={labels}>
      <AgentToolOpenView {...identity} />
    </AgentToolOpenMessagesProvider>
  )
}
