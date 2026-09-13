import { z } from 'zod'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import GlassSurface from './react-bits/GlassSurface'
import { referenceAttributes } from './react-bits'
import { isDarkThemeColor, useThemeSettings } from './theme-store'
const schema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().max(100),
        position: z.object({ x: z.number().finite(), y: z.number().finite() }),
        data: z.object({ label: z.string().max(300) }),
      }),
    )
    .max(100),
  edges: z
    .array(z.object({ id: z.string().max(100), source: z.string().max(100), target: z.string().max(100) }))
    .max(200),
})
export default function FlowView({ source }: { source: string }) {
  const themeMode = useThemeSettings((state) => state.profile.mode)
  const themeBackground = useThemeSettings((state) => state.profile.colors.background)
  try {
    const spec = schema.parse(JSON.parse(source))
    return (
      <div
        {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/dashboard')}
        className="flow-view rb-render-surface"
      >
        <GlassSurface className="render-surface-glass" width="100%" height="100%" aria-hidden="true" />
        <ReactFlow
          key={source}
          defaultNodes={spec.nodes}
          defaultEdges={spec.edges}
          fitView
          colorMode={themeMode === 'dark' || (themeMode === 'custom' && isDarkThemeColor(themeBackground)) ? 'dark' : 'light'}
          nodesDraggable
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="var(--hbar-bd2)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    )
  } catch {
    return <pre {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/empty-state')} className="render-error">{source}</pre>
  }
}
