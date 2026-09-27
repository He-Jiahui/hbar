import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  contentBlockSchema,
  toolCallPresentationSchema,
  toolPresentationDeclarationSchema,
  toolPresentationFieldSchema,
  type ContentBlock,
  type ToolCallPresentation,
  type ToolPresentationDeclaration,
} from '@hbar/contracts'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import { Tools } from '../packages/kernel/src/plugins'
import { captureToolPresentations, enrichToolCallPresentations } from '../packages/kernel/src/tool-presentation'

const declarations: readonly ToolPresentationDeclaration[] = [
  { kind: 'file-read', pathField: 'path' },
  { kind: 'file-write', pathField: 'destination' },
  { kind: 'file-edit', pathField: 'file' },
  { kind: 'directory-list', pathField: 'folder' },
  { kind: 'command', commandField: 'command', descriptionField: 'description' },
  { kind: 'text-search', patternField: 'pattern', pathField: 'path' },
  { kind: 'file-search', queryField: 'nameQuery', includeField: 'include', pathField: 'path' },
]

function definition(name: string, presentation?: ToolPresentationDeclaration): ToolDefinition {
  return {
    name,
    description: 'Test-owned declaration',
    effect: 'read',
    inputSchema: z.object({}),
    execute: async () => ({ text: 'unused' }),
    ...(presentation ? { presentation } : {}),
  }
}

test('seven strict declarations round-trip in canonical calls while legacy calls remain unchanged', () => {
  const call: Extract<ContentBlock, { type: 'tool_call' }> = {
    type: 'tool_call',
    callId: 'original',
    name: 'custom',
    args: { path: 'requested', extra: 7 },
  }
  expect(contentBlockSchema.parse(call)).toEqual(call)
  for (const declaration of declarations) {
    expect(toolPresentationDeclarationSchema.parse(declaration)).toEqual(declaration)
    const presentation: ToolCallPresentation = { ...declaration, version: 1 }
    expect(toolCallPresentationSchema.parse(presentation)).toEqual(presentation)
    expect(contentBlockSchema.parse({ ...call, presentation })).toEqual({ ...call, presentation })
    expect(toolPresentationDeclarationSchema.safeParse(presentation).success).toBe(false)
    expect(toolCallPresentationSchema.safeParse({ ...presentation, version: 2 }).success).toBe(false)
    expect(toolPresentationDeclarationSchema.safeParse({ ...declaration, title: 'Untrusted prose' }).success).toBe(
      false,
    )
  }
})

test('field names are bounded top-level identifiers and semantic variants reject irrelevant fields', () => {
  for (const field of ['p', '_path', 'nameQuery', 'x'.repeat(64)])
    expect(toolPresentationFieldSchema.safeParse(field).success).toBe(true)
  for (const field of [
    '',
    'x'.repeat(65),
    'path.name',
    'a[0]',
    '1path',
    '路径',
    '__proto__',
    'prototype',
    'constructor',
  ])
    expect(toolPresentationFieldSchema.safeParse(field).success).toBe(false)
  for (const invalid of [
    { kind: 'file-read' },
    { kind: 'file-search', pathField: 'path' },
    { kind: 'file-search' },
    { kind: 'text-search', queryField: 'query' },
    { kind: 'file-read', pathField: 'path', commandField: 'command' },
    { kind: 'command', commandField: 'command', pathField: 'path' },
    { kind: 'shell', commandField: 'command' },
  ])
    expect(toolPresentationDeclarationSchema.safeParse(invalid).success).toBe(false)
  expect(toolPresentationDeclarationSchema.safeParse({ kind: 'file-search', includeField: 'include' }).success).toBe(
    true,
  )
  expect(toolPresentationDeclarationSchema.safeParse({ kind: 'file-search', queryField: 'nameQuery' }).success).toBe(
    true,
  )
})

test('registration rejects invalid declarations without changing its registry or freezing caller objects', async () => {
  const registry = new Tools()
  const invalid = definition('invalid')
  Reflect.set(invalid, 'presentation', { kind: 'command', commandField: '__proto__' })
  expect(() => registry.register(invalid)).toThrow('Tool presentation declaration is invalid')
  expect(registry.list()).toEqual([])
  const original = definition('custom', { kind: 'file-read', pathField: 'path' })
  const dispose = registry.register(original)
  expect(Object.isFrozen(original)).toBe(false)
  expect(Object.isFrozen(original.presentation)).toBe(false)
  expect(Object.isFrozen(registry.get('custom')?.presentation)).toBe(true)
  if (!original.presentation) throw new Error('Fixture declaration missing')
  Reflect.set(original.presentation, 'pathField', 'different')
  original.name = 'renamed-after-register'
  expect(registry.get('custom')?.presentation).toEqual({ kind: 'file-read', pathField: 'path' })
  const registered = registry.get('custom')
  if (!registered) throw new Error('Registered fixture missing')
  registered.name = 'renamed-returned-definition'
  await dispose()
  expect(registry.get('custom')).toBeUndefined()
})

