import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarAppUiCodeVerification,
  type HbarAppUiCodeVerificationProps,
} from '../packages/hbar-app-ui/src/authentication'
const content: HbarAppUiCodeVerificationProps = {
  labels: {
    title: '连接设备',
    description: '来自宿主的描述',
    code: '配对码',
    codeDigit: (index) => `第 ${index} 位`,
    helper: '输入验证码',
    submit: '确认连接',
  },
  codeLength: 8,
  presentation: 'segmented',
  value: '12345678',
  busy: false,
  canSubmit: true,
  error: undefined,
  onCodeChange() {},
  onSubmit() {},
}
test('code length, field labels and failure/busy state come from host', () => {
  const html = renderToStaticMarkup(
    createElement(HbarAppUiCodeVerification, { ...content, error: '失败，请重试', busy: true }),
  )
  expect(html.match(/inputMode="numeric"/g)).toHaveLength(8)
  expect(html).toContain('第 8 位')
  expect(html).toContain('role="alert">失败，请重试')
  expect(html).not.toContain('Resend')
  expect(html).toContain('aria-busy="true"')
})
test('unusable length disables the action and single mode supports native one-time-code autofill', () => {
  const single = renderToStaticMarkup(createElement(HbarAppUiCodeVerification, { ...content, presentation: 'single' }))
  expect(single.match(/<input/g)).toHaveLength(1)
  expect(single).toContain('maxLength="8"')
  expect(single).toContain('autoComplete="one-time-code"')
  const invalid = renderToStaticMarkup(createElement(HbarAppUiCodeVerification, { ...content, codeLength: NaN }))
  expect(invalid).not.toContain('<input')
  expect(invalid).toContain('disabled=""')
})
