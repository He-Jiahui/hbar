import { Component, lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { Check, Code2, Copy, Eye } from 'lucide-react'
import { useUIPlugins } from './ui-plugins'
import { copyText } from './browser-utils'
import { report } from './stores'
import GlassSurface from './react-bits/GlassSurface'
const CodeEditor = lazy(() => import('./CodeEditor'))
const MermaidView = lazy(() => import('./MermaidView'))
const ChartView = lazy(() => import('./ChartView'))
const FlowView = lazy(() => import('./FlowView'))
class RenderBoundary extends Component<{ children: ReactNode; source: string }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    return this.state.error ? <pre>{this.props.source}</pre> : this.props.children
  }
}
function CodeBlock({ source, language, streaming }: { source: string; language: string; streaming: boolean }) {
  const [raw, setRaw] = useState(false),
    [copied, setCopied] = useState(false)
  const CustomRenderer = useUIPlugins((state) => state.renderers[language])
  const rich = ['mermaid', 'chart', 'flow'].includes(language) || Boolean(CustomRenderer)
  return (
    <div className="code-block rb-code-surface">
      <GlassSurface className="code-block-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="code-toolbar">
        <span>{language || 'text'}</span>
        <div>
          {rich && (
            <button
              type="button"
              title={raw ? '预览' : '源码'}
              aria-label={raw ? '预览' : '源码'}
              onClick={() => setRaw(!raw)}
            >
              {raw ? <Eye size={14} /> : <Code2 size={14} />}
            </button>
          )}
          <button
            type="button"
            title="复制代码"
            aria-label="复制代码"
            onClick={() => {
              void copyText(source)
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                })
                .catch(report)
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <RenderBoundary source={source}>
        <Suspense fallback={<pre>{source}</pre>}>
          {streaming ? (
            <pre>{source}</pre>
          ) : !raw && CustomRenderer ? (
            <CustomRenderer source={source} />
          ) : !raw && language === 'mermaid' ? (
            <MermaidView source={source} />
          ) : !raw && language === 'chart' ? (
            <ChartView source={source} />
          ) : !raw && language === 'flow' ? (
            <FlowView source={source} />
          ) : (
            <CodeEditor value={source} language={language} />
          )}
        </Suspense>
      </RenderBoundary>
    </div>
  )
}
export default function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const source = String(children).replace(/\n$/, '')
            return className || String(children).includes('\n') ? (
              <CodeBlock source={source} language={className?.replace('language-', '') ?? ''} streaming={streaming} />
            ) : (
              <code>{children}</code>
            )
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => <span className="external-image">{alt || src}</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
