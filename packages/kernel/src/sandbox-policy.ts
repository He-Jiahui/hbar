import { HbarError } from '@hbar/contracts'
import {
  BUILTIN_SANDBOX_PROFILE_IDS,
  SANDBOX_MAX_EXTENDS_DEPTH,
  SANDBOX_PROFILE_SCHEMA_VERSION,
  resolvedSandboxProfileSchema,
  sandboxCommandKey,
  sandboxPathKey,
  type BuiltinSandboxProfileId,
  type ResolvedSandboxProfile,
  type SandboxCommandRule,
  type SandboxDecision,
  type SandboxEscalation,
  type SandboxPathAccess,
  type SandboxPathGrant,
  type SandboxProfile,
  type SandboxProfileId,
  type SandboxToolRule,
} from '@hbar/contracts/sandbox'

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/** Display names are fallbacks; clients localize built-in profiles by id. */
export const BUILTIN_SANDBOX_PROFILES: Readonly<Record<BuiltinSandboxProfileId, SandboxProfile>> = deepFreeze({
  ':read-only': {
    id: ':read-only',
    builtin: true,
    name: 'Read only',
    description: 'Reads inside the workspace. Writes, commands and network access are outside the profile.',
    extends: null,
    escalation: 'ask',
    filesystem: { default: 'read', grants: [] },
    commands: { rules: [] },
    network: { enabled: false },
    tools: { rules: [] },
    revision: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  ':workspace-write': {
    id: ':workspace-write',
    builtin: true,
    name: 'Workspace write',
    description:
      'Writes inside the workspace except .git and .hbar. Commands and network access are outside the profile.',
    extends: ':read-only',
    escalation: null,
    filesystem: {
      default: null,
      grants: [
        { path: '.', access: 'write' },
        { path: '.git', access: 'read' },
        { path: '.hbar', access: 'read' },
      ],
    },
    commands: { rules: [] },
    network: { enabled: null },
    tools: { rules: [] },
    revision: 0,
    createdAt: 0,
    updatedAt: 0,
  },
})

export function isBuiltinSandboxProfileId(id: string): id is BuiltinSandboxProfileId {
  return (BUILTIN_SANDBOX_PROFILE_IDS as readonly string[]).includes(id)
}

export type SandboxProfileLookup = (id: SandboxProfileId) => Promise<SandboxProfile | null>

/** Merge the selected profile over its ancestors. Built-ins are never looked up in storage. */
export async function resolveSandboxProfile(
  id: SandboxProfileId,
  lookup: SandboxProfileLookup,
): Promise<ResolvedSandboxProfile> {
  const chain: SandboxProfile[] = []
  const seen = new Set<string>()
  let next: SandboxProfileId | null = id
  while (next !== null) {
    if (seen.has(next)) throw new HbarError('SANDBOX_PROFILE_CYCLE', `Sandbox profile ${next} extends itself`)
    if (chain.length > SANDBOX_MAX_EXTENDS_DEPTH)
      throw new HbarError(
        'SANDBOX_PROFILE_TOO_DEEP',
        `Sandbox profile ${id} extends more than ${SANDBOX_MAX_EXTENDS_DEPTH} profiles`,
      )
    const profile: SandboxProfile | null = isBuiltinSandboxProfileId(next)
      ? BUILTIN_SANDBOX_PROFILES[next]
      : await lookup(next)
    if (!profile || profile.id !== next)
      throw new HbarError('SANDBOX_PROFILE_NOT_FOUND', `Sandbox profile ${next} does not exist`)
    seen.add(next)
    chain.push(profile)
    next = profile.extends
  }
  let escalation: SandboxEscalation = 'ask'
  let fileDefault: SandboxPathAccess = 'read'
  let network = false
  const grants = new Map<string, SandboxPathGrant>()
  const commands = new Map<string, SandboxCommandRule>()
  const tools = new Map<string, SandboxToolRule>()
  const override = <Item>(map: Map<string, Item>, key: string, item: Item) => {
    map.delete(key)
    map.set(key, item)
  }
  for (const profile of [...chain].reverse()) {
    escalation = profile.escalation ?? escalation
    fileDefault = profile.filesystem.default ?? fileDefault
    network = profile.network.enabled ?? network
    for (const grant of profile.filesystem.grants) override(grants, sandboxPathKey(grant.path), grant)
    for (const rule of profile.commands.rules) override(commands, sandboxCommandKey(rule.pattern), rule)
    for (const rule of profile.tools.rules) override(tools, rule.tool, rule)
  }
  return resolvedSandboxProfileSchema.parse({
    version: SANDBOX_PROFILE_SCHEMA_VERSION,
    profileId: id,
    chain: chain.map((profile) => ({ id: profile.id, revision: profile.revision })),
    escalation,
    filesystem: { default: fileDefault, grants: [...grants.values()] },
    commands: { rules: [...commands.values()] },
    network: { enabled: network },
    tools: { rules: [...tools.values()] },
  })
}

// ── Paths ──────────────────────────────────────────────────────────────────

/** POSIX-style absolute path without a trailing slash, except for a root such as `C:/` or `/`. */
export function normalizeSandboxAbsolutePath(path: string): string {
  const slashes = path.replaceAll('\\', '/').replace(/(?!^)\/{2,}/g, '/')
  if (/^[A-Za-z]:\/?$/.test(slashes)) return `${slashes.slice(0, 2)}/`
  return slashes.length > 1 ? slashes.replace(/\/+$/, '') : slashes
}

function isAbsolutePattern(key: string) {
  return /^[A-Za-z]:\//.test(key) || key.startsWith('/')
}

function within(root: string, path: string, caseInsensitive: boolean): string | null {
  const a = caseInsensitive ? root.toLowerCase() : root
  const b = caseInsensitive ? path.toLowerCase() : path
  if (a === b) return ''
  const prefix = a.endsWith('/') ? a : `${a}/`
  return b.startsWith(prefix) ? path.slice(prefix.length) : null
}

const GLOB = /[*?]/

function globSource(pattern: string): string {
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern.charAt(index)
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        source += '(?:[^/]*/)*'
        index += 2
      } else {
        source += '.*'
        index += 1
      }
    } else if (character === '*') source += '[^/]*'
    else if (character === '?') source += '[^/]'
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return source
}