test('capture honors scoped shadowing and survives declaration mutation, disposal, and replacement', async () => {
  const parent = new Tools()
  parent.register(definition('same', { kind: 'command', commandField: 'command' }))
  const scoped = new Tools(parent)
  const dispose = scoped.register(definition('same', { kind: 'file-read', pathField: 'requestedPath' }))
  const captured = captureToolPresentations(new Set(['same', 'missing']), scoped)
  const registered = scoped.get('same')
  if (!registered) throw new Error('Registered fixture missing')
  expect(Reflect.set(registered, 'presentation', { kind: 'file-write', pathField: 'different' })).toBe(false)
  await dispose()
  expect(scoped.get('same')?.presentation?.kind).toBe('command')
  scoped.register(definition('same'))
  expect(captured.get('same')).toEqual({ version: 1, kind: 'file-read', pathField: 'requestedPath' })
  expect(Object.isFrozen(captured.get('same'))).toBe(true)
  expect(captured.has('missing')).toBe(false)
  expect(captureToolPresentations(new Set(['same']), scoped).size).toBe(0)
})

for (const declared of [false, true])
  test(`registry-owned presentation slot cannot be assigned or deleted, including absent declarations (${declared})`, () => {
    const registry = new Tools()
    const original = definition('immutable', declared ? { kind: 'file-read', pathField: 'path' } : undefined)
    registry.register(original)
    const registered = registry.get('immutable')
    if (!registered) throw new Error('Registered fixture missing')
    expect(Reflect.set(registered, 'presentation', { kind: 'command', commandField: 'path' })).toBe(false)
    expect(Reflect.deleteProperty(registered, 'presentation')).toBe(false)
    expect(registry.list()[0]?.presentation).toEqual(original.presentation)
  })

test('all tool-call roles strip driver metadata; only assistant gets captured semantics without altering args', () => {
  const registry = new Tools()
  registry.register(definition('custom', { kind: 'file-read', pathField: 'requestedPath' }))
  registry.register(definition('read_file'))
  registry.register(definition('not_selected', { kind: 'command', commandField: 'body' }))
  const captured = captureToolPresentations(new Set(['custom', 'read_file']), registry)
  const args = {
    requestedPath: 'shown/requested.txt',
    path: 'not-the-declared-field',
    text: 'full body',
    flags: [1, 2],
  }
  const call: Extract<ContentBlock, { type: 'tool_call' }> = {
    type: 'tool_call',
    callId: 'call',
    name: 'custom',
    args,
    presentation: { version: 1, kind: 'command', commandField: 'text' },
  }
  for (const role of ['assistant', 'user', 'tool'] as const) {
    const output = enrichToolCallPresentations(role, [call], captured)[0]
    expect(output?.type).toBe('tool_call')
    if (!output || output.type !== 'tool_call') throw new Error('Expected original tool call')
    expect(output.args).toBe(args)
    expect(output.callId).toBe('call')
    expect(output.presentation).toEqual(
      role === 'assistant' ? { version: 1, kind: 'file-read', pathField: 'requestedPath' } : undefined,
    )
  }
  for (const name of ['read_file', 'unknown', 'not_selected']) {
    const output = enrichToolCallPresentations('assistant', [{ ...call, name }], captured)[0]
    expect(output).toEqual({ type: 'tool_call', callId: 'call', name, args })
  }
  expect(call.presentation?.kind).toBe('command')
  const prose: ContentBlock = { type: 'text', text: 'Unchanged prose' }
  expect(enrichToolCallPresentations('assistant', [prose], captured)[0]).toBe(prose)
  for (const forged of [
    { version: 99, kind: 'command', commandField: 'body' },
    { version: 1, kind: 'file-read', pathField: 'path', title: 'Untrusted extra metadata' },
  ]) {
    const invalid: Extract<ContentBlock, { type: 'tool_call' }> = { ...call }
    Reflect.set(invalid, 'presentation', forged)
    expect(enrichToolCallPresentations('assistant', [invalid], captured)[0]).toEqual({
      type: 'tool_call',
      callId: 'call',
      name: 'custom',
      args,
      presentation: { version: 1, kind: 'file-read', pathField: 'requestedPath' },
    })
    const untouched: unknown = Reflect.get(invalid, 'presentation')
    expect(untouched).toBe(forged)
  }
})
