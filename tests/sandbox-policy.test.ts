import { describe, expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import {
  resolvedSandboxProfileSchema,
  sandboxProfileBodySchema,
  type ResolvedSandboxProfile,
  type SandboxProfile,
} from '@hbar/contracts/sandbox'
import {
  BUILTIN_SANDBOX_PROFILES,
  evaluateSandbox,
  parseSandboxCommand,
  resolveSandboxProfile,
  type SandboxToolCall,
} from '@hbar/kernel'

const root = 'C:/Work/repo'
const posix = { workspaceRoot: '/work/repo', caseInsensitive: false }
const windows = { workspaceRoot: root, caseInsensitive: true }

function profile(overrides: Partial<ResolvedSandboxProfile>): ResolvedSandboxProfile {
  return resolvedSandboxProfileSchema.parse({
    version: 1,
    profileId: 'test',
    chain: [{ id: 'test', revision: 1 }],
    escalation: 'ask',
    filesystem: { default: 'read', grants: [] },
    commands: { rules: [] },
    network: { enabled: false },
    tools: { rules: [] },
    ...overrides,
  })
}

function stored(id: string, body: Partial<SandboxProfile>): SandboxProfile {
  return {
    id,
    builtin: false,
    name: id,
    description: '',
    extends: null,
    escalation: null,
    filesystem: { default: null, grants: [] },
    commands: { rules: [] },
    network: { enabled: null },
    tools: { rules: [] },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    ...body,
  }
}

const write = (path: string, base = root): SandboxToolCall => ({
  tool: 'write_file',
  effect: 'write',
  paths: [{ field: 'path', access: 'write', absolute: `${base}/${path}` }],
  command: null,
})
const shell = (command: string): SandboxToolCall => ({ tool: 'shell', effect: 'process', paths: [], command })

async function rejected(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HbarError) return error.code
    throw error
  }
  throw new Error('Expected rejection')
}

describe('sandbox profile resolution', () => {
  test('built-in workspace-write inherits read-only defaults and protects metadata', async () => {
    const resolved = await resolveSandboxProfile(':workspace-write', async () => null)
    expect(resolved.chain).toEqual([
      { id: ':workspace-write', revision: 0 },
      { id: ':read-only', revision: 0 },
    ])
    expect(resolved.escalation).toBe('ask')
    expect(resolved.network.enabled).toBe(false)
    expect(evaluateSandbox(resolved, write('src/a.ts'), windows).decision).toBe('allow')
    expect(evaluateSandbox(resolved, write('.git/config'), windows)).toMatchObject({
      decision: 'ask',
      escalated: true,
      reason: { kind: 'path', granted: 'read', grant: '.git' },
    })
    expect(Object.isFrozen(BUILTIN_SANDBOX_PROFILES[':read-only'].filesystem.grants)).toBe(true)
  })

  test('child scalars, grants, commands and tool rules override the parent', async () => {
    const profiles = new Map([
      [
        'base',
        stored('base', {
          escalation: 'ask',
          filesystem: { default: 'read', grants: [{ path: 'src', access: 'write' }] },
          commands: { rules: [{ pattern: 'git *', decision: 'allow' }] },
          network: { enabled: true },
          tools: { rules: [{ tool: 'web_fetch', decision: 'ask' }] },
        }),
      ],
      [
        'strict',
        stored('strict', {
          extends: 'base',
          escalation: 'deny',
          filesystem: { default: null, grants: [{ path: './src/', access: 'read' }] },
          commands: { rules: [{ pattern: 'git  *', decision: 'deny' }] },
          tools: { rules: [{ tool: 'web_fetch', decision: 'deny' }] },
        }),
      ],
    ])
    const resolved = await resolveSandboxProfile('strict', async (id) => profiles.get(id) ?? null)
    expect(resolved.escalation).toBe('deny')
    expect(resolved.network.enabled).toBe(true)
    expect(resolved.filesystem).toEqual({ default: 'read', grants: [{ path: './src/', access: 'read' }] })
    expect(resolved.commands.rules).toEqual([{ pattern: 'git  *', decision: 'deny' }])
    expect(resolved.tools.rules).toEqual([{ tool: 'web_fetch', decision: 'deny' }])
  })

  test('missing, cyclic and over-deep chains fail closed', async () => {
    expect(await rejected(resolveSandboxProfile('missing', async () => null))).toBe('SANDBOX_PROFILE_NOT_FOUND')
    const cyclic = new Map([
      ['a', stored('a', { extends: 'b' })],
      ['b', stored('b', { extends: 'a' })],
    ])
    expect(await rejected(resolveSandboxProfile('a', async (id) => cyclic.get(id) ?? null))).toBe(
      'SANDBOX_PROFILE_CYCLE',
    )
    const deep = new Map(
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'].map((id, index) => [
        id,
        stored(id, { extends: index === 5 ? null : `p${index + 1}` }),
      ]),
    )
    expect(await rejected(resolveSandboxProfile('p0', async (id) => deep.get(id) ?? null))).toBe(
      'SANDBOX_PROFILE_TOO_DEEP',
    )
    await resolveSandboxProfile('p1', async (id) => deep.get(id) ?? null)
  })

  test('a lookup returning a different id is not accepted', async () => {
    expect(await rejected(resolveSandboxProfile('a', async () => stored('b', {})))).toBe('SANDBOX_PROFILE_NOT_FOUND')
  })

  test('profile bodies reject duplicate normalized rules and parent traversal', () => {
    const body = {
      name: 'x',
      description: '',
      extends: null,
      escalation: null,
      filesystem: { default: null, grants: [] as { path: string; access: 'write' }[] },
      commands: { rules: [] },
      network: { enabled: null },
      tools: { rules: [] },
    }
    expect(sandboxProfileBodySchema.safeParse(body).success).toBe(true)
    const duplicate = {
      ...body,
      filesystem: {
        default: null,
        grants: [
          { path: 'src', access: 'write' as const },
          { path: './src/', access: 'write' as const },
        ],
      },
    }
    expect(sandboxProfileBodySchema.safeParse(duplicate).success).toBe(false)
    const traversal = {
      ...body,
      filesystem: { default: null, grants: [{ path: 'src/../..', access: 'write' as const }] },
    }
    expect(sandboxProfileBodySchema.safeParse(traversal).success).toBe(false)
    const control = {
      ...body,
      filesystem: { default: null, grants: [{ path: 'src\u0000x', access: 'write' as const }] },
      commands: { rules: [{ pattern: 'git\u001b *', decision: 'allow' as const }] },
    }
    const issues = sandboxProfileBodySchema.safeParse(control).error?.issues.map((issue) => issue.path.join('.'))
    expect(issues).toEqual(['filesystem.grants.0.path', 'commands.rules.0.pattern'])
  })
})

