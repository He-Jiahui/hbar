import { z } from 'zod'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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
  try {
    const spec = schema.parse(JSON.parse(source))
    return (
      <div className="flow-view">
        <ReactFlow
          key={source}
          defaultNodes={spec.nodes}
          defaultEdges={spec.edges}
          fitView
          colorMode="dark"
          nodesDraggable
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="#3c3f48" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    )
  } catch {
    return <pre className="render-error">{source}</pre>
  }
}
