import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HbarFilePreviewTabs, type HbarFilePreviewItem } from '@hbar/app-react'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

const makeItems = (count: number): HbarFilePreviewItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `preview-${index}`,
    path: `目录${index}/具有特别长的本地化名称不会丢失任何路径.ts`,
    kind: index % 3 === 0 ? 'document' : index % 3 === 1 ? 'working' : 'staged',
    protection: index === 0 ? 'dirty' : null,
  }))
function Fixture() {
  const [items, setItems] = useState(() => makeItems(4))
  const [activeId, setActive] = useState<string | null>('preview-0')
  const [lastEvent, setEvent] = useState('')
  const [english, setEnglish] = useState(false)
  const labels = getShellCopy(english ? 'en-US' : 'zh-CN').files.previews
  useEffect(() => {
    const mutate = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyR') {
        event.preventDefault()
        setItems((current) => current.map((item) => (item.id === 'preview-0' ? { ...item, id: 'reopened-0' } : item)))
      }
    }
    document.addEventListener('keydown', mutate)
    return () => document.removeEventListener('keydown', mutate)
  }, [])
  return (
    <main>
      <section>
        {[0, 1, 4, 32, 33].map((count) => (
          <button
            key={count}
            onClick={() => {
              setItems(makeItems(count))
              setActive('preview-0')
            }}
          >{`${count} previews`}</button>
        ))}
        <button onClick={() => setActive('missing')}>Missing active</button>
        <button onClick={() => setItems((current) => [...current, ...current.slice(0, 1)])}>Duplicate ID</button>
        <button onClick={() => setEnglish((current) => !current)}>Locale</button>
      </section>
      <HbarFilePreviewTabs
        items={items}
        activeId={activeId}
        labels={labels}
        onSelect={setActive}
        onClose={(ids) => {
          setEvent(JSON.stringify(ids))
          setItems((current) => current.filter((item) => !ids.includes(item.id)))
        }}
      />
      <output aria-label="Fixture event">{lastEvent}</output>
      <output aria-label="Fixture identities">{items.map((item) => item.id).join(',')}</output>
    </main>
  )
}
const root = document.getElementById('fixture-root')
if (!root) throw new Error('Missing fixture root')
createRoot(root).render(<Fixture />)
