import { describe, expect, it, vi } from 'vitest'
import { createRenderer, screen } from '@mui/internal-test-utils'
import { LumenImageGallery, LumenImageTile } from './image-gallery'
import type { LumenImageGalleryProps } from './image-gallery'
import { LumenPromptComposer } from './session-components'

const labels = {
  title: '图片查看器',
  close: '关闭图片',
  previous: '上一张',
  next: '下一张',
  position: (index: number, total: number) => `${index} / ${total}`,
  loading: '读取图片中',
  retry: '重试图片',
  unavailable: '图片不可用',
  select: (name: string) => `选择 ${name}`,
}
const items = [
  { key: 'occurrence-a', name: 'same.png' },
  { key: 'occurrence-b', name: 'same.png' },
] as const
const defaults: LumenImageGalleryProps = {
  open: true,
  items,
  activeKey: 'occurrence-a',
  image: { status: 'loading' },
  labels,
  onSelect() {},
  onClose() {},
  onRetry() {},
  onImageError() {},
}

describe('controlled image gallery', () => {
  const { render } = createRenderer()

  it('keeps duplicate file names as distinct occurrences and wraps keyboard and pointer selection', async () => {
    const onSelect = vi.fn()
    const { user, setProps } = render(<LumenImageGallery {...defaults} onSelect={onSelect} />)
    const close = screen.getByRole('button', { name: labels.close })
    await user.click(close)
    await user.keyboard('{ArrowLeft}')
    expect(onSelect).toHaveBeenLastCalledWith('occurrence-b')
    setProps({ activeKey: 'occurrence-b' })
    await user.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenLastCalledWith('occurrence-a')
    await user.click(screen.getByRole('button', { name: labels.next }))
    expect(onSelect).toHaveBeenLastCalledWith('occurrence-a')
    const thumbs = screen.getAllByRole('button', { name: '选择 same.png' })
    expect(thumbs).to.have.length(2)
    const [firstThumb, secondThumb] = thumbs
    if (!firstThumb || !secondThumb) throw new Error('Expected both image occurrence controls')
    expect(secondThumb.getAttribute('aria-pressed')).to.equal('true')
    await user.click(firstThumb)
    expect(onSelect).toHaveBeenLastCalledWith('occurrence-a')
  })

  it('never handles modified or composition arrow events', async () => {
    const onSelect = vi.fn()
    const { user } = render(<LumenImageGallery {...defaults} onSelect={onSelect} />)
    const close = screen.getByRole('button', { name: labels.close })
    await user.click(close)
    await user.keyboard('{Control>}{ArrowRight}{/Control}')
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, isComposing: true }))
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, keyCode: 229 }))
    expect(onSelect).toHaveBeenCalledTimes(0)
  })

  it('single images have no strip or previous/next actions', () => {
    const { container } = render(<LumenImageGallery {...defaults} items={[items[0]]} />)
    expect(screen.queryByRole('button', { name: labels.previous })).to.equal(null)
    expect(screen.queryByRole('button', { name: labels.next })).to.equal(null)
    expect(container.querySelector('.lumen-image-gallery-strip')).to.equal(null)
    expect(screen.getByText('1 / 1')).not.to.equal(null)
  })

  it('does not mount full image or thumbnail URLs while closed', () => {
    render(
      <LumenImageGallery
        {...defaults}
        open={false}
        items={items.map((item) => ({ ...item, thumbnailUrl: 'blob:thumbnail' }))}
        image={{ status: 'ready', url: 'blob:full-image' }}
      />,
    )
    expect(document.querySelector('.lumen-image-gallery-media img')).to.equal(null)
    expect(screen.queryByRole('dialog')).to.equal(null)
  })

  it.each([
    { items: [], activeKey: 'occurrence-a' },
    { items, activeKey: 'missing' },
    { items: [items[0], items[0]], activeKey: 'occurrence-a' },
    { items: [{ key: '', name: 'invalid' }], activeKey: '' },
    {
      items: Array.from({ length: 13 }, (_, index) => ({
        key: String(index),
        name: String(index),
      })),
      activeKey: '0',
    },
  ])('invalid controlled input stays closeable without slicing or showing media %#', (invalid) => {
    render(<LumenImageGallery {...defaults} {...invalid} image={{ status: 'ready', url: 'blob:should-not-render' }} />)
    expect(screen.getByText(labels.unavailable)).not.to.equal(null)
    expect(screen.getByRole('button', { name: labels.close })).not.to.equal(null)
    expect(document.querySelector('.lumen-image-gallery-media img')).to.equal(null)
    expect(screen.queryByRole('button', { name: labels.next })).to.equal(null)
  })

  it('renders all 12 thumbnails without changing controlled selection', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => ({
      key: `item-${index}`,
      name: `图 ${index}`,
    }))
    render(<LumenImageGallery {...defaults} items={twelve} activeKey="item-11" />)
    expect(screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed'))).to.have.length(12)
    expect(screen.getByText('12 / 12')).not.to.equal(null)
  })

  it('keeps loading and recoverable/permanent read errors local with no stale ready image', async () => {
    const retry = vi.fn()
    const { user, setProps } = render(<LumenImageGallery {...defaults} onRetry={retry} />)
    expect(screen.getByRole('status').textContent).to.equal(labels.loading)
    setProps({ image: { status: 'ready', url: 'blob:image-a' } })
    expect(document.querySelector('.lumen-image-gallery-media img')?.getAttribute('src')).to.equal('blob:image-a')
    setProps({ image: { status: 'failed', errorText: '读取失败，可以重试', retryable: true } })
    expect(document.querySelector('.lumen-image-gallery-media img')).to.equal(null)
    expect(screen.getByRole('alert').textContent).to.equal('读取失败，可以重试')
    await user.click(screen.getByRole('button', { name: labels.retry }))
    expect(retry).toHaveBeenCalledTimes(1)
    setProps({ image: { status: 'failed', errorText: '无法读取这种图片' } })
    expect(screen.queryByRole('button', { name: labels.retry })).to.equal(null)
  })

  it('binds image decode errors to the original occurrence and URL', () => {
    const onImageError = vi.fn()
    const { setProps } = render(
      <LumenImageGallery {...defaults} image={{ status: 'ready', url: 'blob:a' }} onImageError={onImageError} />,
    )
    const original = document.querySelector('.lumen-image-gallery-media img')
    original?.dispatchEvent(new Event('error'))
    expect(onImageError).toHaveBeenLastCalledWith('occurrence-a', 'blob:a')
    setProps({ activeKey: 'occurrence-b', image: { status: 'ready', url: 'blob:b' } })
    expect(document.querySelector('.lumen-image-gallery-media img')).not.to.equal(original)
    document.querySelector('.lumen-image-gallery-media img')?.dispatchEvent(new Event('error'))
    expect(onImageError).toHaveBeenLastCalledWith('occurrence-b', 'blob:b')
  })

  it('delegates close and Escape, never selects a file on either action', async () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    const { user } = render(<LumenImageGallery {...defaults} onClose={onClose} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: labels.close }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenCalledTimes(0)
  })
})

