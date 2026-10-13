import { expect, test } from 'bun:test'
import { assertRemoteLaunchTargetSupported, nodeWorktreeBranchPlan } from './node-worktree-selection'

test('remote worktree branch plans preserve launch selection and are revision-stable', () => {
  expect(nodeWorktreeBranchPlan({ mode: 'shared-current' }, 'session-a', 3)).toBeNull()
  expect(() =>
    nodeWorktreeBranchPlan(
      { mode: 'shared-branch', branch: { ref: 'refs/heads/release/next', tipOid: 'a'.repeat(40) } },
      'session-a',
      3,
    ),
  ).toThrow()
  expect(
    nodeWorktreeBranchPlan(
      { mode: 'isolated-worktree', branch: { kind: 'existing', name: 'feature/existing' } },
      'session-a',
      3,
    ),
  ).toEqual({ branch: 'feature/existing', createBranch: false })
  expect(
    nodeWorktreeBranchPlan(
      { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/new', startPoint: 'main' } },
      'session-a',
      3,
    ),
  ).toEqual({ branch: 'feature/new', createBranch: true, startPoint: 'main' })

  const first = nodeWorktreeBranchPlan(
    { mode: 'isolated-worktree', branch: { kind: 'derived', baseRef: 'refs/heads/main' } },
    'session-a',
    3,
  )
  expect(first).not.toBeNull()
  if (!first) throw new Error('Derived branch plan was not created')
  expect(first.branch).toMatch(/^hbar\/session-launch\/[a-f0-9]{64}$/)
  expect(first.createBranch).toBe(true)
  expect(first.startPoint).toBe('main')
  expect(
    nodeWorktreeBranchPlan(
      { mode: 'isolated-worktree', branch: { kind: 'derived', baseRef: 'refs/heads/main' } },
      'session-a',
      3,
    ),
  ).toEqual(first)
  expect(
    nodeWorktreeBranchPlan(
      { mode: 'isolated-worktree', branch: { kind: 'derived', baseRef: 'refs/heads/main' } },
      'session-a',
      4,
    )?.branch,
  ).not.toBe(first?.branch)
})

test('remote shared-branch fails closed until B can safely prepare the shared checkout', () => {
  let error: unknown
  try {
    assertRemoteLaunchTargetSupported({
      mode: 'shared-branch',
      branch: { ref: 'refs/heads/feature/shared', tipOid: 'a'.repeat(40) },
    })
  } catch (caught) {
    error = caught
  }
  expect(error).toMatchObject({ code: 'REMOTE_SHARED_BRANCH_UNSUPPORTED' })
  expect(() => assertRemoteLaunchTargetSupported({ mode: 'shared-current' })).not.toThrow()
  expect(() =>
    assertRemoteLaunchTargetSupported({
      mode: 'isolated-worktree',
      branch: { kind: 'existing', name: 'feature/isolated' },
    }),
  ).not.toThrow()
})
