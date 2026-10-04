import { expect, test } from 'bun:test'
import {
  sameWorkspaceDisplayNameValidationTarget,
  type WorkspaceDisplayNameValidationTarget,
} from '../packages/app-react/src/workspace-display-name-validation-focus'

test('validation focus belongs to the original runtime, editor lifetime, revision and raw draft', () => {
  const target: WorkspaceDisplayNameValidationTarget = {
    owner: {},
    generation: 4,
    workspaceId: 'A',
    revision: 9,
    draft: ' ',
  }
  expect(sameWorkspaceDisplayNameValidationTarget(target, { ...target })).toBe(true)
  expect(sameWorkspaceDisplayNameValidationTarget(target, null)).toBe(false)
  for (const changed of [
    { owner: {} },
    { generation: 6 },
    { workspaceId: 'B' },
    { revision: 10 },
    { draft: 'A new edit' },
  ])
    expect(sameWorkspaceDisplayNameValidationTarget(target, { ...target, ...changed })).toBe(false)
})
