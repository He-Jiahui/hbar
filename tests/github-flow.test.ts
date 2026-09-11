import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

async function source(path: string): Promise<string> {
  return readFile(join(root, path), 'utf8')
}

test('verify workflow is a deterministic, least-privilege required gate', async () => {
  const workflow = await source('.github/workflows/verify.yml')

  expect(workflow).toContain('pull_request:')
  expect(workflow).toContain('types: [opened, synchronize, reopened, ready_for_review]')
  expect(workflow).toContain('push:')
  expect(workflow).toContain('branches: [master]')
  expect(workflow).toContain('contents: read')
  expect(workflow).toContain('bun-version-file: package.json')
  expect(workflow).toContain('bun install --frozen-lockfile')
  expect(workflow).toContain('run: bun run check')
  expect(workflow).toContain('run: bun run check:docs')
  expect(workflow).toContain('run: bun run build')
  expect(workflow).not.toContain('secrets.')
  expect(workflow).not.toContain('pull_request_target')
})

test('PR triage only handles metadata with trusted base code', async () => {
  const workflow = await source('.github/workflows/pr-triage.yml')

  expect(workflow).toContain('pull_request_target:')
  expect(workflow).toContain('branches: [master]')
  expect(workflow).toContain('contents: read')
  expect(workflow).toContain('issues: write')
  expect(workflow).toContain('pull-requests: write')
  expect(workflow).toContain('actions/github-script@v7')
  expect(workflow).toContain('pulls.listFiles')
  expect(workflow).toContain('hbar-pr-triage')
  expect(workflow).not.toContain('actions/checkout')
  expect(workflow).not.toContain('pull_request.head')
  expect(workflow).not.toContain('secrets.')
})

test('Wiki publisher is master-only and does not put its token in a remote URL', async () => {
  const workflow = await source('.github/workflows/publish-wiki.yml')

  expect(workflow).toContain('branches: [master]')
  expect(workflow).toContain('HBAR_WIKI_PUSH_TOKEN')
  expect(workflow).toContain("github.ref == 'refs/heads/master'")
  expect(workflow).toContain('contents: read')
  expect(workflow).not.toContain('x-access-token:${WIKI_PUSH_TOKEN}@')
  expect(workflow).not.toContain('pull_request:')
})

test('repository intake documents ownership and evidence expectations', async () => {
  const owners = await source('.github/CODEOWNERS')
  const pullRequest = await source('.github/pull_request_template.md')
  const issueConfig = await source('.github/ISSUE_TEMPLATE/config.yml')

  expect(owners).toContain('/.github/ @He-Jiahui')
  expect(owners).toContain('/docs/wiki/ @He-Jiahui')
  expect(pullRequest).toContain('## Scope')
  expect(pullRequest).toContain('## Verification')
  expect(pullRequest).toContain('## Compatibility, risk, and rollback')
  expect(issueConfig).toContain('blank_issues_enabled: false')
})
