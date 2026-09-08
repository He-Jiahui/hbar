import { z } from 'zod'
import { definePlugin } from '@hbar/plugin-sdk'

export default definePlugin({
  manifest: {
    id: 'hbar-example-observer',
    name: 'Workspace observer',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    description: 'A local plugin with a tool, settings and a disposable panel.',
    clientEntry: 'client.ts',
    requires: { storage: '^1.0.0' },
    permissions: ['storage'],
  },
  configSchema: z.object({ greeting: z.string().max(300).default('Workspace ready') }),
  apply(ctx, config) {
    ctx.hbar.api.tools.register({
      name: 'workspace_status',
      description: 'Read the current session and workspace identity.',
      effect: 'read',
      inputSchema: z.object({}),
      async execute(_args, { session, workspace }) {
        return { text: `${config.greeting}\n${workspace.path}\nSession: ${session.id}` }
      },
    })
    ctx.hbar.api.panels.register({
      id: 'status',
      title: 'Workspace observer',
      placement: 'right',
      kind: 'markdown',
      content: `### Workspace observer\n\n${config.greeting}`,
    })
    ctx.hbar.api.hooks.on('run.end', async ({ sessionId, runId, status }) => {
      await ctx.hbar.api.sessions.append(sessionId, 'example.observed', { status }, runId)
    })
  },
})
