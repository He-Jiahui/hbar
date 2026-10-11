import plugin from '@hbar/budget'
import type { RuntimeProcessContext } from '@hbar/runtime'
import { createRuntimePlugin } from './runtime-plugin-process'

export const create = (context: RuntimeProcessContext) => createRuntimePlugin(context, { plugins: [plugin] })
