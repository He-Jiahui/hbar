import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LumenAppShell,
  LumenButton,
  LumenContentText,
  LumenFrame,
  LumenInput,
  LumenProvider,
  DEFAULT_LUMEN_APPEARANCE,
} from '@lumen/app-ui'
import '../../packages/hbar-app-ui/src/theme.css'

function Tool({ onClose }: { onClose: () => void }) {
  const [count, setCount] = useState(0)
  const [draft, setDraft] = useState('')
  return (
    <LumenFrame className="fixture-tool">
      <LumenButton onClick={onClose}>关闭工具</LumenButton>
      <LumenButton onClick={() => setCount((value) => value + 1)}>面板计数 {count}</LumenButton>
      <LumenInput aria-label="面板草稿" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <LumenFrame className="fixture-tool-scroll" data-testid="tool-scroll">
        {Array.from({ length: 60 }, (_, index) => (
          <LumenContentText
            key={index}
            context="section.description"
          >{`记录 ${index + 1} / 详情与阅读位置`}</LumenContentText>
        ))}
      </LumenFrame>
    </LumenFrame>
  )
}
function Fixture() {
  const [open, setOpen] = useState(true)
  return (
    <LumenProvider
      appearance={{
        ...DEFAULT_LUMEN_APPEARANCE,
        mode: document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark',
      }}
    >
      <LumenAppShell
        label="工作台"
        sidebarWidthRem={17}
        sidebarOpen={false}
        closeSidebarLabel="关闭侧栏"
        onCloseSidebar={() => {}}
        toolWidthRem={24}
        toolLayout={{ mainMinWidthRem: 32, minWidthRem: 20, maxWidthRem: 36, constrainedPresentation: 'drawer' }}
        toolLabel="会话状态"
        tool={open ? <Tool onClose={() => setOpen(false)} /> : null}
        onCloseTool={() => setOpen(false)}
      >
        <LumenButton onClick={() => setOpen(true)}>打开工具</LumenButton>
        <LumenContentText context="message.body">对话始终保留阅读空间。</LumenContentText>
      </LumenAppShell>
    </LumenProvider>
  )
}
createRoot(document.getElementById('fixture-root')!).render(<Fixture />)
