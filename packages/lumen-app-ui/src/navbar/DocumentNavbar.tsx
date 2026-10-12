'use client'

import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { LumenMenu, LumenPopover } from '../ui-controls'
import { ArrowLeft, History, MoreHorizontal, Share2 } from './glyphs'
import type { LumenNavbarDocumentContent } from './content'
import { uniqueLumenNavbarItems } from './content'
import {
  NavbarButton,
  NavbarFrame,
  NavbarGlyph,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
} from './primitives'

type DocumentSurface = 'history' | 'share' | 'actions' | null

export default function DocumentNavbar({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarDocumentContent
}) {
  const outline = uniqueLumenNavbarItems(content.outline)
  const [title, setTitle] = React.useState(content.title)
  const [draftTitle, setDraftTitle] = React.useState(content.title)
  const [editingTitle, setEditingTitle] = React.useState(false)
  const [openSurface, setOpenSurface] = React.useState<DocumentSurface>(null)
  const [copied, setCopied] = React.useState(false)
  const saveTitle = () => {
    const nextTitle = draftTitle.trim() || title
    setDraftTitle(nextTitle)
    setTitle(nextTitle)
    setEditingTitle(false)
    reportNavbarAction(onAction, spec, 'rename', nextTitle)
  }
  return (
    <NavbarFrame spec={spec} className="hbar-app-ui-navbar-document">
      <header>
        <NavbarIconOnly
          label={content.labels.back}
          icon={ArrowLeft}
          tier="sm"
          onClick={() => reportNavbarAction(onAction, spec, 'back')}
        />
        <div className="hbar-app-ui-navbar-document-summary">
          {editingTitle ? (
            <LumenInput
              autoFocus
              value={draftTitle}
              aria-label={content.labels.titleInput}
              onChange={(event) => setDraftTitle(event.currentTarget.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  setDraftTitle(title)
                  setEditingTitle(false)
                }
              }}
            />
          ) : (
            <NavbarButton
              onClick={() => {
                if (content.labels.titleInput) setEditingTitle(true)
                reportNavbarAction(onAction, spec, 'title')
              }}
            >
              <span>{title}</span>
            </NavbarButton>
          )}
          <span>{draftTitle === title ? content.labels.saved : content.labels.unsaved}</span>
        </div>
        <section>
          {content.avatars.map((avatar) => (
            <span key={avatar}>{avatar}</span>
          ))}
          <NavbarIconOnly
            label={content.labels.versionHistory}
            icon={History}
            tier="sm"
            aria-expanded={openSurface === 'history'}
            onClick={() => {
              if (content.history && content.labels.historyTitle) {
                setOpenSurface((current) => (current === 'history' ? null : 'history'))
              }
              reportNavbarAction(onAction, spec, 'history')
            }}
          />
          <NavbarButton
            className="hbar-app-ui-navbar-document-share"
            variant="solid"
            aria-expanded={openSurface === 'share'}
            onClick={() => {
              if (content.shareUrl && content.labels.shareTitle) {
                setOpenSurface((current) => (current === 'share' ? null : 'share'))
              }
              setCopied(false)
              reportNavbarAction(onAction, spec, 'share')
            }}
          >
            <NavbarGlyph icon={Share2} tier="sm" />
            <span>{content.labels.share}</span>
          </NavbarButton>
          <NavbarIconOnly
            label={content.labels.actions}
            icon={MoreHorizontal}
            tier="sm"
            aria-expanded={openSurface === 'actions'}
            onClick={() => {
              if (content.actions && content.labels.actionsMenu) {
                setOpenSurface((current) => (current === 'actions' ? null : 'actions'))
              }
              reportNavbarAction(onAction, spec, 'more')
            }}
          />
          {content.history && content.labels.historyTitle ? (
            <LumenPopover
              open={openSurface === 'history'}
              label={content.labels.historyTitle}
              className="hbar-app-ui-navbar-document-history"
            >
              {content.history.map((item) => (
                <NavbarButton
                  key={item.id}
                  onClick={() => {
                    reportNavbarAction(onAction, spec, 'history-version', item.id)
                    setOpenSurface(null)
                  }}
                >
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                </NavbarButton>
              ))}
            </LumenPopover>
          ) : null}
          {content.shareUrl &&
          content.labels.shareTitle &&
          content.labels.shareLink &&
          content.labels.copy &&
          content.labels.copied ? (
            <LumenPopover
              open={openSurface === 'share'}
              label={content.labels.shareTitle}
              className="hbar-app-ui-navbar-document-share-popover"
            >
              <p>{content.labels.shareDescription}</p>
              <div>
                <LumenInput readOnly value={content.shareUrl} aria-label={content.labels.shareLink} />
                <LumenButton
                  variant="outlined"
                  onClick={() => {
                    const shareUrl = content.shareUrl
                    if (shareUrl && navigator.clipboard) {
                      navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false))
                    }
                    reportNavbarAction(onAction, spec, 'copy-link')
                  }}
                >
                  {copied ? content.labels.copied : content.labels.copy}
                </LumenButton>
              </div>
            </LumenPopover>
          ) : null}
          {content.actions && content.labels.actionsMenu && content.labels.emptyMenu ? (
            <LumenMenu
              open={openSurface === 'actions'}
              label={content.labels.actionsMenu}
              items={content.actions}
              empty={content.labels.emptyMenu}
              onSelect={(id) => {
                reportNavbarAction(onAction, spec, 'document-action', id)
                setOpenSurface(null)
              }}
              className="hbar-app-ui-navbar-document-actions"
            />
          ) : null}
        </section>
      </header>
      <main
        data-hbar-app-ui-list-strategy={content.outlineStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.outlineStrategy.expectedMaximum}
      >
        <h1>{title}</h1>
        <p>{content.description}</p>
        {outline.map((item) => (
          <LumenButton
            type="button"
            variant="text"
            key={item.id}
            onClick={() => reportNavbarAction(onAction, spec, 'open', item.id)}
          >
            {item.label}
          </LumenButton>
        ))}
      </main>
    </NavbarFrame>
  )
}
