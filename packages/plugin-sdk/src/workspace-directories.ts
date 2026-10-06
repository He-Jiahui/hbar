/** Verified directory resolution owned by the execution provider, including virtual workspace mounts. */
export interface WorkspaceDirectoryService {
  resolve(workspace: string, relativeDirectory: string): Promise<string>
}
