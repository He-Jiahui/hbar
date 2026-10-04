import { expect, test } from 'bun:test'
import { LumenApprovalRequest, LumenQuestionnaire, LumenRunActivity } from '@lumen/app-ui'
import {
  HbarAppUiApprovalRequest,
  HbarAppUiQuestionnaire,
  HbarAppUiRunActivity,
} from '../packages/hbar-app-ui/src/production'

test('session activity and decisions are direct Lumen compatibility exports', () => {
  expect(HbarAppUiRunActivity).toBe(LumenRunActivity)
  expect(HbarAppUiApprovalRequest).toBe(LumenApprovalRequest)
  expect(HbarAppUiQuestionnaire).toBe(LumenQuestionnaire)
})

test('the legacy run activity stylesheet is retired', async () => {
  expect(await Bun.file('packages/hbar-app-ui/src/components/run-activity/RunActivity.css').exists()).toBe(false)
})
