import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { computerActionSchema, computerScreenSchema, idSchema } from '../index'

const appIdSchema = z.string().min(1).max(1_000)
const targetSchema = {
  sessionId: idSchema,
  appId: appIdSchema.optional(),
}
const targetArguments = [
  { field: 'sessionId', type: 'string' as const, flag: 'session' },
  { field: 'appId', type: 'string' as const, flag: 'app' },
]
const pointSchema = z.strictObject({
  ...targetSchema,
  x: z.number().int().min(0).max(10_000),
  y: z.number().int().min(0).max(10_000),
})
const pointArguments = [
  { field: 'x', type: 'number' as const, position: 0 },
  { field: 'y', type: 'number' as const, position: 1 },
  ...targetArguments,
]
const metadata = (id: string, kind: 'command' | 'query', stateEffect: 'none' | 'external') => ({
  id,
  version: 1,
  owner: 'hbar.computer',
  kind,
  execution: 'host' as const,
  stateEffect,
  category: 'files.tools',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
  cancelMode: 'cooperative' as const,
  timeoutMs: 120_000,
})

export const computerCommands = {
  'computer.status': defineCommand(
    {
      ...metadata('computer.status', 'query', 'none'),
      cli: { arguments: [{ field: 'sessionId', type: 'string', flag: 'session' }] },
    },
    z.strictObject({ sessionId: idSchema }),
    z.strictObject({ available: z.boolean(), platform: z.string().min(1).max(100), appId: appIdSchema.nullable() }),
  ),
  'computer.screenshot': defineCommand(
    { ...metadata('computer.screenshot', 'query', 'none'), cli: { arguments: targetArguments } },
    z.strictObject(targetSchema),
    computerScreenSchema,
  ),
  'computer.click': defineCommand(
    { ...metadata('computer.click', 'command', 'external'), cli: { arguments: pointArguments } },
    pointSchema,
    computerActionSchema,
  ),
  'computer.doubleClick': defineCommand(
    { ...metadata('computer.doubleClick', 'command', 'external'), cli: { arguments: pointArguments } },
    pointSchema,
    computerActionSchema,
  ),
  'computer.type': defineCommand(
    {
      ...metadata('computer.type', 'command', 'external'),
      cli: { arguments: [{ field: 'text', type: 'string', position: 0 }, ...targetArguments] },
    },
    z.strictObject({ ...targetSchema, text: z.string().max(16_000) }),
    computerActionSchema,
  ),
  'computer.key': defineCommand(
    {
      ...metadata('computer.key', 'command', 'external'),
      cli: { arguments: [{ field: 'key', type: 'string', position: 0 }, ...targetArguments] },
    },
    z.strictObject({ ...targetSchema, key: z.string().min(1).max(100) }),
    computerActionSchema,
  ),
  'computer.scroll': defineCommand(
    {
      ...metadata('computer.scroll', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'deltaY', type: 'number', position: 0 },
          { field: 'deltaX', type: 'number', flag: 'delta-x' },
          ...targetArguments,
        ],
      },
    },
    z.strictObject({
      ...targetSchema,
      deltaX: z.number().int().min(-10_000).max(10_000).default(0),
      deltaY: z.number().int().min(-10_000).max(10_000),
    }),
    computerActionSchema,
  ),
  'computer.move': defineCommand(
    { ...metadata('computer.move', 'command', 'external'), cli: { arguments: pointArguments } },
    pointSchema,
    computerActionSchema,
  ),
  'computer.wait': defineCommand(
    {
      ...metadata('computer.wait', 'command', 'external'),
      cli: { arguments: [{ field: 'milliseconds', type: 'number', position: 0 }, ...targetArguments] },
    },
    z.strictObject({ ...targetSchema, milliseconds: z.number().int().min(0).max(60_000) }),
    computerActionSchema,
  ),
  'computer.launch': defineCommand(
    {
      ...metadata('computer.launch', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'appId', type: 'string', position: 0 },
          { field: 'sessionId', type: 'string', flag: 'session' },
        ],
      },
    },
    z.strictObject({ sessionId: idSchema, appId: appIdSchema }),
    computerActionSchema,
  ),
}
