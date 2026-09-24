import { expect, test } from 'bun:test'
import { appendModelContext, prependModelInstructions } from '@hbar/plugin-sdk'
import type { ModelRequest } from '@hbar/plugin-sdk'
import { providerSchema } from '@hbar/contracts'
import { appendProviderContext, splitModelContext } from '../plugins/pi-driver/src/model-context'

const request: ModelRequest = {
  system: 'Stable instructions 灯 💡',
  messages: [],
  model: providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    model: 'fixture',
    baseUrl: 'http://localhost',
  }),
}

test('Host snapshots have one explicit suffix boundary and complete legacy text without duplicated journal content', () => {
  const first = appendModelContext(request, 'budget 100')
  const complete = prependModelInstructions(appendModelContext(first, 'focus revision 2'), 'Complete tool catalog')
  const split = splitModelContext(complete)
  expect(split.instructions).toBe('Complete tool catalog\n\nStable instructions 灯 💡')
  expect(split.context).toBe('\n\nbudget 100\n\nfocus revision 2')
  expect(split.instructions + split.context).toBe(complete.system)
  expect(request.systemContextOffset).toBeUndefined()
  expect(first.system).not.toContain('Complete tool catalog')
  expect(appendModelContext(request, '')).toBe(request)
  expect(prependModelInstructions(request, '')).toBe(request)
  expect(splitModelContext(request)).toEqual({ instructions: request.system, context: '' })
  expect(splitModelContext({ ...request, systemContextOffset: 0 })).toEqual({
    instructions: request.system,
    context: '',
  })
})

for (const offset of [-1, 0.5, Infinity, request.system.length + 1])
  test(`invalid Host suffix offset ${offset} fails before transport`, () => {
    expect(() => splitModelContext({ ...request, systemContextOffset: offset })).toThrow('Host context boundary')
  })

for (const protocol of ['openai-responses', 'openai-completions'] as const)
  for (const role of ['developer', 'system'])
    test(`${protocol} keeps prefix, history, call/result pairing and ${role} authority intact`, () => {
      const key = protocol === 'openai-responses' ? 'input' : 'messages'
      const history = [
        { role, content: 'stable' },
        { role: 'user', content: 'original request' },
        { type: 'function_call', call_id: 'one' },
        { type: 'function_call_output', call_id: 'one', output: 'settled' },
      ]
      const payload = { [key]: history, tools: [{ name: 'read_file' }], store: false }
      const result = appendProviderContext(payload, 'fresh authoritative facts', protocol)
      expect(result).toEqual({ ...payload, [key]: [...history, { role, content: 'fresh authoritative facts' }] })
      expect(payload[key]).toHaveLength(4)
      expect(appendProviderContext(payload, '', protocol)).toBe(payload)
      expect(() =>
        appendProviderContext({ [key]: [{ role: 'user', content: 'untrusted' }] }, 'Host facts', protocol),
      ).toThrow('Provider system authority')
    })