describe('sandbox path grants', () => {
  const zircon = profile({
    escalation: 'deny',
    filesystem: {
      default: 'read',
      grants: [
        { path: 'C:/Work/repo/engine/src', access: 'write' },
        { path: 'engine/src/generated', access: 'read' },
        { path: 'docs/**/*.md', access: 'write' },
        { path: '.env', access: 'none' },
        { path: 'D:/cargo-targets/zircon', access: 'write' },
        { path: 'Cargo.toml', access: 'write' },
      ],
    },
  })

  test('a directory grant covers its subtree and the most specific grant wins', () => {
    expect(evaluateSandbox(zircon, write('engine/src/lib.rs'), windows).decision).toBe('allow')
    expect(evaluateSandbox(zircon, write('engine/src/generated/out.rs'), windows)).toMatchObject({
      decision: 'deny',
      escalated: true,
      reason: { granted: 'read', grant: 'engine/src/generated' },
    })
    expect(evaluateSandbox(zircon, write('engine/Cargo.toml'), windows).decision).toBe('deny')
    expect(evaluateSandbox(zircon, write('Cargo.toml'), windows).decision).toBe('allow')
  })

  test('absolute grants inside the workspace compete with relative grants by depth', () => {
    const flipped = profile({
      filesystem: {
        default: 'read',
        grants: [
          { path: 'engine', access: 'write' },
          { path: 'C:/Work/repo/engine/vendor', access: 'read' },
        ],
      },
    })
    expect(evaluateSandbox(flipped, write('engine/vendor/x.rs'), windows).decision).toBe('ask')
    expect(evaluateSandbox(flipped, write('engine/main.rs'), windows).decision).toBe('allow')
  })

  test('globs match within segments, ** spans directories, and matches cover subtrees', () => {
    expect(evaluateSandbox(zircon, write('docs/guide/intro.md'), windows).decision).toBe('allow')
    expect(evaluateSandbox(zircon, write('docs/intro.md'), windows).decision).toBe('allow')
    expect(evaluateSandbox(zircon, write('docs/intro.txt'), windows).decision).toBe('deny')
  })

  test('explicit none is a hard deny even when escalation asks', () => {
    const asking = { ...zircon, escalation: 'ask' as const }
    expect(evaluateSandbox(asking, write('.env'), windows)).toMatchObject({ decision: 'deny', escalated: false })
    const read: SandboxToolCall = {
      tool: 'read_file',
      effect: 'read',
      paths: [{ field: 'path', access: 'read', absolute: `${root}/.env` }],
      command: null,
    }
    expect(evaluateSandbox(asking, read, windows).decision).toBe('deny')
  })

  test('paths outside the workspace only match absolute grants', () => {
    expect(evaluateSandbox(zircon, write('target/debug/a', 'D:/cargo-targets/zircon'), windows).decision).toBe('allow')
    expect(evaluateSandbox(zircon, write('x', 'D:/elsewhere'), windows).decision).toBe('deny')
  })

  test('case sensitivity follows the platform option and ties pick the stricter grant', () => {
    expect(evaluateSandbox(zircon, write('ENGINE/SRC/lib.rs'), windows).decision).toBe('allow')
    const sensitive = profile({ filesystem: { default: 'read', grants: [{ path: 'src', access: 'write' }] } })
    const upper: SandboxToolCall = {
      ...write('SRC/a.ts'),
      paths: [{ field: 'path', access: 'write', absolute: '/work/repo/SRC/a.ts' }],
    }
    expect(evaluateSandbox(sensitive, upper, posix).decision).toBe('ask')
    const tie = profile({
      filesystem: {
        default: 'write',
        grants: [
          { path: 'src', access: 'write' },
          { path: 'C:/Work/repo/src', access: 'read' },
        ],
      },
    })
    expect(evaluateSandbox(tie, write('src/a.ts'), windows).decision).toBe('ask')
  })

  test('every path argument must be granted', () => {
    const move: SandboxToolCall = {
      tool: 'move_file',
      effect: 'write',
      paths: [
        { field: 'from', access: 'write', absolute: `${root}/engine/src/a.rs` },
        { field: 'to', access: 'write', absolute: `${root}/README.md` },
      ],
      command: null,
    }
    expect(evaluateSandbox(zircon, move, windows)).toMatchObject({
      decision: 'deny',
      reason: { field: 'to', path: 'README.md' },
    })
  })
})

