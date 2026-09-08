import { runAgentLoop } from '@earendil-works/pi-agent-core'
import type { AgentEvent, AgentTool, StreamFn } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import type {
  Api,
  AssistantMessage,
  Context as PiContext,
  Message as PiMessage,
  Model,
  SimpleStreamOptions,
  Usage as PiUsage,
} from '@earendil-works/pi-ai'
import { streamSimple as openaiCompletions } from '@earendil-works/pi-ai/api/openai-completions'
import { streamSimple as openaiResponses } from '@earendil-works/pi-ai/api/openai-responses'
import { streamSimple as anthropicMessages } from '@earendil-works/pi-ai/api/anthropic-messages'
import { z } from 'zod'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, HarnessDriver, ModelRequest } from '@hbar/plugin-sdk'
import type { ContentBlock, Message, ProviderConfig, Usage } from '@hbar/contracts'

const piUsage = (): PiUsage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
})
const normalizeUsage = (usage: PiUsage): Usage => ({
  input: usage.input,
  output: usage.output,
  cacheRead: usage.cacheRead,
  cacheWrite: usage.cacheWrite,
  cost: usage.cost.total,
})
function modelOf(config: ProviderConfig): Model<Api> {
  return {
    id: config.model,
    name: config.name,
    provider: config.id,
    api: config.protocol === 'mock' ? 'openai-completions' : config.protocol,
    baseUrl: config.baseUrl,
    reasoning: config.reasoning,
    input: config.imageInput ? ['text', 'image'] : ['text'],
    cost: { input: config.inputPrice, output: config.outputPrice, cacheRead: 0, cacheWrite: 0 },
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
          arguments: JSON.parse(tool[2]!) as Record<string, unknown>,
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
): AssistantMessageEventStream {
  const model = modelOf(config)
  const options: SimpleStreamOptions = {
    apiKey: apiKey ?? 'hbar-keyless-local-provider',
    signal,
    maxTokens: config.maxOutput,
    maxRetries: 0,
  }
  try {
    switch (config.protocol) {
      case 'mock':
        return fixtureStream(model, context, options)
      case 'openai-completions':
        return openaiCompletions(model as Model<'openai-completions'>, context, options)
      case 'openai-responses':
        return openaiResponses(model as Model<'openai-responses'>, context, options)
      case 'anthropic-messages':
        return anthropicMessages(model as Model<'anthropic-messages'>, context, options)
    }
  } catch (error) {
    return failedStream(model, error, signal.aborted)
  }
}

async function toPiMessages(
  messages: Message[],
  model: ProviderConfig,
  readImage?: DriverInput['readImage'],
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
              ? [{ type: 'toolCall', id: block.callId, name: block.name, arguments: block.args }]
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
        if (block.type === 'tool_result')
          output.push({
            role: 'toolResult',
            toolCallId: block.callId,
            toolName: block.name,
            content: [{ type: 'text', text: block.text }],
            details: block.details,
            isError: block.isError,
            timestamp: message.createdAt,
          })
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
  async run(input: DriverInput) {
    let stepId = '',
      streamId = '',
      stepCount = 0,
      failure: string | undefined
    const completedTools = new Set<string>()
    const tools: AgentTool[] = input.tools.map((tool) => ({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: Type.Unsafe(z.toJSONSchema(tool.inputSchema)),
      executionMode: 'sequential',
      execute: async (callId, args) => {
        const result = await input.execute(tool.name, args as Record<string, unknown>, callId)
        completedTools.add(callId)
        if (result.isError) throw new Error(result.text)
        return { content: [{ type: 'text', text: result.text }], details: result.details }
      },
    }))
    const emit = async (event: AgentEvent) => {
      if (event.type === 'turn_start') {
        stepId = crypto.randomUUID()
        stepCount++
        if (stepCount > 64) throw new Error('Run reached the 64-step limit')
        await input.emit('step.started', { step: stepCount }, stepId)
      } else if (event.type === 'message_start' && event.message.role === 'assistant') {
        streamId = crypto.randomUUID()
      } else if (event.type === 'message_update' && event.message.role === 'assistant') {
        const content = event.message.content
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
          await input.emit('usage.recorded', normalizeUsage(message.usage), stepId)
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
      } else if (event.type === 'turn_end') {
        await input.emit('step.ended', {}, stepId)
        await input.stepEnded(stepId)
      }
    }
    const streamFn: StreamFn = async () => {
      try {
        const request = await input.beforeRequest(input.request, stepId)
        return streamProvider(
          request.model,
          {
            systemPrompt: request.system,
            messages: await toPiMessages(request.messages, request.model, input.readImage),
            tools,
          },
          await input.resolveKey(request.model.id),
          input.signal,
        )
      } catch (error) {
        return failedStream(modelOf(input.request.model), error, input.signal.aborted)
      }
    }
    await runAgentLoop(
      [],
      {
        systemPrompt: input.request.system,
        messages: await toPiMessages(input.request.messages, input.request.model, input.readImage),
        tools,
      },
      {
        model: modelOf(input.request.model),
        convertToLlm: (messages) => messages as PiMessage[],
        toolExecution: 'sequential',
        shouldStopAfterTurn: () => input.signal.aborted,
      },
      emit,
      input.signal,
      streamFn,
    )
    input.signal.throwIfAborted()
    if (failure) throw new Error(failure)
  }
  async summarize(request: ModelRequest, apiKey: string | null, signal: AbortSignal) {
    const stream = streamProvider(
      request.model,
      {
        systemPrompt: request.system,
        messages: await toPiMessages(request.messages, { ...request.model, imageInput: true }),
      },
      apiKey,
      signal,
    )
    for await (const _event of stream) {
      signal.throwIfAborted()
    }
    const message = await stream.result()
    if (message.stopReason === 'error' || message.stopReason === 'aborted')
      throw new Error(message.errorMessage ?? 'Compaction failed')
    return {
      text: message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n'),
      usage: normalizeUsage(message.usage),
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
