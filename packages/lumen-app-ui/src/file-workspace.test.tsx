import { describe, expect, it, vi } from 'vitest'
import { createRenderer, screen } from '@mui/internal-test-utils'
import { LumenFileDocument } from './file-workspace'
import { LumenButton } from './primitives'

const labels = {
  title: '文件',
  parent: '上级',
  refresh: '刷新',
  loading: '读取中',
  empty: '空',
  retry: '重试',
  readOnly: '文本',
}
describe('LumenFileDocument host-owned preview actions', () => {
  const { render } = createRenderer()
  it('preserves legacy loading without mounting the old content', () => {
    render(
      <LumenFileDocument path="a.ts" labels={labels} loading onRetry={() => {}}>
        <textarea aria-label="a.ts" defaultValue="old" />
      </LumenFileDocument>,
    )
    expect(screen.queryByRole('textbox')).to.equal(null)
    expect(screen.getByRole('status').textContent).to.equal(labels.loading)
  })
  it('retains the confirmed reader during explicit revalidation and keeps refresh disabled', () => {
    render(
      <LumenFileDocument path="a.ts" labels={labels} loading retainContentWhileLoading onRetry={() => {}}>
        <textarea aria-label="a.ts" defaultValue="confirmed" />
      </LumenFileDocument>,
    )
    expect(screen.getByRole('textbox', { name: 'a.ts' })).to.have.property('value', 'confirmed')
    expect(screen.getByRole('button', { name: labels.refresh })).to.have.property('disabled', true)
    expect(screen.getByRole('region', { name: 'a.ts' }).getAttribute('aria-busy')).to.equal('true')
  })
  it('does not show unavailable content even when retention is requested', () => {
    render(
      <LumenFileDocument
        path="a.ts"
        labels={labels}
        loading
        retainContentWhileLoading
        contentAvailable={false}
        onRetry={() => {}}
      >
        <textarea aria-label="a.ts" defaultValue="unavailable" />
      </LumenFileDocument>,
    )
    expect(screen.queryByRole('textbox')).to.equal(null)
    expect(screen.getByRole('status').textContent).to.equal(labels.loading)
  })
  it('keeps the single-preview close action in the header and independent from refresh', async () => {
    const close = vi.fn()
    const refresh = vi.fn()
    const name = '关闭仍属于原始预览的这个很长的本地化文件名称'
    const { user } = render(
      <LumenFileDocument
        path="a.ts"
        labels={labels}
        loading={false}
        onRetry={refresh}
        headerActions={<LumenButton onClick={close}>{name}</LumenButton>}
      >
        <pre>confirmed</pre>
      </LumenFileDocument>,
    )
    const button = screen.getByRole('button', { name })
    expect(button.closest('header')).not.to.equal(null)
    await user.click(button)
    expect(close).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(0)
    await user.click(screen.getByRole('button', { name: labels.refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