describe('sandbox command rules', () => {
  const rules = profile({
    commands: {
      rules: [
        { pattern: 'git *', decision: 'allow' },
        { pattern: 'git push *', decision: 'ask' },
        { pattern: 'cargo test *', decision: 'allow' },
        { pattern: 'bun run test', decision: 'allow' },
        { pattern: 'rm *', decision: 'deny' },
        { pattern: 'npm run lint:*', decision: 'allow' },
      ],
    },
  })

  test('prefix and exact patterns match words, and the strictest matching rule wins', () => {
    expect(evaluateSandbox(rules, shell('git status'), windows).decision).toBe('allow')
    expect(evaluateSandbox(rules, shell('git'), windows).decision).toBe('allow')
    expect(evaluateSandbox(rules, shell('git push origin main'), windows).decision).toBe('ask')
    expect(evaluateSandbox(rules, shell('bun run test'), windows).decision).toBe('allow')
    expect(evaluateSandbox(rules, shell('bun run test --watch'), windows)).toMatchObject({
      decision: 'ask',
      escalated: true,
    })
    expect(evaluateSandbox(rules, shell('npm run lint:fix'), windows).decision).toBe('allow')
    expect(evaluateSandbox(rules, shell('C:\\Git\\cmd\\GIT.EXE log'), windows).decision).toBe('allow')
  })

  test('every segment of a compound command must be allowed and a deny anywhere wins', () => {
    expect(evaluateSandbox(rules, shell('git add -A && cargo test --all | git log'), windows).decision).toBe('allow')
    expect(evaluateSandbox(rules, shell('git status; whoami'), windows)).toMatchObject({
      decision: 'ask',
      reason: { kind: 'command', segment: 'whoami', rule: null },
    })
    expect(evaluateSandbox(rules, shell('git status || rm -rf /'), windows)).toMatchObject({
      decision: 'deny',
      escalated: false,
      reason: { rule: 'rm *' },
    })
  })

  test('substitution, redirection and background operators are never auto-allowed', () => {
    for (const command of [
      'git log > out.txt',
      'git status &',
      'git $(whoami)',
      'git `whoami`',
      'git "$(whoami)"',
      'git @(1)',
      'git log "unterminated',
    ])
      expect(evaluateSandbox(rules, shell(command), windows)).toMatchObject({ decision: 'ask', escalated: true })
    expect(evaluateSandbox(rules, shell('git $(rm -rf x)'), windows).decision).toBe('deny')
    expect(evaluateSandbox(rules, shell('cargo test 2>&1'), windows).decision).toBe('allow')
  })

  test('quoted separators stay inside one word', () => {
    expect(parseSandboxCommand(`git commit -m "a; b && c" -m 'x | y'`)).toEqual({
      segments: [['git', 'commit', '-m', 'a; b && c', '-m', 'x | y']],
      unsafe: null,
    })
    expect(parseSandboxCommand(`echo ''`)).toEqual({ segments: [['echo', '']], unsafe: null })
    expect(evaluateSandbox(rules, shell(`git commit -m "a; rm -rf /"`), windows).decision).toBe('allow')
  })

  test('escalation deny refuses unmatched commands; empty commands are outside the profile', () => {
    const strict = { ...rules, escalation: 'deny' as const }
    expect(evaluateSandbox(strict, shell('whoami'), windows).decision).toBe('deny')
    expect(evaluateSandbox(rules, shell('   '), windows)).toMatchObject({ decision: 'ask', escalated: true })
  })

  test('command matching is case-sensitive unless requested', () => {
    expect(evaluateSandbox(rules, shell('GIT status'), posix).decision).toBe('ask')
    expect(evaluateSandbox(rules, shell('GIT status'), windows).decision).toBe('allow')
  })
})

