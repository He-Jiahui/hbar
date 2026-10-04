import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageMarkdown } from '../packages/app-react/src/message-markdown'
import { HbarMessageBlocks } from '../packages/app-react/src/session-message'
import { HbarHistoricalPlanMessage } from '../packages/app-react/src/proposed-plan-message'
import { HbarFileMarkdownPreview } from '../packages/app-react/src/file-markdown-preview'
import { getShellCopy } from '../apps/web/src/shell-copy'

const graph = 'flowchart TD\n A[Read] --> B[Continue]'
const text = `\`\`\`mermaid\n${graph}\n\`\`\``
for (const locale of ['en-US', 'zh-CN'] as const) {
  const copy = getShellCopy(locale)
  const labels = copy.session.messageBlocks.codeBlock
  test(`${locale}: real message, historical Plan and file use one Mermaid source and host-owned actions`, () => {
    const message = {
      sessionId: 's',
      messageId: 'm',
      blocks: [{ type: 'text' as const, text }],
      labels: copy.session.messageBlocks,
    }
    const bodies = [
      renderToStaticMarkup(<HbarMessageBlocks {...message} />),
      renderToStaticMarkup(
        <HbarHistoricalPlanMessage
          {...message}
          blocks={[{ type: 'text', text: `<proposed_plan>\n${text}\n</proposed_plan>` }]}
          readOnlyLabel={copy.session.proposedPlanReadOnly}
        />,
      ),
      renderToStaticMarkup(
        <HbarFileMarkdownPreview
          path="diagram.md"
          value={text}
          label={copy.files.textPreview('diagram.md')}
          imageLabel={copy.files.markdownImage}
          openFileLabel={copy.files.openLinkedFile}
          onOpenFile={() => {
            throw new Error('No actions in static render')
          }}
          code={{ previewId: 'file-preview', owner: {}, labels }}
        />,
      ),
    ]
    for (const html of bodies) {
      expect(html.match(/hbar-markdown-diagram/g)).toHaveLength(1)
      expect(html.match(/A\[Read\]/g)).toHaveLength(1)
      expect(html).toContain(labels.diagram.source)
      expect(html).toContain(labels.diagram.loading)
      expect(html).toContain('hidden=""')
      expect(html).not.toContain('hbar-diagram-svg')
    }
  })
  test(`${locale}: ordinary unfinished message takes streaming status without requiring file navigation context`, () => {
    const html = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={[{ type: 'text', text }]}
        labels={copy.session.messageBlocks}
        streaming
      />,
    )
    expect(html).toContain(labels.diagram.generating)
    expect(html).not.toContain(labels.diagram.loading)
  })
}
test('plain detected diagrams and explicitly typed non-diagram code have distinct rendering semantics', () => {
  const labels = getShellCopy('en-US').session.messageBlocks.codeBlock
  const render = (language: string) =>
    renderToStaticMarkup(
      <MessageMarkdown
        text={`\`\`\`${language}\n${graph}\n\`\`\``}
        code={{ sessionId: 's', messageId: 'm', segmentId: 'text:0', labels }}
      />,
    )
  expect(render('plaintext')).toContain('hbar-markdown-diagram')
  expect(render('javascript')).not.toContain('hbar-markdown-diagram')
})
