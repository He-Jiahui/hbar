import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { browserPageSchema, browserScreenshotSchema, browserSnapshotSchema, idSchema } from '../index'

const targetSchema = {
  sessionId: idSchema,
  contextId: idSchema.optional(),
  pageId: idSchema.optional(),
}
const targetArguments = [
  { field: 'sessionId', type: 'string' as const, flag: 'session' },
  { field: 'contextId', type: 'string' as const, flag: 'browser-context' },
  { field: 'pageId', type: 'string' as const, flag: 'page' },
]
const metadata = (id: string, kind: 'command' | 'query', stateEffect: 'none' | 'application' | 'external') => ({
  id,
  version: 1,
  owner: 'hbar.browser',
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
const statusSchema = z.strictObject({
  available: z.boolean(),
  contexts: z.array(browserPageSchema).max(128),
  history: z.array(z.string().max(4_000)).max(100),
})

export const browserCommands = {
  'browser.status': defineCommand(
    {
      ...metadata('browser.status', 'query', 'none'),
      cli: { arguments: [{ field: 'sessionId', type: 'string', flag: 'session' }] },
    },
    z.strictObject({ sessionId: idSchema }),
    statusSchema,
  ),
  'browser.navigate': defineCommand(
    {
      ...metadata('browser.navigate', 'command', 'external'),
      cli: {
        arguments: [{ field: 'url', type: 'string', position: 0 }, ...targetArguments],
      },
    },
    z.strictObject({ ...targetSchema, url: z.string().url().max(4_000) }),
    browserPageSchema,
  ),
  'browser.snapshot': defineCommand(
    { ...metadata('browser.snapshot', 'query', 'none'), cli: { arguments: targetArguments } },
    z.strictObject(targetSchema),
    browserSnapshotSchema,
  ),
  'browser.click': defineCommand(
    {
      ...metadata('browser.click', 'command', 'external'),
      cli: { arguments: [{ field: 'selector', type: 'string', position: 0 }, ...targetArguments] },
    },
    z.strictObject({ ...targetSchema, selector: z.string().min(1).max(4_000) }),
    browserPageSchema,
  ),
  'browser.type': defineCommand(
    {
      ...metadata('browser.type', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'selector', type: 'string', position: 0 },
          { field: 'text', type: 'string', position: 1 },
          ...targetArguments,
        ],
      },
    },
    z.strictObject({ ...targetSchema, selector: z.string().min(1).max(4_000), text: z.string().max(16_000) }),
    browserPageSchema,
  ),
  'browser.press': defineCommand(
    {
      ...metadata('browser.press', 'command', 'external'),
      cli: {
        arguments: [
          { field: 'key', type: 'string', position: 0 },
          { field: 'selector', type: 'string', flag: 'selector' },
          ...targetArguments,
        ],
      },
    },
    z.strictObject({
      ...targetSchema,
      key: z.string().min(1).max(100),
      selector: z.string().max(4_000).optional(),
    }),
    browserPageSchema,
  ),
  'browser.screenshot': defineCommand(
    {
      ...metadata('browser.screenshot', 'query', 'none'),
      cli: { arguments: [...targetArguments, { field: 'fullPage', type: 'boolean', flag: 'full-page' }] },
    },
    z.strictObject({ ...targetSchema, fullPage: z.boolean().default(false) }),
    browserScreenshotSchema,
  ),
  'browser.evaluate': defineCommand(
    {
      ...metadata('browser.evaluate', 'command', 'external'),
      visibility: 'advanced',
      cli: { arguments: [{ field: 'expression', type: 'string', position: 0 }, ...targetArguments] },
    },
    z.strictObject({ ...targetSchema, expression: z.string().min(1).max(16_000) }),
    z.strictObject({ value: z.unknown() }),
  ),
  'browser.close': defineCommand(
    {
      ...metadata('browser.close', 'command', 'application'),
      cli: { arguments: targetArguments },
    },
    z.strictObject(targetSchema),
    z.strictObject({ closed: z.boolean() }),
  ),
  'browser.history': defineCommand(
    {
      ...metadata('browser.history', 'query', 'none'),
      cli: { arguments: targetArguments.filter((argument) => argument.field !== 'pageId') },
    },
    z.strictObject({ sessionId: idSchema, contextId: idSchema.optional() }),
    z.array(z.string().max(4_000)).max(100),
  ),
}
