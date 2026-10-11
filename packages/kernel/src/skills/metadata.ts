import { z } from 'zod'
import { HbarError } from '@hbar/contracts'

const policySchema = z.object({ allow_implicit_invocation: z.boolean().optional() })
const metadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .refine(
      (value) =>
        !/[\\/]/u.test(value) &&
        ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
    )
    .optional(),
  description: z.string().trim().max(2_000).optional(),
  'disable-model-invocation': z.boolean().optional(),
  policy: policySchema.optional(),
})

export function parseSkillMetadata(text: string, fallbackName: string) {
  const source = text.replace(/^\uFEFF/u, '')
  const header = /^---\s*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/u.exec(source)
  if (source.startsWith('---') && !header)
    throw new HbarError('INVALID_SKILL_METADATA', 'Skill frontmatter is incomplete or exceeds its size limit')
  const data = header ? metadataSchema.safeParse(parseSkillYaml(header[1] ?? '')) : metadataSchema.safeParse({})
  if (!data.success) throw new HbarError('INVALID_SKILL_METADATA', 'Skill name, description or policy is invalid')
  const name = data.data.name ?? fallbackName
  if (!metadataSchema.safeParse({ name }).success)
    throw new HbarError('INVALID_SKILL_METADATA', 'Skill directory name is not a valid fallback name')
  const body = header ? source.slice(header[0].length) : source
  const fallbackDescription =
    body
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#') && !line.startsWith('```'))
      ?.slice(0, 500) ?? ''
  return {
    name,
    description: data.data.description ?? fallbackDescription,
    implicit: data.data['disable-model-invocation'] !== true && data.data.policy?.allow_implicit_invocation !== false,
  }
}
export function parseSkillYaml(source: string): unknown {
  try {
    return Bun.YAML.parse(source)
  } catch {
    throw new HbarError('INVALID_SKILL_METADATA', 'Skill metadata is not valid YAML')
  }
}
export function parseSkillImplicitPolicy(source: string): boolean {
  const metadata = z.object({ policy: policySchema.optional() }).safeParse(parseSkillYaml(source))
  if (!metadata.success) throw new HbarError('INVALID_SKILL_METADATA', 'Skill invocation policy is invalid')
  return metadata.data.policy?.allow_implicit_invocation !== false
}
