import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { writeBuildArtifact } from './copy-build-artifact'

export async function buildReadonlySqliteNative(project: string): Promise<{
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly nativeRequired: boolean
}> {
  const root = resolve(project)
  const output = join(root, 'packages/runtime-native/native/hbar_sqlite_readonly.asset')
  if (process.platform !== 'win32') {
    // The platform-neutral import remains buildable; other platforms keep their
    // existing SQLite reader and never load this marker as a native extension.
    const marker = new TextEncoder().encode('hbar readonly SQLite: native extension is not used on ' + process.platform)
    await writeBuildArtifact(marker, output)
    return {
      path: output,
      bytes: marker.byteLength,
      sha256: createHash('sha256').update(marker).digest('hex'),
      nativeRequired: false,
    }
  }
  if (process.arch !== 'x64' || !process.env.VSCMD_VER)
    throw new Error('Build readonly SQLite from an x64 Visual Studio Developer environment')
  const llvm = process.env.VSINSTALLDIR ? join(process.env.VSINSTALLDIR, 'VC/Tools/Llvm/x64/bin') : undefined
  const compiler = Bun.which(process.env.CC ?? (llvm ? join(llvm, 'clang-cl.exe') : 'clang-cl.exe'))
  const linker = Bun.which(llvm ? join(llvm, 'lld-link.exe') : 'lld-link.exe')
  if (!compiler || !linker) throw new Error('Readonly SQLite build requires clang-cl and lld-link')
  const source = join(root, 'packages/runtime-native/native/sqlite-readonly')
  const temporary = join(root, 'target/sqlite-readonly', randomUUID())
  await mkdir(temporary, { recursive: true })
  const object = join(temporary, 'extension.obj')
  const library = join(temporary, 'hbar_sqlite_readonly.dll')
  const steps: Array<{ name: string; command: string[]; pid: number; exit: number }> = []
  for (const [name, command] of [
    [
      'compile',
      [
        compiler,
        '/nologo',
        '/std:c11',
        '/W4',
        '/WX',
        '/O2',
        '/MD',
        '/D_WINDLL',
        '/c',
        '/I' + source,
        join(source, 'extension.c'),
        '/Fo' + object,
      ],
    ],
    ['link', [linker, '/NOLOGO', '/DLL', '/MACHINE:X64', '/INCREMENTAL:NO', '/DEBUG:NONE', '/OUT:' + library, object]],
  ] satisfies Array<[string, string[]]>) {
    const child = Bun.spawn(command, { cwd: temporary, stdout: 'pipe', stderr: 'pipe', windowsHide: true })
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).arrayBuffer(),
      new Response(child.stderr).arrayBuffer(),
      child.exited,
    ])
    await writeFile(join(temporary, name + '.stdout.bin'), new Uint8Array(stdout), { flag: 'wx' })
    await writeFile(join(temporary, name + '.stderr.bin'), new Uint8Array(stderr), { flag: 'wx' })
    steps.push({ name, command, pid: child.pid, exit })
    if (exit !== 0) throw new Error('Readonly SQLite ' + name + ' failed; raw output retained at ' + temporary)
  }
  const bytes = await readFile(library)
  await mkdir(dirname(output), { recursive: true })
  await writeBuildArtifact(bytes, output)
  const result = {
    path: output,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    nativeRequired: true,
  }
  await writeFile(
    join(temporary, 'build.actual.json'),
    JSON.stringify({ ...result, compiler, linker, steps, temporary, engineReplaced: false, warningsAsErrors: true }) +
      '\n',
    { flag: 'wx' },
  )
  console.log(JSON.stringify({ type: 'readonly-sqlite-native-build', ...result, temporary }))
  return result
}

if (import.meta.main) await buildReadonlySqliteNative(resolve(import.meta.dir, '..'))
