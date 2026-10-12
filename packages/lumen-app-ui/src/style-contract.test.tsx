import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { createRenderer, screen } from '@mui/internal-test-utils'
import { LumenConversation } from './session-components'
import { LumenPageHeader } from './workspace-components'
import { LumenInput } from './forms'
import { LumenButton, LumenStatus } from './primitives'
import { lumenPartSelector } from './style-contract'

describe('public host styling points', () => {
  const { render } = createRenderer()
  it('exposes stable reading, heading and control points without requiring their internal classes', () => {
    const { container } = render(
      <React.Fragment>
        <LumenPageHeader title="A long localized workspace title" context="Host-owned context" />
        <LumenConversation
          title="Conversation"
          empty="No messages"
          messages={[]}
          composer={<LumenInput aria-label="Draft" />}
        />
        <LumenButton>Send</LumenButton>
        <LumenStatus value="Connected" />
      </React.Fragment>,
    )
    expect(container.querySelector(lumenPartSelector('conversation.messages'))).not.toBeNull()
    expect(container.querySelector(lumenPartSelector('conversation.content'))?.textContent).toContain('No messages')
    expect(container.querySelector(lumenPartSelector('page-header.title'))?.textContent).toBe(
      'A long localized workspace title',
    )
    expect(screen.getByRole('textbox', { name: 'Draft' }).getAttribute('data-lumen-part')).toBe('control')
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('data-lumen-part')).toBe('button')
    expect(container.querySelector(lumenPartSelector('status'))?.textContent).toBe('Connected')
  })
})