describe('sandbox effects and tool rules', () => {
  const base = profile({ network: { enabled: false }, tools: { rules: [{ tool: 'web_fetch', decision: 'allow' }] } })

  test('read tools without paths are allowed and undeclared side effects escalate', () => {
    expect(evaluateSandbox(base, { tool: 'list_models', effect: 'read', paths: [], command: null }, windows)).toEqual({
      decision: 'allow',
      reason: { kind: 'read-effect' },
      escalated: false,
    })
    expect(evaluateSandbox(base, { tool: 'plugin_write', effect: 'write', paths: [], command: null }, windows)).toEqual(
      { decision: 'ask', reason: { kind: 'undeclared-effect', effect: 'write' }, escalated: true },
    )
    expect(
      evaluateSandbox(base, { tool: 'computer_click', effect: 'process', paths: [], command: null }, windows).decision,
    ).toBe('ask')
  })

  test('network follows the profile unless a tool rule trusts the tool', () => {
    expect(
      evaluateSandbox(base, { tool: 'browser_open', effect: 'network', paths: [], command: null }, windows),
    ).toEqual({ decision: 'ask', reason: { kind: 'network', enabled: false }, escalated: true })
    expect(
      evaluateSandbox(base, { tool: 'web_fetch', effect: 'network', paths: [], command: null }, windows).decision,
    ).toBe('allow')
    expect(
      evaluateSandbox(
        { ...base, network: { enabled: true } },
        { tool: 'browser_open', effect: 'network', paths: [], command: null },
        windows,
      ).decision,
    ).toBe('allow')
  })

  test('a tool allow rule does not bypass path grants, and deny or ask rules are floors', () => {
    const trusted = profile({
      filesystem: { default: 'read', grants: [] },
      tools: {
        rules: [
          { tool: 'write_file', decision: 'allow' },
          { tool: 'read_file', decision: 'deny' },
          { tool: 'shell', decision: 'ask' },
        ],
      },
      commands: { rules: [{ pattern: 'git *', decision: 'allow' }] },
    })
    expect(evaluateSandbox(trusted, write('src/a.ts'), windows)).toMatchObject({
      decision: 'ask',
      reason: { kind: 'path' },
    })
    const read: SandboxToolCall = {
      tool: 'read_file',
      effect: 'read',
      paths: [{ field: 'path', access: 'read', absolute: `${root}/a` }],
      command: null,
    }
    expect(evaluateSandbox(trusted, read, windows)).toMatchObject({ decision: 'deny', reason: { kind: 'tool-rule' } })
    expect(evaluateSandbox(trusted, shell('git status'), windows)).toMatchObject({
      decision: 'ask',
      escalated: false,
      reason: { kind: 'tool-rule' },
    })
  })
})
