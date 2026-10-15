import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { publicServiceEntry, conversationHostArguments } from '../apps/cli/src/service-entry'
import { parseCli } from '../apps/cli/src/args'
import { parseArguments } from '@hbar/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'

test('service dispatch accepts global options before commands without interpreting their values as commands', () => {
  expect(publicServiceEntry(['--home', 'node', '--role', 'workspace', 'serve', '--listen', '127.0.0.1:0'])).toEqual({
    kind: 'workspace',
    argv: ['--home', 'node', '--role', 'workspace', '--listen', '127.0.0.1:0'],
  })
  expect(publicServiceEntry(['--home', 'serve', 'node', 'status'])).toEqual({
    kind: 'node',
    argv: ['--home', 'serve', 'status'],
  })
  expect(publicServiceEntry(['--message', 'serve', '--role', 'workspace'])).toEqual({ kind: 'application' })
  expect(publicServiceEntry(['--role=workspace', 'serve', '--help'])).toEqual({ kind: 'application' })
  expect(() => publicServiceEntry(['--role', 'workspcae', 'serve'])).toThrow('Invalid --role')
  expect(() => publicServiceEntry(['--connect-only', 'serve', '--role', 'workspace'])).toThrow('--connect-only')
  expect(
    publicServiceEntry([
      'serve',
      '--role',
      'workspace',
      '--listen',
      '0.0.0.0:443',
      '--cert',
      'node-cert.pem',
      '--key',
      'node-key.pem',
      '--public-host',
      'node.example.test',
    ]),
  ).toEqual({
    kind: 'workspace',
    argv: [
      '--role',
      'workspace',
      '--listen',
      '0.0.0.0:443',
      '--cert',
      'node-cert.pem',
      '--key',
      'node-key.pem',
      '--public-host',
      'node.example.test',
    ],
  })
})

test('conversation service preserves bind address, TLS, data paths and profile while refusing workspace-only options', () => {
  const args = parseCli([
    '--home',
    'service',
    'serve',
    '--role',
    'conversation',
    '--host',
    '0.0.0.0',
    '--port',
    '0',
    '--cert',
    'cert.pem',
    '--key',
    'key.pem',
    '--profile',
    'profile.ts',
    '--project',
    'engine',
    '--no-local-exec',
  ])
  expect(conversationHostArguments(args)).toEqual([
    '--supervisor',
    '--service',
    '--role',
    'conversation',
    '--home',
    'service',
    '--host',
    '0.0.0.0',
    '--port',
    '0',
    '--cert',
    resolve('cert.pem'),
    '--key',
    resolve('key.pem'),
    '--workspace',
    resolve('engine'),
    '--profile',
    resolve('profile.ts'),
    '--no-local-exec',
  ])
  for (const port of ['-1', '65536', '12px', '1.5', 'Infinity', ''])
    expect(() => conversationHostArguments(parseCli(['serve', '--port=' + port]))).toThrow('Invalid --port')
  expect(() => conversationHostArguments(parseCli(['serve', '--cert', 'cert.pem']))).toThrow('both TLS')
  expect(() => conversationHostArguments(parseCli(['serve', '--join', 'https://a.example']))).toThrow(
    'require --role workspace',
  )
})

test('conversation service carries no-local-exec and workspace.create parses node and root selectors', () => {
  const args = parseCli(['serve', '--role', 'conversation', '--no-local-exec'])
  expect(args.noLocalExec).toBe(true)
  expect(conversationHostArguments(args)).toContain('--no-local-exec')
  const definition = workspaceSessionCommands['workspace.create']
  const input = definition.input.parse(parseArguments(definition.metadata, ['--node', 'build-box', '--root', 'engine']))
  expect(input).toEqual({ node: 'build-box', rootId: 'engine' })
  expect(definition.input.safeParse({ node: 'build-box' }).success).toBe(false)
  expect(definition.input.safeParse({ path: 'C:/repo', rootId: 'engine' }).success).toBe(false)
})