interface CompiledGrant {
  readonly grant: SandboxPathGrant
  readonly scope: 'relative' | 'absolute'
  readonly specificity: number
  readonly test: (path: string) => boolean
  /** Whether the grant can apply to some path strictly below `path`. */
  readonly below: (path: string) => boolean
}

function descendantOf(parent: string): (path: string) => boolean {
  if (parent === '') return () => true
  const prefix = parent.endsWith('/') ? parent : `${parent}/`
  return (path) => path.startsWith(prefix)
}

function compileGrant(grant: SandboxPathGrant, workspaceRoot: string, caseInsensitive: boolean): CompiledGrant {
  let key = sandboxPathKey(grant.path)
  let scope: CompiledGrant['scope'] = 'relative'
  if (isAbsolutePattern(key)) {
    const absolute = normalizeSandboxAbsolutePath(key)
    const inside = within(workspaceRoot, absolute, caseInsensitive)
    if (inside === null) {
      key = absolute
      scope = 'absolute'
    } else key = inside
  }
  const segments = key === '' ? [] : key.split('/').filter(Boolean)
  const literal = segments.findIndex((segment) => GLOB.test(segment))
  const literalSegments = literal < 0 ? segments.length : literal
  const specificity = literalSegments * 2 + (literal < 0 ? 1 : 0)
  const fold = (path: string) => (caseInsensitive ? path.toLowerCase() : path)
  // Literal part before the first glob segment, keeping absolute roots such as `/` and `C:/`.
  const parts = key.split('/')
  const firstGlob = parts.findIndex((part) => GLOB.test(part))
  const head = firstGlob < 0 ? key : parts.slice(0, firstGlob).join('/')
  const literalPrefix = fold(/^[A-Za-z]:$/.test(head) ? `${head}/` : head === '' && key.startsWith('/') ? '/' : head)
  if (literal < 0) {
    const base = fold(key)
    const prefix = base === '' || base.endsWith('/') ? base : `${base}/`
    return {
      grant,
      scope,
      specificity,
      test: (path) => {
        const candidate = fold(path)
        return base === '' || candidate === base || candidate.startsWith(prefix)
      },
      below: (path) => base !== '' && descendantOf(fold(path))(base),
    }
  }
  const pattern = new RegExp(`^${globSource(key)}(?:/.*)?$`, caseInsensitive ? 'i' : '')
  return {
    grant,
    scope,
    specificity,
    test: (path) => pattern.test(path),
    // A glob may match below the path when its literal prefix is above, at or below it.
    below: (path) => {
      const candidate = fold(path)
      return (
        literalPrefix === '' ||
        candidate === literalPrefix ||
        descendantOf(candidate)(literalPrefix) ||
        descendantOf(literalPrefix)(candidate)
      )
    },
  }
}

