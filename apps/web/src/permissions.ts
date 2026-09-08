import type { ApprovalMode } from '@hbar/contracts'

export interface PermissionPreset {
  id: ApprovalMode
  label: string
  shortLabel: string
  description: string
  tone: 'safe' | 'balanced' | 'open'
}

export const permissionPresets: readonly PermissionPreset[] = [
  {
    id: 'ask',
    label: '写入时询问',
    shortLabel: '询问',
    description: '读取自动执行，写入文件或运行命令前询问一次。',
    tone: 'balanced',
  },
  {
    id: 'allow',
    label: '工作区自动执行',
    shortLabel: '自动执行',
    description: '允许工作区内的写入和命令直接执行，不再逐次确认。',
    tone: 'open',
  },
  {
    id: 'deny',
    label: '只读模式',
    shortLabel: '只读',
    description: '仅允许读取和分析，所有写入及命令都会被拒绝。',
    tone: 'safe',
  },
] as const

export function permissionPreset(mode: ApprovalMode): PermissionPreset {
  return permissionPresets.find((preset) => preset.id === mode) ?? permissionPresets[0]!
}

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return value === 'ask' || value === 'allow' || value === 'deny'
}
