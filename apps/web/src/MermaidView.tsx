import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'dark',
  maxTextSize: 30_000,
  maxEdges: 200,
  suppressErrorRendering: true,
})
let renderQueue: Promise<unknown> = Promise.resolve()
export default function MermaidView({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ''),
    [svg, setSvg] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    renderQueue = renderQueue
      .catch(() => {})
      .then(async () => {
        if (disposed) return
        try {
          const result = await mermaid.render(`mermaid${id}`, source)
          if (!disposed) {
            setSvg(result.svg)
            setError('')
          }
        } catch (failure) {
          if (!disposed) setError(failure instanceof Error ? failure.message : 'Invalid diagram')
        }
      })
    return () => {
      disposed = true
    }
  }, [id, source])
  return error ? (
    <pre className="render-error">{source}</pre>
  ) : (
    <div className="mermaid-view" dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
