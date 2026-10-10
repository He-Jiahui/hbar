import ReactMarkdown from 'react-markdown'
import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import type { PluggableList } from 'unified'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { FileCodeContext, FileMarkdownPre, type FileMarkdownCodeContext } from './file-markdown-code-block'
import './file-markdown-preview.css'

export const FILE_MARKDOWN_PREVIEW_BYTES = 128 * 1024
// Document-relative links must retain their authored href. Chat reference
// transforms intentionally replace hrefs with session-owned file metadata.
const fileMarkdownRemarkPlugins: PluggableList = [remarkGfm]
const fileMarkdownRehypePlugins: PluggableList = [rehypeSanitize]

export function isMarkdownFile(path: string): boolean {
  return /\.(?:md|markdown)$/i.test(path)
}

export function canRenderFileMarkdown(path: string, text: string): boolean {
  return (
    isMarkdownFile(path) &&
    text.length <= FILE_MARKDOWN_PREVIEW_BYTES &&
    new TextEncoder().encode(text).byteLength <= FILE_MARKDOWN_PREVIEW_BYTES
  )
}

export function resolveMarkdownFileLink(documentPath: string, href: string): string | null {
  if (!href || href.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|[/\\])/i.test(href)) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(href.split('#')[0] ?? '')
  } catch {
    return null
  }
  if (
    !decoded ||
    [...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    /[:?#\\]/.test(decoded) ||
    decoded.startsWith('/')
  )
    return null
  const parts = documentPath.split('/').slice(0, -1)
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(part)
  }
  return parts.length ? parts.join('/') : null
}

/** Host-owned text: no HTML execution or automatic image/local-resource requests. */
export function HbarFileMarkdownPreview({
  path,
  value,
  label,
  imageLabel,
  openFileLabel,
  onOpenFile,
  code,
}: {
  readonly path: string
  readonly value: string
  readonly label: string
  readonly imageLabel: (alt: string) => string
  readonly openFileLabel: (path: string) => string
  readonly onOpenFile: (path: string) => void
  readonly code: Omit<FileMarkdownCodeContext, 'source' | 'path'>
}) {
  return (
    <LumenFrame className="hbar-file-markdown-preview" role="region" aria-label={label} tabIndex={0}>
      <FileCodeContext value={{ ...code, source: value, path }}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={fileMarkdownRemarkPlugins}
          rehypePlugins={fileMarkdownRehypePlugins}
          components={{
            pre: FileMarkdownPre,
            a: ({ href, children }) => {
              const file = href ? resolveMarkdownFileLink(path, href) : null
              if (file)
                return (
                  <LumenButton
                    variant="text"
                    className="hbar-file-markdown-local-link"
                    aria-label={openFileLabel(file)}
                    onClick={() => onOpenFile(file)}
                  >
                    {children}
                  </LumenButton>
                )
              // External addresses follow the existing message-link contract: explicit click only.
              if (href && /^(?:https?:|mailto:)/i.test(href))
                return (
                  <LumenFrame
                    as="a"
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hbar-file-markdown-external-link"
                  >
                    {children}
                  </LumenFrame>
                )
              return <LumenContentText context="message.inline">{children}</LumenContentText>
            },
            img: ({ alt }) => (
              <LumenContentText context="message.inline" className="hbar-file-markdown-image">
                {imageLabel(alt ?? '')}
              </LumenContentText>
            ),
          }}
        >
          {value}
        </ReactMarkdown>
      </FileCodeContext>
    </LumenFrame>
  )
}
