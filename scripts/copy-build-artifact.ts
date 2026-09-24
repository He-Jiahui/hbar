import { copyFile, readFile, writeFile } from 'node:fs/promises'

async function hasIdenticalContent(content: Uint8Array, destination: string): Promise<boolean> {
  try {
    return Buffer.from(content).equals(await readFile(destination))
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    return false
  }
}

/** Leave identical artifacts untouched, including DLLs locked by a running Windows Host. */
export async function copyBuildArtifact(source: string, destination: string): Promise<boolean> {
  const content = await readFile(source)
  if (await hasIdenticalContent(content, destination)) return false
  await copyFile(source, destination)
  return true
}

/** Bun in-memory artifacts need the same locked-file protection as copied binaries. */
export async function writeBuildArtifact(content: Uint8Array, destination: string): Promise<boolean> {
  if (await hasIdenticalContent(content, destination)) return false
  await writeFile(destination, content)
  return true
}
