import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { PolicyProvider } from '@hbar/plugin-sdk'
import type { KernelProfile } from '@hbar/kernel'

export default {
  replacements: {
    'policy.approval': definePlugin({
      manifest: {
        id: 'policy.readonly',
        name: 'Read-only policy',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        description: 'Only read operations are admitted by this startup profile.',
        permissions: [],
        provides: { policy: '1.0.0' },
      },
      apply(ctx) {
        provide<PolicyProvider>(ctx, 'policy', {
          async decide(tool) {
            return tool.effect === 'read' ? 'allow' : 'deny'
          },
        })
      },
    }),
  },
} satisfies KernelProfile
