import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DecisionService, ToolDefinition } from '@hbar/plugin-sdk'
import { decisionRequestSchema } from '@hbar/contracts/decision'
import { layaConfigSchema } from './config'
import { LayaDecisionRuntime } from './runtime'

export { LayaDecisionRuntime } from './runtime'
export { ManagedLayaBackend } from './managed-backend'
export { DecisionBackendError } from './backend'
export type { DecisionBackend } from './backend'
export {
  layaConfigSchema,
  layaInstallationSchema,
  LAYA_RUNTIME_VERSION,
  LAYA_MODEL_REPO,
  LAYA_MODEL_REVISION,
} from './config'
export type { LayaConfig, LayaInstallation } from './config'
export { setupLaya } from './setup'
export type { LayaSetupOptions } from './setup'

// The Pi driver exports output JSON Schema. Keep defaults outside its input
// schema so omitted configuration reaches the Host validator and gets defaulted.
const toolInputSchema = decisionRequestSchema.extend({
  checkpoint: decisionRequestSchema.shape.checkpoint.removeDefault().optional(),
  profile: decisionRequestSchema.shape.profile.removeDefault().optional(),
})

export function decisionTool(runtime: DecisionService): ToolDefinition {
  return {
    name: 'decision_evaluate',
    description:
      'Evaluate bounded choice, binary or ordinal questions with local Laya. Returns uncalibrated advice and an audit ID. Preserve existing evidence, test and permission gates; truncated inputs need review.',
    inputSchema: toolInputSchema,
    effect: 'read',
    workspaceAccess: { kind: 'none' },
    async execute(args, context) {
      const value = await runtime.evaluate(decisionRequestSchema.parse(args), context.signal, {
        sessionId: context.session.id,
        runId: context.run.id,
      })
      return { text: JSON.stringify(value), details: value, isError: value.status !== 'evaluated' }
    },
  }
}

export default definePlugin({
  manifest: {
    id: '@hbar/decision-laya',
    packageName: '@hbar/decision-laya',
    name: 'Laya local decisions',
    version: '0.1.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    required: false,
    description: 'Advisory typed decisions through a managed local inference process',
    provides: { decision: '1.0.0' },
    permissions: ['process', 'network', 'storage'],
  },
  configSchema: layaConfigSchema,
  apply(ctx, rawConfig) {
    const runtime = new LayaDecisionRuntime(layaConfigSchema.parse(rawConfig), undefined, async (context, result) => {
      await ctx.hbar.api.sessions.append(context.sessionId, 'decision.evaluated', result, context.runId, context.stepId)
    })
    provide<DecisionService>(ctx, 'decision', runtime)
    ctx.effect(() => () => runtime.dispose())
    ctx.hbar.api.tools.register(decisionTool(runtime))
  },
})
