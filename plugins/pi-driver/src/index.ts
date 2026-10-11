import { runAgentLoop } from '@earendil-works/pi-agent-core'
import type { AgentEvent, AgentTool, StreamFn } from '@earendil-works/pi-agent-core'
import { normalizeContext, Type } from '@earendil-works/pi-ai'
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import type {
  Api,
  AssistantMessage,
  Context as PiContext,
  Message as PiMessage,
  Model,
  SimpleStreamOptions,
  ProviderResponse,
  ThinkingLevelMap,
  Usage as PiUsage,
} from '@earendil-works/pi-ai'
import { streamSimple as openaiCompletions } from '@earendil-works/pi-ai/api/openai-completions'
import { streamSimple as openaiResponses } from '@earendil-works/pi-ai/api/openai-responses'
import { streamSimple as anthropicMessages } from '@earendil-works/pi-ai/api/anthropic-messages'
import { z } from 'zod'
import { HbarError, RUN_STEP_LIMIT_CODE } from '@hbar/contracts'
import { providerFailure } from './provider-failure'
import { definePlugin, describeToolTimeout, provide, RunControlSignal } from '@hbar/plugin-sdk'
import { createUsageFact } from '@hbar/usage'
import { DEFAULT_THINKING_LEVELS, normalizeThinkingLevel } from '@hbar/contracts'
import type {
  DriverInput,
  HarnessDriver,
  ModelDiagnosticEvent,
  ModelRequest,
  ToolResultContent,
} from '@hbar/plugin-sdk'
import type { ContentBlock, Message, ProviderConfig, ThinkingLevel, Usage } from '@hbar/contracts'
import { appendProviderContext, splitModelContext } from './model-context'
import { createDriverSteeringReader } from './steering'
import {
  withProviderResponseDiagnostics,
  type TransportFailureCode,
  type TransportFailureKind,
  type TransportFailureObserver,
} from './provider-http-diagnostics'
import { ProviderStreamObservation } from './provider-stream-diagnostics'

const piUsage = (): PiUsage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
})
const normalizeUsage = (usage: PiUsage): Usage => ({
  // Pi separates uncached, cache-read and cache-write buckets. Hbar's input is
  // inclusive; its budget layer subtracts cache reads exactly once.
  input: usage.input + usage.cacheRead + usage.cacheWrite,
  output: usage.output,
  cacheRead: usage.cacheRead,
  cacheWrite: usage.cacheWrite,
  cost: usage.cost.total,
})
function modelOf(config: ProviderConfig): Model<Api> {
  // Custom OpenAI providers are not in Pi's model catalogue. Without the Host
  // capability map Pi silently clamps xhigh/max to high and assumes off is valid.
  const thinkingLevelMap: ThinkingLevelMap = {}
  for (const level of DEFAULT_THINKING_LEVELS)
    thinkingLevelMap[level] = config.thinkingLevels.includes(level) ? (level === 'off' ? 'none' : level) : null
  return {
    id: config.model,
    name: config.name,
    provider: config.id,
    api: config.protocol === 'mock' ? 'openai-completions' : config.protocol,
    baseUrl: config.baseUrl,
    reasoning: config.reasoning,
    ...(config.protocol === 'openai-responses' || config.protocol === 'openai-completions' ? { thinkingLevelMap } : {}),
    input: config.imageInput ? ['text', 'image'] : ['text'],
    cost: {
      input: config.inputPrice,
      output: config.outputPrice,
      cacheRead: config.cacheReadPrice ?? 0,
      cacheWrite: config.cacheWritePrice ?? 0,
    },
    contextWindow: config.contextWindow,
    maxTokens: config.maxOutput,
  }
}
function failedStream(model: Model<Api>, error: unknown, aborted = false) {
  const stream = new AssistantMessageEventStream()
  const message: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: piUsage(),
    stopReason: aborted ? 'aborted' : 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  }
  stream.push({ type: 'error', reason: aborted ? 'aborted' : 'error', error: message })
  return stream
}
export const DEMO_RESPONSE = `# hbar workbench

The session is connected to the **local fixture model**.

| Layer | Responsibility |
| --- | --- |
| Session | Durable history and run state |
| Cordis | Services and reversible plugins |
| Workbench | Shared desktop and web views |

\`\`\`mermaid
flowchart LR
  Client --> Host
  Host --> Session
  Session --> Tools
\`\`\`

\`\`\`chart
{"type":"bar","xKey":"name","series":[{"key":"value","color":"#62b594"}],"data":[{"name":"Session","value":8},{"name":"Tools","value":5},{"name":"Plugins","value":7}]}
\`\`\`

\`\`\`flow
{"nodes":[{"id":"1","position":{"x":0,"y":50},"data":{"label":"Session"}},{"id":"2","position":{"x":220,"y":50},"data":{"label":"Tool registry"}}],"edges":[{"id":"1-2","source":"1","target":"2"}]}
\`\`\`

\`\`\`typescript
const session = await client.call('session.create', { workspaceId });
\`\`\`
`