const accessRank: Readonly<Record<SandboxPathAccess, number>> = { none: 0, read: 1, write: 2 }

// ── Commands ───────────────────────────────────────────────────────────────

export interface ParsedSandboxCommand {
  /** Words of each sequential or piped command, quotes removed. */
  readonly segments: readonly (readonly string[])[]
  /** First construct that makes the command ineligible for automatic approval. */
  readonly unsafe: string | null
}

/**
 * Split a shell command conservatively. Substitution, redirection, grouping and
 * background/call operators are reported as unsafe and also split segments so
 * deny rules still see the commands they contain. This is an admission filter;
 * it is not a shell parser and does not prove what a command will do.
 */
export function parseSandboxCommand(command: string): ParsedSandboxCommand {
  const segments: string[][] = []
  let words: string[] = []
  let word = ''
  let quoted = false
  let quote: "'" | '"' | null = null
  let unsafe: string | null = null
  const mark = (construct: string) => {
    unsafe ??= construct
  }
  const flushWord = () => {
    if (word || quoted) words.push(word)
    word = ''
    quoted = false
  }
  const flushSegment = () => {
    flushWord()
    if (words.length) segments.push(words)
    words = []
  }
  for (let index = 0; index < command.length; index++) {
    const character = command.charAt(index)
    const next = command[index + 1]
    if (quote === "'") {
      if (character === "'") quote = null
      else word += character
      continue
    }
    if (quote === '"') {
      if (character === '"') quote = null
      else {
        if (character === '`') mark('backtick')
        if (character === '$' && (next === '(' || next === '{')) mark('substitution')
        word += character
      }
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      quoted = true
      continue
    }
    if (/\s/.test(character) && character !== '\n' && character !== '\r') {
      flushWord()
      continue
    }
    if (command.startsWith('2>&1', index) && (!word || /\s/.test(command[index - 1] ?? ' '))) {
      flushWord()
      index += 3
      continue
    }
    if (character === '&' && next === '&') {
      flushSegment()
      index += 1
      continue
    }
    if (character === '|') {
      flushSegment()
      if (next === '|') index += 1
      continue
    }
    if (character === ';' || character === '\n' || character === '\r') {
      flushSegment()
      continue
    }
    const construct =
      character === '`'
        ? 'backtick'
        : character === '$' && (next === '(' || next === '{')
          ? 'substitution'
          : character === '@' && next === '('
            ? 'substitution'
            : character === '<' || character === '>'
              ? 'redirection'
              : character === '&'
                ? 'background or call operator'
                : character === '(' || character === ')' || character === '{' || character === '}'
                  ? 'grouping'
                  : null
    if (construct) {
      mark(construct)
      flushSegment()
      if (construct === 'substitution') index += 1
      continue
    }
    word += character
  }
  if (quote) mark('unbalanced quote')
  flushSegment()
  return { segments, unsafe }
}

