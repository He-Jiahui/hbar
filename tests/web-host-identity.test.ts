import { expect, test } from 'bun:test'
import { hostPersistenceId } from '../apps/web/src/host-identity'

test('web persistence uses stable data-root identity and falls back for old Hosts', () => {
  expect(hostPersistenceId({ instanceId: 'process-a', dataRootId: 'root-a' })).toBe('root-a')
  expect(hostPersistenceId({ instanceId: 'process-b', dataRootId: 'root-a' })).toBe('root-a')
  expect(hostPersistenceId({ instanceId: 'legacy' })).toBe('legacy')
  expect(hostPersistenceId({ instanceId: 'root-a', dataRootId: 'root-b' })).toBe('root-b')
})
