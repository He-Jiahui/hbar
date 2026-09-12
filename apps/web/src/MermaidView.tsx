import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'
import GlassSurface from './react-bits/GlassSurface'
import { useThemeSettings } from './theme-store'
let renderQueue: Promise<unknown> = Promise.resolve()
export default function MermaidView({ source }: { source: string }) {
  const theme = useThemeSettings((state) => state.profile)
  const id = useId().replace(/[^a-zA-Z0-9]/g, ''),
    [svg, setSvg] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        background: theme.colors.background,
        primaryColor: theme.colors.surfaceElevated,
        primaryTextColor: theme.colors.textPrimary,
        primaryBorderColor: theme.colors.borderStrong,
        lineColor: theme.colors.secondary,
        secondaryColor: theme.colors.surface,
        tertiaryColor: theme.colors.codeBackground,
      },
      maxTextSize: 30_000,
      maxEdges: 200,
      suppressErrorRendering: true,
    })
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
  }, [id, source, theme])
  return error ? (
    <pre className="render-error">{source}</pre>
  ) : (
    <div className="mermaid-view rb-render-surface">
      <GlassSurface className="render-surface-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="render-surface-content" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}
