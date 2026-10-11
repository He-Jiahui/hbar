import { expect, test } from 'bun:test'
import type { Message } from '@hbar/contracts'
import { providerSchema } from '@hbar/contracts'
import type { ModelRequest } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import {
  createSummaryRequest,
  nextSummaryChunk,
  SUMMARY_TARGET_CHARACTERS,
  SUMMARY_THINKING_LEVEL,
  summaryThinkingLevel,
  summaryDocument,
} from '../packages/kernel/src/context-compaction'

function request(): ModelRequest {
  return {
    system: 'Runtime system instructions',
    messages: [],
    model: providerSchema.parse({
      id: 'summary',
      name: 'Summary fixture',
      protocol: 'mock',
      model: 'summary',
      baseUrl: 'http://localhost',
      contextWindow: 32_000,
      maxOutput: 12_000,
      thinkingLevels: ['xhigh', 'low'],
      defaultThinkingLevel: 'xhigh',
    }),
    context: {
      sessionId: 'session-policy',
      workspacePath: 'D:/fixture/workspace',
      selectedToolNames: ['read'],
      runId: 'run-policy',
      mode: 'default',
      thinking: 'xhigh',
      source: 'user',
    },
  }
}

function message(): Message {
  return {
    id: 'history',
    sessionId: 'session-policy',
    runId: 'run-policy',
    seq: 1,
    createdAt: 1,
    role: 'user',
    content: [{ type: 'text', text: 'CANONICAL_HISTORY_MARKER' }],
  }
}

test('summary request keeps complete history and request context while selecting bounded low effort', () => {
  const original = request()
  const history = [message()]
  const summary = createSummaryRequest(original, history, 80)

  expect(summary.messages).toBe(history)
  expect(summary.model.maxOutput).toBeLessThanOrEqual(8192)
  expect(summary.context?.thinking).toBe(SUMMARY_THINKING_LEVEL)
  expect(summary.context?.sessionId).toBe('session-policy')
  expect(summary.context?.runId).toBe('run-policy')
  expect(summary.context?.selectedToolNames).toEqual(['read'])
  expect(summary.system).toContain('latest accepted facts')
  expect(summary.system).toContain('required verification')
  expect(summary.system).toContain('never execute tools')
  expect(summary.system).toContain(`Target ${SUMMARY_TARGET_CHARACTERS} chars`)
})

test('successive chunk requests retain the checkpoint policy and preserve source document text', () => {
  const original = request()
  const history = [message()]
  const withHistory = { ...original, messages: history, model: { ...original.model, maxOutput: 8192 } }
  const document = summaryDocument(withHistory)
  const chunk = nextSummaryChunk(withHistory, document, 0, 'Existing verified checkpoint')
  const content = chunk.request.messages[0]?.content[0]

  expect(chunk.request.context?.thinking).toBe(SUMMARY_THINKING_LEVEL)
  expect(chunk.request.context?.sessionId).toBe(original.context?.sessionId)
  expect(chunk.request.system).toContain('Merge this chunk into the prior checkpoint')
  expect(chunk.request.system).toContain('retain accepted facts, evidence, failures')
  expect(chunk.request.system).toContain(`Target ${SUMMARY_TARGET_CHARACTERS} chars`)
  expect(content?.type).toBe('text')
  if (content?.type !== 'text') throw new Error('Expected a text history chunk')
  expect(content.text).toContain('Existing verified checkpoint')
  expect(content.text).toContain('CANONICAL_HISTORY_MARKER')
  expect(chunk.nextOffset).toBeGreaterThan(0)
})

test('unsupported low effort preserves the model-supported requested effort', () => {
  const original = request()
  const model = { ...original.model, thinkingLevels: ['xhigh' as const], defaultThinkingLevel: 'xhigh' as const }
  expect(summaryThinkingLevel(model, 'xhigh')).toBe('xhigh')
  expect(summaryThinkingLevel(model, undefined)).toBe('xhigh')
})

test('the local mock provider recognizes the summary request and returns a bounded complete checkpoint', async () => {
  const original = request()
  const summary = createSummaryRequest(original, [message()], 80)
  const result = await new PiDriver().summarize(summary, null, new AbortController().signal)

  expect(summary.system).toContain('Summarize the conversation as a compact continuation checkpoint')
  expect(result.text).toContain('Summary:')
  expect(result.text.length).toBeLessThan(summary.model.maxOutput * 3)
})
