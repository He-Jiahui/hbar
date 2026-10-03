import { useMemo, type ReactNode } from 'react'
import { Layout, Model, type IJsonModel } from 'flexlayout-react'
import { LumenFrame } from '@lumen/app-ui'
import './lumen-flex-layout-adapter.css'
import 'flexlayout-react/style/dark.css'

export interface HbarFlexLayoutAdapterProps {
  readonly model: IJsonModel
  readonly factory: (node: { readonly component: string; readonly id: string }) => ReactNode
  readonly onModelChange?: (model: IJsonModel) => void
  readonly className?: string
}

export interface HbarDesktopLayoutProjectionProps {
  readonly model: IJsonModel
  readonly panes: Readonly<Record<'projects' | 'workspace' | 'session-tool', ReactNode>>
  readonly onModelChange?: (model: IJsonModel) => void
}

export function desktopPaneForComponent(
  component: string | undefined,
  panes: Readonly<Record<'projects' | 'workspace' | 'session-tool', ReactNode>>,
): ReactNode {
  if (component === 'sidebar') return panes.projects
  if (component === 'page') return panes.workspace
  if (component === 'tool') return panes['session-tool']
  return null
}

/** Renders the host's descriptor projection; the adapter never owns layout state. */
export function HbarFlexLayoutAdapter({ model: json, factory, onModelChange, className }: HbarFlexLayoutAdapterProps) {
  const model = useMemo(() => Model.fromJson(json), [json])
  return (
    <LumenFrame className={className} data-hbar-layout-adapter="flexlayout">
      <Layout
        model={model}
        factory={(node) => {
          const component = node.getComponent()
          return factory({ component: typeof component === 'string' ? component : '', id: node.getId() })
        }}
        {...(onModelChange ? { onModelChange: (next) => onModelChange(next.toJson()) } : {})}
      />
    </LumenFrame>
  )
}

/** Desktop projection with a closed component whitelist for the three shell panes. */
export function HbarDesktopLayoutProjection({ model, panes, onModelChange }: HbarDesktopLayoutProjectionProps) {
  return (
    <HbarFlexLayoutAdapter
      model={model}
      className="hbar-desktop-layout-projection"
      factory={({ component }) => desktopPaneForComponent(component, panes)}
      {...(onModelChange ? { onModelChange } : {})}
    />
  )
}