function programName(word: string): string {
  const base = word.replaceAll('\\', '/').split('/').at(-1) ?? word
  return base.replace(/\.(?:exe|cmd|bat|com|ps1)$/i, '')
}

function wordMatcher(token: string, caseInsensitive: boolean): (word: string) => boolean {
  if (!GLOB.test(token))
    return caseInsensitive ? (word) => word.toLowerCase() === token.toLowerCase() : (word) => word === token
  const source = token
    .split('')
    .map((character) =>
      character === '*' ? '.*' : character === '?' ? '.' : character.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
    )
    .join('')
  const pattern = new RegExp(`^${source}$`, caseInsensitive ? 'i' : '')
  return (word) => pattern.test(word)
}

interface CompiledCommandRule {
  readonly rule: SandboxCommandRule
  readonly test: (words: readonly string[]) => boolean
}

function compileCommandRule(rule: SandboxCommandRule, caseInsensitive: boolean): CompiledCommandRule {
  const tokens = sandboxCommandKey(rule.pattern).split(' ')
  const open = tokens.length > 1 && tokens.at(-1) === '*'
  const fixed = (open ? tokens.slice(0, -1) : tokens).map((token, index) =>
    wordMatcher(index === 0 ? programName(token) : token, caseInsensitive),
  )
  return {
    rule,
    test: (words) => {
      if (open ? words.length < fixed.length : words.length !== fixed.length) return false
      return fixed.every((matches, index) => matches(index === 0 ? programName(words[0] ?? '') : (words[index] ?? '')))
    },
  }
}

// ── Evaluation ─────────────────────────────────────────────────────────────

export interface SandboxPathTarget {
  /** Tool argument the path came from. */
  readonly field: string
  readonly access: 'read' | 'write'
  /** Canonical absolute path; see `normalizeSandboxAbsolutePath`. */
  readonly absolute: string
  /** The tool may touch anything below the path, so every grant inside it limits the access. */
  readonly subtree?: boolean | undefined
}

export interface SandboxToolCall {
  readonly tool: string
  readonly effect: 'read' | 'write' | 'process' | 'network'
  readonly paths: readonly SandboxPathTarget[]
  /** Command text when the tool declares one; command rules apply only then. */
  readonly command: string | null
}

export interface SandboxEvaluationOptions {
  /** Canonical absolute workspace root; relative grants resolve against it. */
  readonly workspaceRoot: string
  readonly caseInsensitive: boolean
}

export type SandboxReason =
  | { readonly kind: 'tool-rule'; readonly tool: string }
  | {
      readonly kind: 'path'
      readonly field: string
      readonly path: string
      readonly required: 'read' | 'write'
      readonly granted: SandboxPathAccess
      /** Matching grant pattern, or `null` when the filesystem default applied. */
      readonly grant: string | null
    }
  | { readonly kind: 'command'; readonly segment: string; readonly rule: string | null }
  | { readonly kind: 'command-unsafe'; readonly construct: string }
  | { readonly kind: 'network'; readonly enabled: boolean }
  | { readonly kind: 'undeclared-effect'; readonly effect: 'write' | 'process' }
  | { readonly kind: 'read-effect' }

export interface SandboxVerdict {
  readonly decision: SandboxDecision
  readonly reason: SandboxReason
  /** The call is outside the profile and the decision is the profile's escalation. */
  readonly escalated: boolean
}

type Vote = { readonly decision: SandboxDecision | 'escalate'; readonly reason: SandboxReason }
const decisionRank: Readonly<Record<SandboxDecision, number>> = { allow: 0, ask: 1, deny: 2 }

/**
 * Every applicable check votes and the strictest vote wins. A matching tool rule
 * replaces the effect-level checks (network, undeclared effects) for that tool;
 * path and command checks still apply to its arguments.
 */
