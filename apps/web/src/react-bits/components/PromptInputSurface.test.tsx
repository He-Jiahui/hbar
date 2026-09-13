import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'
import type { ArtifactRef } from '@hbar/contracts'
import PromptInputSurface, { type PromptInputLabels } from './PromptInputSurface'

const labels: PromptInputLabels = {
  messageComposer: 'Message composer',
  pendingAttachments: 'Pending attachments',
  removeImage: 'Remove image',
  removeFile: 'Remove file',
  dropToUpload: 'Drop to upload',
  archivedSession: 'Archived session',
  sendMessage: 'Send a message',
  message: 'Message',
  slashCommands: 'Slash commands',
  uploading: 'Uploading',
  stopRunning: 'Stop running',
  queueMessage: 'Queue message',
  send: 'Send',
}

const image: ArtifactRef = { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'diagram.png', mime: 'image/png', size: 128 }

test('prompt input surface owns the ReactBits composer interaction boundary', () => {
  const markup = renderToStaticMarkup(
    createElement(PromptInputSurface, {
      draft: '/help',
      images: [image],
      files: [],
      artifactUrl: (id) => `/artifacts/${id}`,
      composerActions: [{ id: 'help', label: 'Help', group: 'tools', icon: 'wrench', keywords: ['help'] }],
      labels,
      actionMenu: () => createElement('button', { type: 'button' }, 'Actions'),
      permissionControl: createElement('span', null, 'Permission'),
      modelControl: createElement('span', null, 'Model'),
      filterActions: (actions, query) => actions.filter((action) => action.id.includes(query)),
      onDraftChange: () => undefined,
      onSend: () => undefined,
      onAttach: () => undefined,
      onSelectAction: () => undefined,
      onRemoveImage: () => undefined,
      onRemoveFile: () => undefined,
      onStopRun: () => undefined,
      busy: false,
      uploading: false,
      imageAccept: 'image/*',
    }),
  )

  expect(markup).toContain('rb-prompt-input-surface')
  expect(markup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1"')
  expect(markup).toContain('diagram.png')
  expect(markup).toContain('Actions')
})
