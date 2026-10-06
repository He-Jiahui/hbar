import {
  LumenButton,
  LumenFrame,
  LumenPopupSelect,
  LumenStatus,
  LumenText,
  LumenTree,
  LumenTreeItem,
} from '@lumen/app-ui'
import { HbarWorkspaceTabs } from '../../packages/app-react/src/workspace-tabs'
import { HbarFilePreviewTabs } from '../../packages/app-react/src/file-preview-tabs'
import { SidebarSearchEntry } from '../../packages/app-react/src/sidebar-search-entry'
import '../../packages/app-react/src/lumen-workspace-shell.css'
import '../../packages/app-react/src/sidebar-time-view.css'

/** Test-owned content for the actual production primitives, tabs and tree. */
export function SingleLineGallery({
  caption,
  count,
  onAction,
}: {
  readonly caption: string
  readonly count: number
  readonly onAction: (id: string) => void
}) {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `tab-${index}`,
    title: `${caption} ${index}`,
    kind: 'session' as const,
    activity: 'idle' as const,
  }))
  return (
    <LumenFrame className="single-line-gallery" data-fixture-gallery>
      <LumenFrame className="single-line-gallery-rail" data-fixture-actions>
        {(['contained', 'outlined', 'text'] as const).map((variant) => (
          <LumenButton key={variant} variant={variant} onClick={() => onAction(variant)}>
            {caption}
          </LumenButton>
        ))}
        <LumenStatus value={caption} tone="success" />
        <SidebarSearchEntry label={caption} shortcut="Ctrl K" open={false} onOpen={() => onAction('search')} />
      </LumenFrame>
      <LumenFrame data-fixture-select>
        <LumenPopupSelect
          value={count ? (items[0]?.id ?? null) : null}
          options={items.map((item) => ({ id: item.id, label: item.title }))}
          placeholder={caption}
          aria-label={caption}
          onValueChange={(id) => onAction(`option:${id}`)}
        />
      </LumenFrame>
      <HbarWorkspaceTabs
        items={items}
        activeId={items[0]?.id ?? null}
        busy={false}
        labels={{
          tabs: caption,
          empty: caption,
          scrollLeft: caption,
          scrollRight: caption,
          close: (title) => `close ${title}`,
          menu: (title) => `menu ${title}`,
          activity: () => caption,
          action: () => caption,
        }}
        onSelect={(id) => onAction(`tab:${id}`)}
        onRequestClose={(id) => onAction(`close:${id}`)}
        onMove={(id) => onAction(`move:${id}`)}
      />
      <HbarFilePreviewTabs
        items={items.map((item) => ({
          id: item.id,
          path: `directory/${item.title}.tsx`,
          kind: 'document',
          protection: null,
        }))}
        activeId={items[0]?.id ?? null}
        labels={{
          tabs: caption,
          kind: () => caption,
          tab: (path) => path,
          close: (path) => `close ${path}`,
          menu: (path) => `menu ${path}`,
          action: () => caption,
          status: () => caption,
          blocked: (path) => path,
          showBlocked: caption,
          error: () => caption,
        }}
        onSelect={(id) => onAction(`file:${id}`)}
        onClose={(ids) => onAction(`files:${ids.join(',')}`)}
      />
      <LumenFrame className="single-line-gallery-rail hbar-app-react-project-tree" data-fixture-tree>
        <LumenTree label={caption}>
          {items.map((item) => (
            <LumenTreeItem
              key={item.id}
              nodeId={item.id}
              label={item.title}
              onActivate={() => onAction(`tree:${item.id}`)}
              content={
                <LumenFrame className="hbar-app-react-workspace-row">
                  <LumenText as="span">{item.title}</LumenText>
                </LumenFrame>
              }
            />
          ))}
        </LumenTree>
      </LumenFrame>
    </LumenFrame>
  )
}
