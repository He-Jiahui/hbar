import { HbarError } from '@hbar/contracts'
import type { Database } from 'bun:sqlite'
import {
  promptTemplateSchema,
  promptTemplateCommands,
  type PromptTemplate,
  type PromptTemplateDeleteInput,
  type PromptTemplateListInput,
  type PromptTemplateSaveInput,
} from '@hbar/contracts/commands/prompt-templates'
import { createFeatureCommandReceipts, type FeatureWriteIdentity } from './feature-command-receipts'

export const PROMPT_TEMPLATES_SQL = `
CREATE TABLE IF NOT EXISTS prompt_templates(
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  variablesJson TEXT NOT NULL,
  revision INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS prompt_templates_workspace_updated ON prompt_templates(workspaceId,updatedAt DESC,id DESC);
`

export function createPromptTemplateStorage(db: Database) {
  const receipts = createFeatureCommandReceipts(db)
  type TemplateRow = {
    id: string
    workspaceId: string
    name: string
    description: string
    body: string
    variablesJson: string
    revision: number
    createdAt: number
    updatedAt: number
  }
  const row = (value: unknown): PromptTemplate => promptTemplateSchema.parse(value)
  return {
    list(input: PromptTemplateListInput) {
      const limit = input.limit ?? 50
      const cursor = input.after ? input.after.split(':') : null
      const rows = cursor
        ? db
            .query<TemplateRow, [string, number, number, string, number]>(
              'SELECT * FROM prompt_templates WHERE workspaceId=? AND (updatedAt<? OR (updatedAt=? AND id<?)) ORDER BY updatedAt DESC,id DESC LIMIT ?',
            )
            .all(input.workspaceId, Number(cursor[0]), Number(cursor[0]), cursor[1]!, limit + 1)
        : db
            .query<TemplateRow, [string, number]>(
              'SELECT * FROM prompt_templates WHERE workspaceId=? ORDER BY updatedAt DESC,id DESC LIMIT ?',
            )
            .all(input.workspaceId, limit + 1)
      const items = rows.slice(0, limit).map((item) => {
        const { variablesJson: _variablesJson, ...rest } = item
        const raw: unknown = JSON.parse(String(_variablesJson))
        return row({ ...rest, variables: raw })
      })
      const last = items.at(-1)
      return { items, nextCursor: rows.length > limit && last ? `${last.updatedAt}:${last.id}` : null }
    },
    get(id: string) {
      const item = db.query<TemplateRow, [string]>('SELECT * FROM prompt_templates WHERE id=?').get(id)
      if (!item) return null
      const { variablesJson, ...rest } = item
      const raw: unknown = JSON.parse(String(variablesJson))
      return row({ ...rest, variables: raw })
    },
    receipt(
      commandId: 'promptTemplate.save' | 'promptTemplate.delete',
      input: PromptTemplateSaveInput | PromptTemplateDeleteInput,
      identity: FeatureWriteIdentity,
    ) {
      return receipts.lookup({ commandId, input, ...identity })
    },
    save(input: PromptTemplateSaveInput, identity?: FeatureWriteIdentity) {
      const id = input.id ?? crypto.randomUUID()
      return receipts.run('promptTemplate.save', input, identity, promptTemplateSchema, () => {
        if (!db.query('SELECT id FROM workspaces WHERE id=?').get(input.workspaceId))
          throw new HbarError('NOT_FOUND', 'Workspace not found')
        const now = Date.now()
        const current = db.query('SELECT revision,workspaceId FROM prompt_templates WHERE id=?').get(id) as {
          revision: number
          workspaceId: string
        } | null
        if (input.id && !current) throw new HbarError('COMMAND_CONFLICT', 'Prompt template no longer exists')
        if (current && current.workspaceId !== input.workspaceId)
          throw new HbarError('FORBIDDEN', 'Prompt template belongs to another workspace')
        if (input.id && (current?.revision ?? 0) !== (input.expectedRevision ?? 0))
          throw new HbarError('COMMAND_CONFLICT', 'Prompt template revision changed')
        const revision = (current?.revision ?? 0) + 1
        db.query(
          'INSERT INTO prompt_templates(id,workspaceId,name,description,body,variablesJson,revision,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,body=excluded.body,variablesJson=excluded.variablesJson,revision=excluded.revision,updatedAt=excluded.updatedAt',
        ).run(
          id,
          input.workspaceId,
          input.name,
          input.description,
          input.body,
          JSON.stringify(input.variables),
          revision,
          now,
          now,
        )
        const saved = this.get(id)
        if (!saved) throw new HbarError('INVALID_OUTPUT', 'Saved prompt template could not be read')
        return saved
      })
    },
    delete(input: PromptTemplateDeleteInput, identity?: FeatureWriteIdentity) {
      return receipts.run(
        'promptTemplate.delete',
        input,
        identity,
        promptTemplateCommands['promptTemplate.delete'].output,
        () => {
          const current = db
            .query('SELECT revision FROM prompt_templates WHERE id=? AND workspaceId=?')
            .get(input.id, input.workspaceId) as { revision: number } | null
          if (!current) return { deleted: false }
          if (current.revision !== input.expectedRevision)
            throw new HbarError('COMMAND_CONFLICT', 'Prompt template revision changed')
          return {
            deleted:
              db.query('DELETE FROM prompt_templates WHERE id=? AND workspaceId=?').run(input.id, input.workspaceId)
                .changes > 0,
          }
        },
      )
    },
  }
}