describe('controlled image tile and composer seam', () => {
  const { render } = createRenderer()
  const tile = {
    name: 'picture.png',
    status: 'failed' as const,
    variant: 'composer' as const,
    openLabel: '打开 picture.png',
    loadingLabel: '读取缩略图',
  }

  it('keeps thumbnail failure, full open, remove and retry as independent non-bubbling intents', async () => {
    const open = vi.fn()
    const remove = vi.fn()
    const retry = vi.fn()
    const outer = vi.fn()
    const { user, container } = render(
      <div onClick={outer}>
        <LumenImageTile
          {...tile}
          errorText="缩略图读取失败"
          onOpen={open}
          removeLabel="移除 picture.png"
          onRemove={remove}
          retryLabel="重试缩略图"
          onRetry={retry}
        />
      </div>,
    )
    await user.click(screen.getByRole('button', { name: '移除 picture.png' }))
    await user.click(screen.getByRole('button', { name: '重试缩略图' }))
    expect(open).toHaveBeenCalledTimes(0)
    await user.click(screen.getByRole('button', { name: tile.openLabel }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(outer).toHaveBeenCalledTimes(0)
    expect(container.querySelector('button button')).to.equal(null)
  })

  it('has no fake open action without host capability, or remove/retry without matching labels', () => {
    render(<LumenImageTile {...tile} variant="message" onRemove={() => {}} onRetry={() => {}} />)
    expect(screen.queryAllByRole('button')).to.have.length(0)
    expect(screen.getByRole('img', { name: tile.name })).not.to.equal(null)
  })

  it('reports loading copy and URL-specific thumbnail error to the host', () => {
    const error = vi.fn()
    const { setProps, container } = render(<LumenImageTile {...tile} status="loading" onImageError={error} />)
    expect(screen.getByRole('status').textContent).to.equal(tile.loadingLabel)
    setProps({ status: 'ready', url: 'blob:thumbnail' })
    container.querySelector('img')?.dispatchEvent(new Event('error'))
    expect(error).toHaveBeenCalledWith('blob:thumbnail')
  })

  it('keeps ready media compact without repeated visible file names, with explicit single-message density', () => {
    const { container, setProps } = render(
      <LumenImageTile {...tile} status="ready" url="blob:ready" onOpen={() => {}} />,
    )
    const button = screen.getByRole('button', { name: tile.openLabel })
    expect(button.getAttribute('title')).to.equal(tile.name)
    expect(button.textContent).to.equal('')
    expect(container.querySelector('.lumen-image-tile')?.getAttribute('data-ready')).to.equal('true')
    setProps({ variant: 'message', single: true })
    expect(container.querySelector('.lumen-image-tile')?.getAttribute('data-single')).to.equal('true')
    setProps({ single: false })
    expect(container.querySelector('.lumen-image-tile')?.hasAttribute('data-single')).to.equal(false)
    setProps({ status: 'failed', errorText: 'Read failed' })
    expect(button.textContent).to.equal(tile.name)
    expect(screen.getByRole('alert').textContent).to.equal('Read failed')
  })

  it('keeps pending remove visible but disabled without disabling the independent open action', async () => {
    const remove = vi.fn()
    const open = vi.fn()
    const { user } = render(
      <LumenImageTile
        {...tile}
        status="ready"
        url="blob:ready"
        onOpen={open}
        removeLabel="Remove picture"
        onRemove={remove}
        removeDisabled
      />,
    )
    const button = screen.getByRole('button', { name: 'Remove picture' })
    expect(button).to.have.property('disabled', true)
    await user.click(button)
    expect(remove).toHaveBeenCalledTimes(0)
    await user.click(screen.getByRole('button', { name: tile.openLabel }))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('preserves legacy attachments by default, replaces them exactly once, and supports explicit null', () => {
    const { setProps } = render(
      <LumenPromptComposer
        value="draft"
        labels={{
          input: 'Message',
          placeholder: 'Message',
          send: 'Send',
          stop: 'Stop',
          submitTitle: 'Send',
          uploading: 'Uploading',
          addAttachment: 'Add',
          removeAttachment: () => 'Remove legacy',
        }}
        attachments={[{ id: 'a', kind: 'image', name: 'legacy.png' }]}
        submitting={false}
        uploading={false}
        canSubmit
        canStop={false}
        onChange={() => {}}
        onSubmit={() => {}}
        onStop={() => {}}
        onRemoveAttachment={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Remove legacy' })).not.to.equal(null)
    setProps({ attachmentContent: <LumenImageTile {...tile} /> })
    expect(screen.queryByRole('button', { name: 'Remove legacy' })).to.equal(null)
    expect(screen.getAllByRole('img', { name: tile.name })).to.have.length(1)
    expect(screen.getByRole('textbox')).to.have.property('value', 'draft')
    setProps({ attachmentContent: null })
    expect(screen.queryByRole('img')).to.equal(null)
    expect(screen.queryByRole('button', { name: 'Remove legacy' })).to.equal(null)
    setProps({ attachmentContent: undefined })
    expect(screen.getByRole('button', { name: 'Remove legacy' })).not.to.equal(null)
  })
})