export function evaluateSandbox(
  profile: ResolvedSandboxProfile,
  call: SandboxToolCall,
  options: SandboxEvaluationOptions,
): SandboxVerdict {
  const votes: Vote[] = []
  const root = normalizeSandboxAbsolutePath(options.workspaceRoot)
  const toolRule = profile.tools.rules.find((rule) => rule.tool === call.tool)
  if (toolRule) votes.push({ decision: toolRule.decision, reason: { kind: 'tool-rule', tool: call.tool } })

  if (call.paths.length) {
    const grants = profile.filesystem.grants.map((grant) => compileGrant(grant, root, options.caseInsensitive))
    for (const target of call.paths) {
      const absolute = normalizeSandboxAbsolutePath(target.absolute)
      const relative = within(root, absolute, options.caseInsensitive)
      let best: CompiledGrant | null = null
      for (const grant of grants) {
        const candidate = grant.scope === 'relative' ? relative : absolute
        if (candidate === null || !grant.test(candidate)) continue
        if (
          !best ||
          grant.specificity > best.specificity ||
          (grant.specificity === best.specificity && accessRank[grant.grant.access] < accessRank[best.grant.access])
        )
          best = grant
      }
      let granted = best?.grant.access ?? profile.filesystem.default
      let limiting = best
      if (target.subtree)
        for (const grant of grants) {
          const candidate = grant.scope === 'relative' ? relative : absolute
          if (candidate === null || !grant.below(candidate) || accessRank[grant.grant.access] >= accessRank[granted])
            continue
          granted = grant.grant.access
          limiting = grant
        }
      const reason: SandboxReason = {
        kind: 'path',
        field: target.field,
        path: relative === null ? absolute : relative || '.',
        required: target.access,
        granted,
        grant: limiting?.grant.path ?? null,
      }
      votes.push({
        decision:
          best?.grant.access === 'none'
            ? 'deny'
            : accessRank[granted] >= accessRank[target.access]
              ? 'allow'
              : 'escalate',
        reason,
      })
    }
  }

  if (call.command !== null) {
    const parsed = parseSandboxCommand(call.command)
    const rules = profile.commands.rules.map((rule) => compileCommandRule(rule, options.caseInsensitive))
    if (parsed.unsafe)
      votes.push({ decision: 'escalate', reason: { kind: 'command-unsafe', construct: parsed.unsafe } })
    if (!parsed.segments.length)
      votes.push({ decision: 'escalate', reason: { kind: 'command', segment: '', rule: null } })
    for (const words of parsed.segments) {
      const segment = words.join(' ')
      const matched = rules.filter((rule) => rule.test(words))
      const strictest = matched.reduce<CompiledCommandRule | null>(
        (current, rule) =>
          !current || decisionRank[rule.rule.decision] > decisionRank[current.rule.decision] ? rule : current,
        null,
      )
      votes.push(
        strictest
          ? { decision: strictest.rule.decision, reason: { kind: 'command', segment, rule: strictest.rule.pattern } }
          : { decision: 'escalate', reason: { kind: 'command', segment, rule: null } },
      )
    }
  }

  if (!toolRule) {
    if (call.effect === 'network')
      votes.push({
        decision: profile.network.enabled ? 'allow' : 'escalate',
        reason: { kind: 'network', enabled: profile.network.enabled },
      })
    else if ((call.effect === 'write' && !call.paths.length) || (call.effect === 'process' && call.command === null))
      votes.push({ decision: 'escalate', reason: { kind: 'undeclared-effect', effect: call.effect } })
  }

  let decisive: { final: SandboxDecision; reason: SandboxReason; escalated: boolean } | null = null
  for (const vote of votes) {
    const escalated = vote.decision === 'escalate'
    const final = vote.decision === 'escalate' ? profile.escalation : vote.decision
    // Prefer an explicit rule over escalation when both produce the same decision.
    if (
      !decisive ||
      decisionRank[final] > decisionRank[decisive.final] ||
      (final === decisive.final && decisive.escalated && !escalated)
    )
      decisive = { final, reason: vote.reason, escalated }
  }
  if (!decisive) return { decision: 'allow', reason: { kind: 'read-effect' }, escalated: false }
  return { decision: decisive.final, reason: decisive.reason, escalated: decisive.escalated }
}
