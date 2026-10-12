import { describe, expect, it } from 'vitest'
import { findTypedMessageScopeViolations } from '../scripts/typed-message-scope-contract'

describe('typed message scope contract', () => {
  it('rejects copy contexts typed as broad Labels objects', () => {
    const source = `import { createContext } from 'react'\ninterface ScreenLabels { title: string }\nconst LabelsContext = createContext<ScreenLabels | null>(null)`
    expect(findTypedMessageScopeViolations('sample.tsx', source)).toMatchObject([
      { line: 3, rule: 'legacy-label-context' },
    ])
  })

  it('rejects relabeling the whole legacy contract as a labels or scope message key', () => {
    const source = `function View() {\n const { t } = useMessages()\n const labels = t('scope')\n return <PrivateView labels={labels} />\n}`
    expect(findTypedMessageScopeViolations('sample.tsx', source)).toMatchObject([
      { line: 4, rule: 'legacy-labels-scope-forwarded' },
    ])
  })

  it('allows direct typed t() calls and ordinary public host adapters', () => {
    const source = `function View({ labels }: Props) {\n const { t } = useMessages()\n return <Details title={t('title')} labels={labels} />\n}`
    expect(findTypedMessageScopeViolations('sample.tsx', source)).toEqual([])
  })

  it('rejects forwarding a full copy alias regardless of local alias name or quote style', () => {
    const source = `function View() {\n const { t } = useMessages()\n const screenCopy = t("copy")\n return <PrivateView labels={screenCopy} />\n}`
    expect(findTypedMessageScopeViolations('sample.tsx', source)).toMatchObject([
      { line: 4, rule: 'legacy-labels-scope-forwarded' },
    ])
  })

  it('rejects relabeling copy as labels even before another child is added', () => {
    const source = `function View() {\n const { t } = useMessages()\n const labels = t("copy")\n return <h1>{labels.title}</h1>\n}`
    expect(findTypedMessageScopeViolations('sample.tsx', source)).toMatchObject([
      { line: 3, rule: 'legacy-copy-group-alias' },
    ])
  })

  it('allows narrow labels objects passed only at a Lumen contract boundary', () => {
    const source = `function View() {\n const { t } = useMessages()\n const detail = t('detail')\n return <LumenDetails labels={detail} />\n}`
    expect(findTypedMessageScopeViolations('sample.tsx', source)).toEqual([])
  })
})