// The fixture implements the same Pi stream protocol as the network adapters.
export function fixtureStream(
  model: Model<Api>,
  context: PiContext,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream()
  const message: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: piUsage(),
    stopReason: 'stop',
    timestamp: Date.now(),
  }
  void (async () => {
    try {
      const last = context.messages.at(-1)
      const text =
        last?.role === 'user'
          ? typeof last.content === 'string'
            ? last.content
            : last.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n')
          : ''
      if (text.startsWith('/fail')) throw new Error('Fixture provider failure')
      stream.push({ type: 'start', partial: message })
      const tool = /^\/tool\s+([a-z_]+)\s+([\s\S]+)$/.exec(text)
      if (tool) {
        const call = {
          type: 'toolCall' as const,
          id: crypto.randomUUID(),
          name: tool[1]!,
          arguments: z.record(z.string(), z.json()).parse(JSON.parse(tool[2]!)),
        }
        message.content.push(call)
        message.stopReason = 'toolUse'
        stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message })
        stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: call, partial: message })
      } else {
        const output =
          last?.role === 'toolResult'
            ? `### ${last.isError ? 'Tool failed' : 'Tool completed'}\n\n${last.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n')}`
            : text.startsWith('/demo')
              ? DEMO_RESPONSE
              : text.startsWith('/slow')
                ? 'Streaming a cancellable response. '.repeat(180)
                : context.systemPrompt?.includes('Summarize the conversation')
                  ? 'Summary: preserve the user objective, completed actions, tool outcomes, unresolved work, and referenced files.'
                  : `Received: ${text || 'image attachment'}\n\nThis response was produced by the local fixture model.`
        const block = { type: 'text' as const, text: '' }
        message.content.push(block)
        stream.push({ type: 'text_start', contentIndex: 0, partial: message })
        for (let i = 0; i < output.length; i += 28) {
          options?.signal?.throwIfAborted()
          const delta = output.slice(i, i + 28)
          block.text += delta
          stream.push({ type: 'text_delta', contentIndex: 0, delta, partial: message })
          await Bun.sleep(text.startsWith('/slow') ? 25 : 2)
        }
        stream.push({ type: 'text_end', contentIndex: 0, content: block.text, partial: message })
      }
      message.usage.input = Math.ceil(JSON.stringify(context.messages).length / 4)
      message.usage.output = Math.ceil(JSON.stringify(message.content).length / 4)
      message.usage.totalTokens = message.usage.input + message.usage.output
      stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'toolUse', message })
    } catch (error) {
      message.stopReason = options?.signal?.aborted ? 'aborted' : 'error'
      message.errorMessage = error instanceof Error ? error.message : String(error)
      stream.push({ type: 'error', reason: message.stopReason, error: message })
    }
  })()
  return stream
}

