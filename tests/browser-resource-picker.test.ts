import { expect, test } from 'bun:test'
import { createBrowserResourcePicker } from '@hbar/client'

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function directoryFile(text: string, name: string, path: string): File {
  const file = new File([text], name, { type: 'text/plain' })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

test('browser resource picker uploads files and bounded directory manifests as artifacts', async () => {
  const single = new File(['one'], 'one.txt', { type: 'text/plain' })
  const first = directoryFile('alpha', 'a.txt', 'project/a.txt')
  const second = directoryFile('beta', 'b.txt', 'project/nested/b.txt')
  const selections: (readonly File[] | null)[] = [[single], [second, first]]
  const uploads: File[] = []
  const picker = createBrowserResourcePicker(
    {
      async upload(file) {
        uploads.push(file)
        return { id: await sha256(file), name: file.name, mime: file.type, size: file.size }
      },
    },
    {
      files: {
        async select() {
          return selections.shift() ?? null
        },
      },
    },
  )
  const signal = new AbortController().signal
  try {
    const file = await picker.select(
      {
        resource: { kind: 'file', location: 'client-local' },
        current: null,
        clientId: 'client',
        hostId: 'host',
      },
      signal,
    )
    expect(file).toMatchObject({
      label: 'one.txt',
      reference: { kind: 'artifact', resourceKind: 'file', artifactId: await sha256(single) },
    })

    const directory = await picker.select(
      {
        resource: { kind: 'directory', location: 'client-local' },
        current: null,
        clientId: 'client',
        hostId: 'host',
      },
      signal,
    )
    expect(directory).toMatchObject({
      label: 'project',
      reference: { kind: 'artifact', resourceKind: 'directory' },
    })
    const manifestFile = uploads.at(-1)!
    expect(manifestFile.type).toBe('application/vnd.hbar.directory+json')
    const manifest = JSON.parse(await manifestFile.text()) as {
      version: number
      kind: string
      root: string
      entries: { path: string; artifact: { id: string } }[]
    }
    expect(manifest).toMatchObject({ version: 1, kind: 'directory', root: 'project' })
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['project/a.txt', 'project/nested/b.txt'])
    expect(manifest.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.artifact.id))).toBeTrue()
    expect(uploads).toHaveLength(4)
  } finally {
    picker.dispose()
  }
})
