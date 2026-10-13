import { runNode, runNodeCommand } from '@hbar/node'

const [, , home, sharedRoot, referenceRoot, sourceRoot, nestedRoot, hostUrl, inviteCode, fingerprint] = Bun.argv
if (!home || !sharedRoot || !referenceRoot || !sourceRoot || !nestedRoot || !hostUrl || !inviteCode || !fingerprint)
  throw new Error('The live workspace node fixture requires its home, root, Host, invite, and fingerprint')

await runNodeCommand(['share', sharedRoot, '--id', 'docs', '--access', 'read', '--home', home], () => {})
await runNodeCommand(
  [
    'share',
    referenceRoot,
    '--id',
    'reference',
    '--name',
    'Read only reference materials',
    '--access',
    'read',
    '--home',
    home,
  ],
  () => {},
)
await runNodeCommand(
  [
    'share',
    sourceRoot,
    '--id',
    'source',
    '--name',
    'Source packages for the remote integration fixture',
    '--access',
    'write',
    '--home',
    home,
  ],
  () => {},
)
await runNodeCommand(
  ['share', nestedRoot, '--id', 'nested', '--name', 'Nested docs root', '--access', 'write', '--home', home],
  () => {},
)
const runtime = await runNode(['--home', home, '--join', hostUrl, '--code', inviteCode, '--fingerprint', fingerprint], {
  registerSignals: false,
})
process.stdout.write(`${JSON.stringify({ ready: true, nodeId: runtime.node.id })}\n`)
process.stdin.setEncoding('utf8')
await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()))
await runtime.close()
