import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin } from '@hbar/plugin-sdk'
import type { Approval } from '@hbar/contracts'

const root = Bun.argv[2]!
const kernel = await Kernel.create({
  home: join(root, 'data'),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
  profile: {
    plugins: [
      definePlugin({
        manifest: {
          id: 'test.crash',
          name: 'Crash fixture',
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          description: '',
          permissions: ['fs'],
        },
        apply(ctx) {
          ctx.hbar.api.tools.register({
            name: 'crash_write',
            description: 'Write before being terminated',
            effect: 'write',
            inputSchema: z.object({}),
            async execute() {
              await writeFile(join(root, 'effect.txt'), 'executed once')
              console.log('SIDE_EFFECT_COMPLETE')
              await new Promise(() => {})
              return { text: 'unreachable' }
            },
          })
        },
      }),
    ],
  },
})
kernel.subscribe((event) => {
  if (event.method === 'session.event' && event.params.type === 'approval.requested')
    void kernel.resolveApproval((event.params.data as Approval).id, 'allowed')
})
const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
await kernel.submit(session.id, 'crash', { text: '/tool crash_write {}', images: [] }, 'local-fixture')
await kernel.waitForIdle()
