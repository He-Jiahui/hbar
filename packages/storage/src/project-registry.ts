import { basename, resolve } from 'node:path'
import type { Workspace } from '@hbar/contracts'

export interface ProjectRegistryStorage {
  createWorkspace(path: string, name: string): Promise<Workspace>
  workspaces(): Promise<Workspace[]>
}

export class ProjectRegistry {
  constructor(private storage: ProjectRegistryStorage) {}

  async resolve(value: string): Promise<Workspace | undefined> {
    const projects = await this.storage.workspaces()
    const path = resolve(value)
    return projects.find((project) => project.id === value || project.name === value || resolve(project.path) === path)
  }

  async ensure(path: string): Promise<Workspace> {
    const resolved = resolve(path)
    return (await this.resolve(resolved)) ?? this.storage.createWorkspace(resolved, basename(resolved) || resolved)
  }
}
