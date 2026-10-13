import { expect, test } from 'bun:test'

test('the public app-react bundle retains shared Lumen reading and syntax theme aliases', async () => {
  const result = await Bun.build({
    entrypoints: ['./packages/app-react/src/index.ts'],
    target: 'browser',
    format: 'esm',
    external: ['react', 'react-dom'],
  })
  expect(result.success).toBe(true)
  const styles = (
    await Promise.all(result.outputs.filter((output) => output.path.endsWith('.css')).map((output) => output.text()))
  ).join('\n')
  for (const variable of [
    '--hbar-session-pane-body-size',
    '--hbar-session-body',
    '--hbar-code-comment',
    '--hbar-workbench-brand-size',
  ])
    expect(styles).toMatch(new RegExp(`${variable}\\s*:`))
}, 30_000)