function streamProvider(
  config: ProviderConfig,
  context: PiContext,
  apiKey: string | null,
  signal: AbortSignal,
  thinking: ThinkingLevel | undefined = undefined,
  runtimeContext = '',
  sessionId?: string,
  onResponse?: (response: ProviderResponse) => void,
  onTransportFailure?: TransportFailureObserver,
  onStreamEvent?: (event: unknown) => void,
  onProviderError?: (errorCode?: unknown) => void,
  onBodyEof?: () => void,
): AssistantMessageEventStream {
  const model = modelOf(config)
  const reasoning = normalizeThinkingLevel(config, thinking)
  const options: SimpleStreamOptions = {
    apiKey: apiKey ?? 'hbar-keyless-local-provider',
    signal,
    maxTokens: config.maxOutput,
    maxRetries: 0,
    ...(onResponse && (config.protocol === 'openai-responses' || config.protocol === 'openai-completions')
      ? {
          fetch: withProviderResponseDiagnostics(
            globalThis.fetch,
            onResponse,
            onTransportFailure,
            onProviderError,
            onBodyEof,
          ),
        }
      : {}),
    ...(onStreamEvent && (config.protocol === 'openai-responses' || config.protocol === 'openai-completions')
      ? {
          onProviderStreamEvent: (event: unknown) => {
            try {
              onStreamEvent(event)
            } catch {
              // Observation must not alter provider semantics.
            }
          },
        }
      : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(config.protocol === 'openai-responses' || config.protocol === 'openai-completions'
      ? { samplingParams: { parallel_tool_calls: true } }
      : {}),
    ...(reasoning !== 'off' ? { reasoning } : {}),
    ...(runtimeContext && (config.protocol === 'openai-responses' || config.protocol === 'openai-completions')
      ? {
          onPayload: (payload: unknown) =>
            appendProviderContext(
              payload,
              runtimeContext,
              config.protocol === 'openai-responses' ? 'openai-responses' : 'openai-completions',
            ),
        }
      : {}),
  }
  try {
    const transcript = normalizeContext(context)
    switch (config.protocol) {
      case 'mock':
        return fixtureStream(model, context, options)
      case 'openai-completions':
        return openaiCompletions(model as Model<'openai-completions'>, transcript, options)
      case 'openai-responses':
        return openaiResponses(model as Model<'openai-responses'>, transcript, options)
      case 'anthropic-messages':
        return anthropicMessages(model as Model<'anthropic-messages'>, transcript, options)
    }
  } catch (error) {
    return failedStream(model, error, signal.aborted)
  }
}

function emitModelDiagnostic(
  callback: ((event: ModelDiagnosticEvent) => void) | undefined,
  event: ModelDiagnosticEvent,
): void {
  try {
    callback?.(event)
  } catch {
    // Diagnostics are observational and must not alter provider/error semantics.
  }
}

function responseDiagnostic(
  callback: ((event: ModelDiagnosticEvent) => void) | undefined,
  request: ModelRequest,
  response: ProviderResponse,
  modelRequestId: string,
  purpose: 'model' | 'compaction',
): void {
  const id = response.headers['x-request-id']
  const upstreamRequestIdSha256 =
    id && id.length <= 256 ? new Bun.CryptoHasher('sha256').update(id).digest('hex') : undefined
  emitModelDiagnostic(callback, {
    phase: 'response',
    purpose,
    providerId: diagnosticProviderId(request.model.id),
    modelSelectionId: request.model.id,
    modelRequestId,
    model: request.model.model,
    protocol: request.model.protocol,
    httpStatus: response.status,
    upstreamRequestIdSha256,
  })
}
function diagnosticStopReason(reason: AssistantMessage['stopReason']): ModelDiagnosticEvent['stopReason'] {
  return reason === 'stop' || reason === 'toolUse' || reason === 'length' || reason === 'aborted' || reason === 'error'
    ? reason
    : undefined
}
function transportFailureDiagnostic(
  callback: ((event: ModelDiagnosticEvent) => void) | undefined,
  request: ModelRequest,
  modelRequestId: string,
  kind: TransportFailureKind,
  code: TransportFailureCode | undefined,
  purpose: 'model' | 'compaction',
  failurePhase: 'fetch' | 'stream' = 'fetch',
): void {
  emitModelDiagnostic(callback, {
    phase: 'transport_failure',
    purpose,
    providerId: diagnosticProviderId(request.model.id),
    modelSelectionId: request.model.id,
    modelRequestId,
    model: request.model.model,
    protocol: request.model.protocol,
    transportKind: kind,
    transportCode: code,
    failureKind: 'transport',
    failurePhase,
  })
}
function terminalProviderFacts(
  response: ProviderResponse | undefined,
  transportKind: TransportFailureKind | undefined,
  transportCode: TransportFailureCode | undefined,
  failed: boolean,
  transportPhase: 'fetch' | 'stream' | undefined = undefined,
  stream?: ProviderStreamObservation,
  stopReason?: ModelDiagnosticEvent['stopReason'],
): Pick<
  ModelDiagnosticEvent,
  | 'failureKind'
  | 'failurePhase'
  | 'errorCode'
  | 'httpStatus'
  | 'upstreamRequestIdSha256'
  | 'transportKind'
  | 'transportCode'
  | 'streamSubtype'
  | 'streamEventCount'
  | 'streamTextChars'
  | 'streamThinkingChars'
  | 'streamFirstEventMs'
  | 'streamLastEventMs'
  | 'streamErrorClass'
> {
  const responseStatus = response?.status
  const requestId = response?.headers['x-request-id']
  const upstreamRequestIdSha256 =
    requestId && requestId.length <= 256 ? new Bun.CryptoHasher('sha256').update(requestId).digest('hex') : undefined
  const responseFacts = {
    ...(responseStatus === undefined ? {} : { httpStatus: responseStatus }),
    ...(upstreamRequestIdSha256 === undefined ? {} : { upstreamRequestIdSha256 }),
    ...(transportKind === undefined ? {} : { transportKind }),
    ...(transportCode === undefined ? {} : { transportCode }),
  }
  const streamFallback =
    stopReason === 'aborted'
      ? 'aborted'
      : stopReason === 'length'
        ? 'incomplete'
        : stopReason === 'stop' || stopReason === 'toolUse'
          ? 'completed'
          : 'unknown'
  if (!failed)
    return {
      ...responseFacts,
      ...(transportKind && responseStatus !== undefined
        ? {
            failureKind: 'transport' as const,
            failurePhase: 'stream' as const,
            errorCode:
              transportKind === 'timeout'
                ? 'PROVIDER_REQUEST_TIMEOUT'
                : transportKind === 'abort'
                  ? 'PROVIDER_ABORTED'
                  : transportKind === 'connection'
                    ? 'PROVIDER_CONNECTION_FAILED'
                    : 'PROVIDER_TRANSPORT_FAILED',
          }
        : {}),
      ...stream?.facts(streamFallback),
    }
  if (transportKind)
    return {
      ...responseFacts,
      failureKind: 'transport',
      failurePhase: transportPhase ?? 'fetch',
      errorCode:
        transportKind === 'timeout'
          ? 'PROVIDER_REQUEST_TIMEOUT'
          : transportKind === 'abort'
            ? 'PROVIDER_ABORTED'
            : transportKind === 'connection'
              ? 'PROVIDER_CONNECTION_FAILED'
              : 'PROVIDER_TRANSPORT_FAILED',
      ...stream?.facts(streamFallback === 'aborted' ? 'aborted' : 'transport_error'),
    }
  if (responseStatus !== undefined && responseStatus >= 400)
    return { ...responseFacts, failureKind: 'http', failurePhase: 'response', errorCode: 'PROVIDER_HTTP_ERROR' }
  if (responseStatus !== undefined)
    return {
      ...responseFacts,
      failureKind: 'stream',
      failurePhase: 'stream',
      errorCode: 'PROVIDER_STREAM_INTERRUPTED',
      ...stream?.facts(streamFallback),
    }
  return { ...responseFacts, failureKind: 'unknown', failurePhase: 'terminal', errorCode: 'PROVIDER_UNKNOWN' }
}
function diagnosticProviderId(selectionId: string): string {
  const value = selectionId.split('/', 1)[0] ?? selectionId
  return value.slice(0, 160)
}

async function toPiMessages(
  messages: Message[],
  model: ProviderConfig,
  readImage?: DriverInput['readImage'],
  readFile?: DriverInput['readFile'],
  transientToolContent = new Map<string, ToolResultContent[]>(),
): Promise<PiMessage[]> {
  const output: PiMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'user') {
      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = []
      for (const block of message.content) {
        if (block.type === 'text') content.push(block)
        if (block.type === 'image') {
          if (!model.imageInput) throw new Error(`Model ${model.name} does not support image input`)
          if (!readImage) content.push({ type: 'text', text: `[image: ${block.artifact.name}]` })
          else {
            const image = await readImage(block.artifact.id)
            content.push({ type: 'image', data: image.data, mimeType: image.mime })
          }
        }
        if (block.type === 'file') {
          if (!readFile) {
            content.push({ type: 'text', text: `[attached file: ${block.artifact.name}]` })
            continue
          }
          const file = await readFile(block.artifact.id)
          const header = `[attached file: ${file.name} (${file.mime}, ${file.size} bytes)]`
          if (file.text === null) content.push({ type: 'text', text: `${header}\n[binary content omitted]` })
          else
            content.push({
              type: 'text',
              text: `${header}\n--- begin file ---\n${file.text}${file.truncated ? '\n[content truncated]' : ''}\n--- end file ---`,
            })
        }
      }
      output.push({ role: 'user', content, timestamp: message.createdAt })
    } else if (message.role === 'assistant') {
      if (
        message.providerData &&
        typeof message.providerData === 'object' &&
        'role' in message.providerData &&
        message.providerData.role === 'assistant'
      ) {
        output.push(message.providerData as AssistantMessage)
      } else {
        const content = message.content.flatMap<AssistantMessage['content'][number]>((block) =>
          block.type === 'text'
            ? [block]
            : block.type === 'tool_call'
              ? [
                  {
                    type: 'toolCall',
                    id: block.callId,
                    name: block.name,
                    arguments: z.record(z.string(), z.json()).parse(block.args),
                  },
                ]
              : [],
        )
        output.push({
          role: 'assistant',
          content,
          api: modelOf(model).api,
          provider: model.id,
          model: model.model,
          timestamp: message.createdAt,
          usage: piUsage(),
          stopReason: content.some((c) => c.type === 'toolCall') ? 'toolUse' : 'stop',
        })
      }
    } else {
      for (const block of message.content)
        if (block.type === 'tool_result') {
          let content = transientToolContent.get(block.callId)
          if (!content) {
            content = [{ type: 'text', text: block.text }]
            if (readImage && model.imageInput)
              for (const artifact of block.images ?? []) {
                const image = await readImage(artifact.id)
                content.push({ type: 'image', data: image.data, mimeType: image.mime })
              }
          }
          output.push({
            role: 'toolResult',
            toolCallId: block.callId,
            toolName: block.name,
            content,
            ...(block.details === undefined ? {} : { details: z.json().parse(block.details) }),
            isError: block.isError,
            timestamp: message.createdAt,
          })
        }
    }
  }
  return output
}
function contentOf(message: AssistantMessage): ContentBlock[] {
  return message.content.map((block) =>
    block.type === 'text'
      ? { type: 'text', text: block.text }
      : block.type === 'thinking'
        ? { type: 'thinking', text: block.thinking }
        : { type: 'tool_call', callId: block.id, name: block.name, args: block.arguments },
  )
}

