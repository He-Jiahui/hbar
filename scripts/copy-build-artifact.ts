import { copyFile, readFile } from 'node:fs/promises'

/** Leave identical artifacts untouched, including DLLs locked by a running Windows Host. */
export async function copyBuildArtifact(source: string, destination: string): Promise<boolean> {
  const content = await readFile(source)
  try {
    if (content.equals(await readFile(destination))) return false
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  await copyFile(source, destination)
  return true
}
