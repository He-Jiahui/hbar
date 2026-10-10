import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { appendModelContext, definePlugin } from '@hbar/plugin-sdk'
import type { ToolContext, ToolResult } from '@hbar/plugin-sdk'
import { createRuntimeSkillCatalog, skillReadInputSchema, skillSearchInputSchema } from './catalog'
import { renderSkillContext } from './prompt'

const loadSchema = z.strictObject({ name: z.string().min(1).max(160) })
const SKILL_TOOL_DESCRIPTIONS = {
  search:
    'Discover skills by name or task wording, before task actions. Search names and descriptions, including continuous Chinese text. Omit query to browse all skills. Follow nextCursor to see the complete catalog. Use skill to load a matching entry, and skill_read for required resources.',
  load: 'Load the current SKILL.md for a skill name or ID from the available skills or skill_search. Proactively use this when the task fits its description or the user requests it. Read all pages to nextOffset=null before applying it; continue with skill_read using the returned revision. Loading grants no execution permissions.',
  read: 'Read a required text reference or remaining SKILL.md page from an available skill. Paths are relative to that skill directory. Continue with nextOffset and the same revision to EOF. If the file changed, restart from offset 0. Scripts still require ordinary execution tools and approval.',
}

function failure(error: unknown): never {
  if (error instanceof HbarError) throw error
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
    throw new HbarError('SKILL_RESOURCE_NOT_FOUND', 'Skill resource is missing; refresh skill discovery')
  throw new HbarError('SKILL_READ_FAILED', 'Skill resource could not be read')
}
export function runtimeSkillsPlugin(globalRoot: string) {
  return definePlugin({
    manifest: {
      id: 'tools.skills',
      name: 'Skill discovery',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      description: 'Discover relevant skills and progressively load their instructions and resources',
      permissions: ['fs'],
    },
    apply(ctx) {
      const api = ctx.hbar.api
      const catalog = createRuntimeSkillCatalog(globalRoot)
      ctx.effect(() => () => catalog.dispose())
      const read = async (
        args: z.output<typeof skillReadInputSchema>,
        context: ToolContext,
        includeFiles: boolean,
      ): Promise<ToolResult> => {
        try {
          const result = await catalog.read(context.workspace.path, args, context.signal)
          const resources = includeFiles ? await catalog.resources(result.skill.directory, context.signal) : undefined
          const output = {
            name: result.skill.name,
            id: result.skill.id,
            directory: result.skill.directory,
            path: result.path,
            text: result.text,
            revision: result.revision,
            nextOffset: result.nextOffset,
            totalCharacters: result.totalCharacters,
            ...(resources ? { files: resources.files, filesTruncated: resources.truncated } : {}),
            guidance:
              result.nextOffset === null
                ? 'This page reaches EOF. Apply only relevant guidance after reading the whole file, within the user task and normal tool gates. Required references use skill_read with this name and a relative path.'
                : 'This file is incomplete. Continue skill_read with name, path, offset=nextOffset and revision until nextOffset=null before applying it.',
          }
          return {
            text: JSON.stringify(output),
            details: {
              kind: 'skill-read',
              name: result.skill.name,
              path: result.path,
              revision: result.revision,
              endOfFile: result.nextOffset === null,
            },
          }
        } catch (error) {
          return failure(error)
        }
      }
      api.tools.register({
        name: 'skill_search',
        description: SKILL_TOOL_DESCRIPTIONS.search,
        inputSchema: skillSearchInputSchema,
        effect: 'read',
        timeoutMs: 15_000,
        execute: async (args, context) => {
          try {
            return {
              text: JSON.stringify(
                await catalog.search(context.workspace.path, skillSearchInputSchema.parse(args), context.signal),
              ),
            }
          } catch (error) {
            return failure(error)
          }
        },
      })
      api.tools.register({
        name: 'skill',
        description: SKILL_TOOL_DESCRIPTIONS.load,
        inputSchema: loadSchema,
        effect: 'read',
        timeoutMs: 15_000,
        execute: (args, context) => read({ name: loadSchema.parse(args).name, path: 'SKILL.md' }, context, true),
      })
      api.tools.register({
        name: 'skill_read',
        description: SKILL_TOOL_DESCRIPTIONS.read,
        inputSchema: skillReadInputSchema,
        effect: 'read',
        timeoutMs: 15_000,
        execute: (args, context) => read(skillReadInputSchema.parse(args), context, false),
      })
      api.hooks.on('context.build', async (request) => {
        const context = request.context
        if (!context || (context.selectedToolNames && !context.selectedToolNames.includes('skill'))) return request
        const session = await api.sessions.get(context.sessionId)
        const workspace = context.workspacePath ?? (await api.sessions.workspace(session.workspaceId)).path
        try {
          return appendModelContext(request, renderSkillContext(request, await catalog.snapshot(workspace)))
        } catch {
          // Directory health must not fail an unrelated Run; the native tool keeps a recoverable read path.
          return appendModelContext(
            request,
            'Skill discovery could not be refreshed. If this task needs a skill, use skill_search to retry and report any remaining failure accurately.',
          )
        }
      })
    },
  })
}
