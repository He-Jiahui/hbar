import { z } from 'zod'
import type { ToolDefinition } from '@hbar/plugin-sdk'

const controlNames = new Set(['get_goal', 'get_plan', 'get_workflow', 'workflow_checkpoint', 'workflow_expand_scope'])
const supported = new Set([
  '$schema',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'anyOf',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'description',
  'default',
])
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unsupported schema node')
  return value as Record<string, unknown>
}

/** Presentation only. Unsupported schema forms retain their original native advertisement. */
export function sequenceControlCatalog(
  tools: readonly ToolDefinition[],
  scopeGatedNames: ReadonlySet<string> = new Set(),
) {
  const names = new Set<string>()
  const declarations: string[] = []
  const descriptions = new Map<string, string>()
  let hasScopeGated = false
  let nodes = 0
  const format = (value: unknown, depth: number, optionalVersions = false): string => {
    if (depth > 8 || ++nodes > 256) throw new Error('Schema exceeds the compact catalog traversal bound')
    const node = record(value)
    if (Object.keys(node).some((key) => !supported.has(key))) throw new Error('Unsupported schema keyword')
    let type: string
    if (Array.isArray(node.anyOf)) type = node.anyOf.map((item) => format(item, depth + 1)).join('|')
    else if (Array.isArray(node.enum)) type = node.enum.map((item) => JSON.stringify(item)).join('|')
    else if ('const' in node) type = JSON.stringify(node.const)
    else if (node.type === 'object') {
      if (node.additionalProperties !== false && node.additionalProperties !== undefined)
        throw new Error('Open object schemas retain native declarations')
      const required = new Set(Array.isArray(node.required) ? node.required : [])
      const properties = Object.entries(record(node.properties ?? {}))
      if (properties.length > 32) throw new Error('Too many catalog fields')
      type = `{${properties
        .map(([key, child]) => {
          const optional =
            !required.has(key) || (optionalVersions && ['expectedFocusRevision', 'expectedPlanRevision'].includes(key))
          return `${JSON.stringify(key)}${optional ? '?' : ''}:${format(child, depth + 1)}`
        })
        .join(',')}}`
    } else if (node.type === 'array') type = `Array<${format(node.items, depth + 1)}>`
    else if (typeof node.type === 'string' && ['string', 'integer', 'number', 'boolean', 'null'].includes(node.type))
      type = node.type
    else throw new Error('Unsupported schema type')
    const constraints = [
      ['minimum', '>='],
      ['maximum', '<='],
      ['exclusiveMinimum', '>'],
      ['exclusiveMaximum', '<'],
      ['minLength', 'length>='],
      ['maxLength', 'length<='],
      ['minItems', 'items>='],
      ['maxItems', 'items<='],
      ['pattern', 'pattern='],
      ['default', 'default='],
    ].flatMap(([key, label]) => (key && key in node ? [`${label}${JSON.stringify(node[key])}`] : []))
    if (constraints.length) type += `[${constraints.join(';')}]`
    if (typeof node.description === 'string' && node.description) {
      if (!descriptions.has(node.description)) descriptions.set(node.description, `d${descriptions.size + 1}`)
      type += `@${descriptions.get(node.description)}`
    }
    return type
  }
  const render = (entries: readonly string[], withScopeGated = hasScopeGated) =>
    [
      '<workflow_sequence_controls>',
      'Call these signatures inside workflow_execute, not as separate functions; ? means optional. Omitted checkpoint versions bind to the Host batch-start snapshot; explicit values remain strict. Normal permissions, scope and verification gates apply.',
      ...(withScopeGated
        ? [
            'Scope-gated tools require explicit authorized scope expansion before use; standalone tools return next request for full text/images.',
          ]
        : []),
      ...entries,
      ...[...descriptions].map(([description, id]) => `${id}: ${JSON.stringify(description)}`),
      '</workflow_sequence_controls>',
    ].join('\n')
  const candidates = [
    ...tools.filter((tool) => controlNames.has(tool.name)),
    ...tools.filter((tool) => !controlNames.has(tool.name) && scopeGatedNames.has(tool.name)),
  ]
  for (const tool of candidates) {
    const before = new Map(descriptions)
    const beforeLength = render(declarations).length
    try {
      nodes = 0
      const schema = z.toJSONSchema(tool.inputSchema)
      const gated = scopeGatedNames.has(tool.name)
      const declaration = `${tool.name}(${format(schema, 0, tool.name === 'workflow_checkpoint')})${gated ? ` scope-gated; ${tool.effect}: ${JSON.stringify(tool.description)}` : ''}`
      if (declaration.length > 3_000) throw new Error('Catalog declaration too large')
      const afterLength = render([...declarations, declaration], hasScopeGated || gated).length
      if (afterLength > 8_000) throw new Error('Catalog capacity reached')
      if (
        gated &&
        afterLength - beforeLength >= JSON.stringify({ name: tool.name, description: tool.description, schema }).length
      )
        throw new Error('Compact form would not save context')
      declarations.push(declaration)
      names.add(tool.name)
      hasScopeGated ||= gated
    } catch {
      descriptions.clear()
      for (const [description, id] of before) descriptions.set(description, id)
    }
  }
  const text = render(declarations)
  return text.length <= 8_000 ? { names, text } : { names: new Set<string>(), text: '' }
}