export class PiDriver implements HarnessDriver {
  readonly supportsCanonicalSteering = true
  readonly supportsSteeringAdmissionClosure = true
  async run(input: DriverInput) {
    let stepId = '',
      streamId = '',
      stepCount = 0,
      failure: string | undefined,
      attemptModel = input.request.model,
      firstThinking = false,
      firstText = false
    let modelDiagnosticStartedAt = 0
    let modelRequestId = ''
    let modelTerminalEmitted = false
    const completedTools = new Set<string>()
    let goalStopped = false
    let requestFailure: unknown
    let latestResponse: ProviderResponse | undefined
    let latestTransportKind: TransportFailureKind | undefined
    let latestTransportCode: TransportFailureCode | undefined
    let latestTransportPhase: 'fetch' | 'stream' | undefined
    let streamState = new ProviderStreamObservation()
    const readSteering = createDriverSteeringReader(input)
    const pollSteering = async (closeWhenEmpty?: true) => {
      if (input.signal.aborted || goalStopped || requestFailure !== undefined) return []
      try {
        // These entries only wake the loop. The provider payload is rebuilt by
        // beforeRequest, with its actual model, including attachment hydration.
        return (await readSteering(closeWhenEmpty ? { closeWhenEmpty } : {})).map((message) => ({
          role: 'user' as const,
          content: message.content.filter((block) => block.type === 'text'),
          timestamp: message.createdAt,
        }))
      } catch (error) {
        // Pi requires polling not to reject. Retain the cause and fail before
        // another provider request instead of silently dropping admitted input.
        requestFailure = error ?? new Error('Run steering source failed')
        return []
      }
    }
    const transientToolContent = new Map<string, ToolResultContent[]>()
    const tools: AgentTool[] = input.tools.map((tool) => ({
      name: tool.name,
      label: tool.name,
      description: `${tool.description}\n${describeToolTimeout(tool)}`,
      parameters: Type.Unsafe(z.toJSONSchema(tool.inputSchema, { io: 'input' })),
      executionMode: 'sequential',
      execute: async (callId, args) => {
        const result = await input.execute(tool.name, args as Record<string, unknown>, callId)
        if (result.hostControl) goalStopped = true
        completedTools.add(callId)
        if (result.isError) throw new Error(result.text)
        if (result.content) transientToolContent.set(callId, result.content)
        return { content: result.content ?? [{ type: 'text', text: result.text }], details: result.details }
      },
    }))
    const emit = async (event: AgentEvent) => {
      if (event.type === 'turn_start') {
        stepId = crypto.randomUUID()
        firstThinking = false
        firstText = false
        stepCount++
        if (stepCount > 64) throw new HbarError(RUN_STEP_LIMIT_CODE, 'Run reached the 64-step limit')
        await input.emit('step.started', { step: stepCount }, stepId)
      } else if (event.type === 'message_start' && event.message.role === 'assistant') {
        streamId = crypto.randomUUID()
        await input.emit('attempt.providerStarted', { attemptId: stepId }, stepId)
      } else if (event.type === 'message_update' && event.message.role === 'assistant') {
        const content = event.message.content
        if (!firstThinking && content.some((block) => block.type === 'thinking' && block.thinking.length > 0)) {
          firstThinking = true
          await input.emit('attempt.firstThinking', { attemptId: stepId }, stepId)
        }
        if (!firstText && content.some((block) => block.type === 'text' && block.text.length > 0)) {
          firstText = true
          await input.emit('attempt.firstText', { attemptId: stepId }, stepId)
        }
        input.stream(
          streamId,
          content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join(''),
          content
            .filter((c) => c.type === 'thinking')
            .map((c) => c.thinking)
            .join(''),
        )
      } else if (event.type === 'message_end') {
        if (event.message.role === 'assistant') {
          const message = event.message
          if (
            message.stopReason === 'error' ||
            message.stopReason === 'aborted' ||
            message.stopReason === 'stop' ||
            message.stopReason === 'toolUse' ||
            message.stopReason === 'length'
          )
            if (!modelTerminalEmitted)
              emitModelDiagnostic(input.onModelDiagnostic, {
                phase:
                  message.stopReason === 'aborted'
                    ? 'cancelled'
                    : message.stopReason === 'error'
                      ? 'failed'
                      : 'settled',
                purpose: 'model',
                providerId: diagnosticProviderId(attemptModel.id),
                modelSelectionId: attemptModel.id,
                modelRequestId,
                model: attemptModel.model,
                protocol: attemptModel.protocol,
                stopReason: message.stopReason,
                ...terminalProviderFacts(
                  latestResponse,
                  latestTransportKind,
                  latestTransportCode,
                  message.stopReason === 'error',
                  latestTransportPhase,
                  streamState,
                  message.stopReason,
                ),
                durationMs:
                  modelDiagnosticStartedAt > 0 ? Math.max(0, performance.now() - modelDiagnosticStartedAt) : undefined,
              })
          modelTerminalEmitted = true
          await input.emit(
            'usage.recorded',
            createUsageFact({
              usage: normalizeUsage(message.usage),
              runId: input.run.id,
              attemptId: stepId,
              source: 'model',
              model: attemptModel,
            }),
            stepId,
          )
          if (message.stopReason === 'error' || message.stopReason === 'aborted') {
            failure = message.errorMessage ?? message.stopReason
            await input.emit(
              'assistant.attempt',
              { content: contentOf(message), reason: message.stopReason, error: failure },
              stepId,
            )
          } else await input.commit('assistant', contentOf(message), streamId, message)
        } else if (event.message.role === 'toolResult' && !completedTools.has(event.message.toolCallId)) {
          await input.commit('tool', [
            {
              type: 'tool_result',
              callId: event.message.toolCallId,
              name: event.message.toolName,
              text: event.message.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n'),
              isError: event.message.isError,
              details: event.message.details,
            },
          ])
        }
      }
    }
    const streamFn: StreamFn = async () => {
      try {
        if (requestFailure !== undefined) throw requestFailure
        input.signal.throwIfAborted()
        const request = await input.beforeRequest(input.request, stepId)
        attemptModel = request.model
        const toolNames = request.toolNames
        const context =
          request.model.protocol === 'openai-responses' || request.model.protocol === 'openai-completions'
            ? splitModelContext(request)
            : { instructions: request.system, context: '' }
        modelRequestId = stepId
        modelTerminalEmitted = false
        latestResponse = undefined
        latestTransportKind = undefined
        latestTransportCode = undefined
        latestTransportPhase = undefined
        streamState = new ProviderStreamObservation()
        if (!modelTerminalEmitted)
          emitModelDiagnostic(input.onModelDiagnostic, {
            phase: 'started',
            purpose: 'model',
            providerId: diagnosticProviderId(request.model.id),
            modelSelectionId: request.model.id,
            modelRequestId,
            model: request.model.model,
            protocol: request.model.protocol,
          })
        modelDiagnosticStartedAt = performance.now()
        return streamProvider(
          request.model,
          {
            systemPrompt: context.instructions,
            messages: await toPiMessages(
              request.messages,
              request.model,
              input.readImage,
              input.readFile,
              transientToolContent,
            ),
            tools: toolNames ? tools.filter((tool) => toolNames.includes(tool.name)) : tools,
          },
          await input.resolveKey(request.model.id),
          input.signal,
          input.run.input.thinking,
          context.context,
          input.session.id,
          (response) => {
            latestResponse = response
            responseDiagnostic(input.onModelDiagnostic, request, response, modelRequestId, 'model')
          },
          (kind, code, phase) => {
            latestTransportKind = kind
            latestTransportCode = code
            latestTransportPhase = phase
            transportFailureDiagnostic(input.onModelDiagnostic, request, modelRequestId, kind, code, 'model', phase)
          },
          (event) => streamState.observe(event),
          (errorCode) => streamState.markProviderError(errorCode),
          () => streamState.markEof(),
        )
      } catch (error) {
        if (error instanceof RunControlSignal && !input.signal.aborted) throw error
        requestFailure = error
        if (!modelTerminalEmitted)
          emitModelDiagnostic(input.onModelDiagnostic, {
            phase: input.signal.aborted ? 'cancelled' : 'failed',
            purpose: 'model',
            providerId: diagnosticProviderId(input.request.model.id),
            modelSelectionId: input.request.model.id,
            modelRequestId,
            model: input.request.model.model,
            protocol: input.request.model.protocol,
            stopReason: input.signal.aborted ? 'aborted' : 'error',
            ...terminalProviderFacts(
              latestResponse,
              latestTransportKind,
              latestTransportCode,
              !input.signal.aborted,
              latestTransportPhase,
              streamState,
              input.signal.aborted ? 'aborted' : 'error',
            ),
            durationMs:
              modelDiagnosticStartedAt > 0 ? Math.max(0, performance.now() - modelDiagnosticStartedAt) : undefined,
          })
        modelTerminalEmitted = true
        return failedStream(modelOf(input.request.model), error, input.signal.aborted)
      }
    }
    try {
      const thinking = normalizeThinkingLevel(input.request.model, input.run.input.thinking)
      await runAgentLoop(
        [],
        {
          messages: normalizeContext({
            systemPrompt: input.request.system,
            messages: await toPiMessages(input.request.messages, input.request.model, input.readImage, input.readFile),
          }).messages,
          tools,
        },
        {
          model: modelOf(input.request.model),
          ...(thinking !== 'off' ? { reasoning: thinking } : {}),
          convertToLlm: (messages) => messages as PiMessage[],
          toolExecution: 'sequential',
          finishTurn: async () => {
            // Pi decides whether to continue before turn_end. Settle the Host
            // step here so its stop signal is observed before any queue drain.
            await input.emit('step.ended', {}, stepId)
            goalStopped = Boolean((await input.stepEnded(stepId))?.stop) || goalStopped
            return input.signal.aborted || goalStopped ? { action: 'end' } : undefined
          },
          ...(input.getSteeringMessages
            ? {
                getSteeringMessages: () => pollSteering(),
                // Only the outer-loop natural-stop probe seals an empty source.
                // Ordinary empty polls must not close admission during tool work.
                getFollowUpMessages: () => pollSteering(true),
              }
            : {}),
        },
        emit,
        input.signal,
        streamFn,
      )
      input.signal.throwIfAborted()
      if (requestFailure !== undefined) throw requestFailure
      if (failure) throw attemptModel.protocol === 'mock' ? new Error(failure) : providerFailure(failure)
    } catch (error) {
      if (modelRequestId && !modelTerminalEmitted)
        emitModelDiagnostic(input.onModelDiagnostic, {
          phase: input.signal.aborted ? 'cancelled' : 'failed',
          purpose: 'model',
          providerId: diagnosticProviderId(attemptModel.id),
          modelSelectionId: attemptModel.id,
          modelRequestId,
          model: attemptModel.model,
          protocol: attemptModel.protocol,
          stopReason: input.signal.aborted ? 'aborted' : 'error',
          ...terminalProviderFacts(latestResponse, latestTransportKind, latestTransportCode, !input.signal.aborted),
          durationMs:
            modelDiagnosticStartedAt > 0 ? Math.max(0, performance.now() - modelDiagnosticStartedAt) : undefined,
        })
      modelTerminalEmitted = modelTerminalEmitted || Boolean(modelRequestId)
      if (!(error instanceof RunControlSignal) || input.signal.aborted) throw error
    } finally {
      await input.closeSteeringAdmission?.()
    }
  }
  async summarize(
    request: ModelRequest,
    apiKey: string | null,
    signal: AbortSignal,
    onDiagnostic?: (event: ModelDiagnosticEvent) => void,
  ) {
    const startedAt = performance.now()
    const modelRequestId = crypto.randomUUID()
    let terminalEmitted = false
    let latestResponse: ProviderResponse | undefined
    let latestTransportKind: TransportFailureKind | undefined
    let latestTransportCode: TransportFailureCode | undefined
    let latestTransportPhase: 'fetch' | 'stream' | undefined
    const streamState = new ProviderStreamObservation()
    emitModelDiagnostic(onDiagnostic, {
      phase: 'started',
      purpose: 'compaction',
      providerId: diagnosticProviderId(request.model.id),
      modelSelectionId: request.model.id,
      modelRequestId,
      model: request.model.model,
      protocol: request.model.protocol,
    })
    try {
      const stream = streamProvider(
        request.model,
        {
          systemPrompt: request.system,
          messages: await toPiMessages(request.messages, { ...request.model, imageInput: true }, undefined, undefined),
        },
        apiKey,
        signal,
        request.context?.thinking,
        '',
        request.context?.sessionId,
        (response) => {
          latestResponse = response
          responseDiagnostic(onDiagnostic, request, response, modelRequestId, 'compaction')
        },
        (kind, code, phase) => {
          latestTransportKind = kind
          latestTransportCode = code
          latestTransportPhase = phase
          transportFailureDiagnostic(onDiagnostic, request, modelRequestId, kind, code, 'compaction', phase)
        },
        (event) => streamState.observe(event),
        (errorCode) => streamState.markProviderError(errorCode),
        () => streamState.markEof(),
      )
      for await (const event of stream) {
        void event
        signal.throwIfAborted()
      }
      const message = await stream.result()
      if (message.stopReason === 'error' || message.stopReason === 'aborted') {
        terminalEmitted = true
        emitModelDiagnostic(onDiagnostic, {
          phase: message.stopReason === 'aborted' ? 'cancelled' : 'failed',
          purpose: 'compaction',
          providerId: diagnosticProviderId(request.model.id),
          modelSelectionId: request.model.id,
          modelRequestId,
          model: request.model.model,
          protocol: request.model.protocol,
          stopReason: message.stopReason,
          ...terminalProviderFacts(
            latestResponse,
            latestTransportKind,
            latestTransportCode,
            message.stopReason === 'error',
            latestTransportPhase,
            streamState,
            diagnosticStopReason(message.stopReason),
          ),
          durationMs: Math.max(0, performance.now() - startedAt),
        })
        throw request.model.protocol === 'mock'
          ? new Error(message.errorMessage ?? 'Compaction failed')
          : providerFailure(message.errorMessage ?? 'Compaction failed')
      }
      if (!terminalEmitted)
        emitModelDiagnostic(onDiagnostic, {
          phase: 'settled',
          purpose: 'compaction',
          providerId: diagnosticProviderId(request.model.id),
          modelSelectionId: request.model.id,
          modelRequestId,
          model: request.model.model,
          protocol: request.model.protocol,
          stopReason:
            message.stopReason === 'toolUse' || message.stopReason === 'length' || message.stopReason === 'stop'
              ? message.stopReason
              : 'stop',
          ...terminalProviderFacts(
            latestResponse,
            latestTransportKind,
            latestTransportCode,
            false,
            latestTransportPhase,
            streamState,
            diagnosticStopReason(message.stopReason),
          ),
          durationMs: Math.max(0, performance.now() - startedAt),
        })
      return {
        text: message.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
        usage: normalizeUsage(message.usage),
      }
    } catch (error) {
      if (!terminalEmitted)
        emitModelDiagnostic(onDiagnostic, {
          phase: signal.aborted ? 'cancelled' : 'failed',
          purpose: 'compaction',
          providerId: diagnosticProviderId(request.model.id),
          modelSelectionId: request.model.id,
          modelRequestId,
          model: request.model.model,
          protocol: request.model.protocol,
          stopReason: signal.aborted ? 'aborted' : 'error',
          ...terminalProviderFacts(
            latestResponse,
            latestTransportKind,
            latestTransportCode,
            !signal.aborted,
            latestTransportPhase,
            streamState,
            signal.aborted ? 'aborted' : 'error',
          ),
          durationMs: Math.max(0, performance.now() - startedAt),
        })
      throw error
    }
  }
}
export default definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Pi harness',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Pi agent loop and multi-provider streaming',
    scope: 'host',
    required: true,
    restartRequired: true,
    provides: { driver: '1.0.0' },
    permissions: ['network'],
  },
  apply(ctx) {
    provide(ctx, 'driver', new PiDriver())
  },
})
