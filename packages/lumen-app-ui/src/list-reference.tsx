'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput, LumenSelect } from './forms'
import { LumenButton, LumenIconButton, LumenStatus } from './primitives'
import type { LumenListChoice } from './list'
import type {
  LumenListReferenceAction,
  LumenListReferenceContent as Content,
  LumenListReferenceRow as Row,
  LumenListReferenceNode,
} from './list-reference-contracts'

function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const ids = new Set<string>()
  return items.filter(({ id }) => {
    if (!id.trim() || ids.has(id)) {
      return false
    }
    ids.add(id)
    return true
  })
}
function Glyph({
  name,
}: {
  readonly name:
    'arrow' | 'chevron' | 'grip' | 'file' | 'folder' | 'mail' | 'archive' | 'clock' | 'check' | 'image' | 'video'
}) {
  const paths = {
    arrow: 'M4 12 12 4M4 4h8v8',
    chevron: 'm5 3 5 5-5 5',
    grip: 'M5 3h.01M10 3h.01M5 8h.01M10 8h.01M5 13h.01M10 13h.01',
    file: 'M4 2h5l3 3v9H4Zm5 0v4h3M6 9h4M6 11h4',
    folder: 'M2 4h4l2 2h6v7H2Z',
    mail: 'M2 4h12v9H2Zm0 0 6 5 6-5',
    archive: 'M2 3h12v3H2Zm1 3v7h10V6M6 9h4',
    clock: 'M8 4v4l3 2M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',
    check: 'm3 8 3 3 7-7',
    image: 'M2 2h12v12H2Zm0 9 4-4 3 3 3-4 2 2M5 5h.01',
    video: 'M4 2h5l3 3v9H4Zm2 5v5l4-2.5Z',
  }
  return (
    <svg className="lumen-list-reference-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
function Tabs({
  content,
  choices = content.choices,
  selectedId = content.selectedId,
  slot = 'range',
}: {
  readonly content: Content
  readonly choices?: readonly LumenListChoice[] | undefined
  readonly selectedId?: string | undefined
  readonly slot?: string | undefined
}) {
  return choices.length ? (
    <div className="lumen-list-reference-tabs" role="tablist" aria-label={content.labels.choices}>
      {unique(choices).map((choice) => (
        <LumenButton
          key={choice.id}
          role="tab"
          variant="text"
          tone={selectedId === choice.id ? 'primary' : 'neutral'}
          indicatorState={selectedId === choice.id ? 'selected' : 'idle'}
          aria-selected={selectedId === choice.id}
          disabled={choice.disabled}
          onClick={() => content.onSelect(slot, choice.id)}
        >
          {choice.label}
        </LumenButton>
      ))}
    </div>
  ) : null
}
function Action({ content, action }: { readonly content: Content; readonly action: LumenListReferenceAction }) {
  return (
    <LumenButton variant="outlined" disabled={action.disabled} onClick={() => content.onRequest(action)}>
      {action.label}
    </LumenButton>
  )
}
function Header({ content }: { readonly content: Content }) {
  return (
    <header className="lumen-list-reference-header">
      <div className="lumen-list-reference-heading">
        {content.kind === 'runbook' ? <small>{content.eyebrow}</small> : null}
        <h2>{content.title}</h2>
        <p>{content.subtitle}</p>
      </div>
      <div className="lumen-list-reference-controls">
        {content.kind === 'security' ? (
          <LumenButton
            variant="outlined"
            aria-pressed={content.flaggedOnly}
            onClick={() => content.onFlag('flagged', !content.flaggedOnly)}
          >
            {content.flaggedLabel}
          </LumenButton>
        ) : null}
        {content.kind === 'suppliers' ? (
          <LumenInput
            className="lumen-list-reference-search"
            value={content.query}
            aria-label={content.searchLabel}
            placeholder={content.searchPlaceholder}
            onChange={(event) => content.onQuery(event.target.value)}
          />
        ) : null}
        {content.kind === 'suppliers' && content.query ? (
          <LumenButton variant="text" onClick={() => content.onQuery('')}>
            {content.clearLabel}
          </LumenButton>
        ) : null}
        {content.kind === 'deliveries' ? (
          <LumenSelect
            value={content.endpointId}
            aria-label={content.endpointLabel}
            onChange={(event) => content.onSelect('endpoint', event.target.value)}
          >
            {content.endpointChoices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </LumenSelect>
        ) : null}
        {content.kind === 'suppliers' ? (
          <LumenSelect
            aria-label={content.labels.choices}
            value={content.selectedId}
            onChange={(event) => content.onSelect('range', event.target.value)}
          >
            {content.choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </LumenSelect>
        ) : (
          <Tabs content={content} />
        )}
        {content.kind === 'leaderboard' ? (
          <Tabs content={content} choices={content.periodChoices} selectedId={content.periodId} slot="period" />
        ) : null}
        {content.actions.map((action) => (
          <Action key={action.id} content={content} action={action} />
        ))}
      </div>
    </header>
  )
}
function Identity({ row }: { readonly row: Row }) {
  return (
    <React.Fragment>
      {row.abbreviation ? <span className="lumen-list-reference-avatar">{row.abbreviation}</span> : null}
      <span className="lumen-list-reference-identity">
        <strong>{row.title}</strong>
        <small>{row.detail}</small>
      </span>
    </React.Fragment>
  )
}
function Values({ row }: { readonly row: Row }) {
  return (
    <span className={`lumen-list-reference-values is-${row.tone ?? 'neutral'}`}>
      <strong>{row.value}</strong>
      <small>{row.delta ?? row.time}</small>
    </span>
  )
}
function Empty({ content }: { readonly content: Content }) {
  return (
    <p className="lumen-list-reference-empty" role="status">
      {content.labels.empty}
      {content.kind === 'suppliers' && content.query ? <small>{content.emptyDetail(content.query)}</small> : null}
    </p>
  )
}
function Metrics({ content }: { readonly content: Extract<Content, { kind: 'metrics' }> }) {
  return (
    <ul className="lumen-list-reference-collection is-metrics">
      {unique(content.rows).map((row) => (
        <li key={row.id} data-row-id={row.id}>
          <div className="lumen-list-reference-row">
            <span className="lumen-list-reference-avatar">
              <Glyph name="file" />
            </span>
            <span className="lumen-list-reference-identity">
              <span className="lumen-list-reference-metric-value">
                <strong>{row.value}</strong>
                <small className={`is-${row.tone ?? 'neutral'}`}>{row.delta}</small>
              </span>
              <span>{row.title}</span>
            </span>
            <LumenIconButton
              variant="outlined"
              label={content.showLabel(row.title)}
              aria-expanded={content.expandedIds.includes(row.id)}
              onClick={() => content.onFlag(`expanded-${row.id}`, !content.expandedIds.includes(row.id))}
            >
              <Glyph name="arrow" />
            </LumenIconButton>
          </div>
          {content.expandedIds.includes(row.id) ? (
            <p className="lumen-list-reference-disclosure">{row.definition}</p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
function Spend({ content }: { readonly content: Extract<Content, { kind: 'spend' }> }) {
  return (
    <ul className="lumen-list-reference-collection">
      {unique(content.rows).map((row) => (
        <li key={row.id}>
          <LumenButton
            variant="text"
            className="lumen-list-reference-row"
            aria-pressed={content.activeId === row.id}
            tone={content.activeId === row.id ? 'primary' : 'neutral'}
            onClick={() => content.onSelect('entry', row.id)}
          >
            <Identity row={row} />
            <Values row={row} />
          </LumenButton>
        </li>
      ))}
    </ul>
  )
}
function Security({ content }: { readonly content: Extract<Content, { kind: 'security' }> }) {
  const groups = [...new Set(content.rows.map(({ group }) => group))]
  return (
    <div className="lumen-list-reference-collection">
      {groups.map((group) => (
        <section key={group} className="lumen-list-reference-group">
          <h3>{group}</h3>
          <ul>
            {unique(content.rows.filter((row) => row.group === group)).map((row) => (
              <li className={`lumen-list-reference-row is-${row.tone ?? 'neutral'}`} key={row.id}>
                <Identity row={row} />
                {row.status ? <LumenStatus value={row.status} tone={row.tone} /> : null}
                <small>{row.time}</small>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
function Queue({ content }: { readonly content: Extract<Content, { kind: 'queue' }> }) {
  const rows = unique(content.rows)
  const [picked, setPicked] = React.useState<
    { readonly id: string; readonly originalIds: readonly string[] } | undefined
  >()
  const [announcement, setAnnouncement] = React.useState('')
  function key(event: React.KeyboardEvent<HTMLButtonElement>, row: Row, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (picked?.id === row.id) {
        setPicked(undefined)
        setAnnouncement(content.moveLabel(row.title, index + 1))
      } else {
        setPicked({ id: row.id, originalIds: rows.map(({ id }) => id) })
        setAnnouncement(content.pickedLabel(row.title))
      }
    }
    if (picked?.id !== row.id) {
      return
    }
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault()
      content.onMove(row.id, rows[index - 1]?.id)
      setAnnouncement(content.moveLabel(row.title, index))
    }
    if (event.key === 'ArrowDown' && index < rows.length - 1) {
      event.preventDefault()
      content.onMove(row.id, rows[index + 2]?.id)
      setAnnouncement(content.moveLabel(row.title, index + 2))
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      picked.originalIds.forEach((id) => content.onMove(id, undefined))
      setPicked(undefined)
      setAnnouncement(content.cancelledLabel)
    }
  }
  return (
    <React.Fragment>
      <ol className="lumen-list-reference-collection">
        {rows.map((row, index) => (
          <li
            className={`lumen-list-reference-row ${picked?.id === row.id ? 'is-picked' : ''}`}
            key={row.id}
            data-row-id={row.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              content.onMove(event.dataTransfer.getData('text/plain'), row.id)
              setPicked(undefined)
            }}
          >
            <LumenIconButton
              variant="text"
              draggable
              disabled={row.disabled}
              label={content.reorderLabel(row.title, index + 1, rows.length)}
              aria-pressed={picked?.id === row.id}
              onKeyDown={(event) => key(event, row, index)}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', row.id)
                setPicked({ id: row.id, originalIds: rows.map(({ id }) => id) })
              }}
              onDragEnd={() => setPicked(undefined)}
            >
              <Glyph name="grip" />
            </LumenIconButton>
            <small>{index + 1}</small>
            <Identity row={row} />
            <small>{row.time}</small>
          </li>
        ))}
      </ol>
      {announcement ? (
        <p className="lumen-list-reference-notice" role="status">
          {announcement}
        </p>
      ) : null}
    </React.Fragment>
  )
}
function Assets({ content }: { readonly content: Extract<Content, { kind: 'assets' }> }) {
  const rows = unique(content.rows)
  const selected = content.selectedIds
  return (
    <React.Fragment>
      <div className="lumen-list-reference-selection-bar">
        <LumenCheckBoxControl
          checked={rows.length > 0 && rows.every(({ id }) => selected.includes(id))}
          disabled={!rows.length}
          aria-label={content.selectAllLabel}
          onChange={(event) => content.onFlag('select-all', event.target.checked)}
        />
        <span>{content.selectAllLabel}</span>
        <span>{selected.length ? content.selectionLabel(selected.length) : content.footer}</span>
        {selected.length
          ? content.bulkActions.map((action) => <Action key={action.id} action={action} content={content} />)
          : null}
      </div>
      <ul className="lumen-list-reference-collection">
        {rows.map((row) => (
          <li className="lumen-list-reference-row" key={row.id}>
            <LumenCheckBoxControl
              aria-label={content.selectLabel(row.title)}
              checked={selected.includes(row.id)}
              disabled={row.disabled}
              onChange={(event) => content.onFlag(`selected-${row.id}`, event.target.checked)}
            />
            <span className="lumen-list-reference-avatar">
              <Glyph name={row.media} />
            </span>
            <Identity row={row} />
            <small className="lumen-list-reference-owner">{row.owner}</small>
            <small className="lumen-list-reference-time">{row.time}</small>
            <LumenStatus value={row.status ?? ''} tone={row.tone} />
          </li>
        ))}
      </ul>
    </React.Fragment>
  )
}
function Deliveries({ content }: { readonly content: Extract<Content, { kind: 'deliveries' }> }) {
  return (
    <ul className="lumen-list-reference-collection">
      {unique(content.rows).map((row) => (
        <li key={row.id} data-row-id={row.id}>
          <LumenButton
            variant="text"
            className="lumen-list-reference-row"
            aria-expanded={content.expandedIds.includes(row.id)}
            onClick={() => content.onFlag(`expanded-${row.id}`, !content.expandedIds.includes(row.id))}
          >
            <Identity row={row} />
            <Values row={row} />
            <Glyph name="chevron" />
          </LumenButton>
          {content.expandedIds.includes(row.id) ? (
            <div className="lumen-list-reference-delivery-body">
              <section>
                <h3>{content.requestLabel}</h3>
                <pre>{row.request}</pre>
              </section>
              <section>
                <h3>{content.responseLabel}</h3>
                <pre>{row.response}</pre>
              </section>
              <Action content={content} action={{ id: 'replay', value: row.id, label: content.replayLabel }} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
function Suppliers({ content }: { readonly content: Extract<Content, { kind: 'suppliers' }> }) {
  return (
    <div className="lumen-list-reference-table-scroll">
      <table className="lumen-list-reference-table">
        <thead>
          <tr>
            {content.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {unique(content.rows).map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <div className="lumen-list-reference-table-identity">
                  <Identity row={row} />
                </div>
              </th>
              <td>{row.category}</td>
              <td>
                <LumenStatus value={row.status ?? ''} tone={row.tone} />
              </td>
              <td>
                <Values row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function Inbox({ content }: { readonly content: Extract<Content, { kind: 'inbox' }> }) {
  return (
    <React.Fragment>
      <ul className="lumen-list-reference-collection">
        {unique(content.rows).map((row) => (
          <li
            key={row.id}
            data-row-id={row.id}
            className={`lumen-list-reference-row is-message ${row.unread ? 'is-unread' : 'is-read'}`}
          >
            <span className="lumen-list-reference-avatar">
              <Glyph name="mail" />
            </span>
            <Identity row={row} />
            <small>{row.time}</small>
            <div className="lumen-list-reference-row-actions">
              <LumenIconButton
                variant="text"
                label={row.unread ? content.markReadLabel : content.markUnreadLabel}
                onClick={() => content.onFlag(`read-${row.id}`, row.unread)}
              >
                <Glyph name="check" />
              </LumenIconButton>
              <LumenIconButton
                variant="text"
                label={content.snoozeLabel}
                onClick={() => content.onRequest({ id: 'snooze', value: row.id, label: content.snoozeLabel })}
              >
                <Glyph name="clock" />
              </LumenIconButton>
              <LumenIconButton
                variant="text"
                label={content.archiveLabel}
                onClick={() => content.onSelect('archive', row.id)}
              >
                <Glyph name="archive" />
              </LumenIconButton>
            </div>
          </li>
        ))}
      </ul>
      {content.archiveNotice ? (
        <p className="lumen-list-reference-notice" role="status">
          {content.archiveNotice}
          <LumenButton variant="text" onClick={() => content.onSelect('archive', 'none')}>
            {content.undoLabel}
          </LumenButton>
        </p>
      ) : null}
    </React.Fragment>
  )
}
function Contacts({ content }: { readonly content: Extract<Content, { kind: 'contacts' }> }) {
  const sections = React.useRef(new Map<string, HTMLElement>())
  React.useEffect(() => {
    if (content.selectedLetter) {
      sections.current.get(content.selectedLetter)?.scrollIntoView({ block: 'nearest' })
    }
  }, [content.selectedLetter])
  return (
    <div className="lumen-list-reference-contacts">
      <div className="lumen-list-reference-collection">
        {content.letters
          .filter((letter) => content.rows.some((row) => row.letter === letter))
          .map((letter) => (
            <section
              className="lumen-list-reference-group"
              key={letter}
              ref={(node) => {
                if (node) {
                  sections.current.set(letter, node)
                } else {
                  sections.current.delete(letter)
                }
              }}
            >
              <h3>{letter}</h3>
              <ul>
                {unique(content.rows.filter((row) => row.letter === letter)).map((row) => (
                  <li className="lumen-list-reference-row" key={row.id}>
                    <Identity row={row} />
                    <LumenIconButton
                      variant="outlined"
                      label={content.emailLabel(row.title)}
                      onClick={() =>
                        content.onRequest({
                          id: 'email',
                          label: content.emailLabel(row.title),
                          value: row.id,
                        })
                      }
                    >
                      <Glyph name="mail" />
                    </LumenIconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
      <nav className="lumen-list-reference-alphabet" aria-label={content.labels.choices}>
        {content.letters.map((letter) => (
          <LumenButton
            key={letter}
            variant="text"
            disabled={!content.rows.some((row) => row.letter === letter)}
            aria-current={content.selectedLetter === letter ? 'location' : undefined}
            aria-label={content.jumpLabel(letter)}
            onClick={() => content.onSelect('letter', letter)}
          >
            {letter}
          </LumenButton>
        ))}
      </nav>
    </div>
  )
}
function Runbook({ content }: { readonly content: Extract<Content, { kind: 'runbook' }> }) {
  return (
    <React.Fragment>
      <div className="lumen-list-reference-progress">
        <progress
          max={Math.max(1, content.rows.length)}
          value={content.completedIds.length}
          aria-label={content.progressLabel(content.completedIds.length, content.rows.length)}
        />
        <span>{content.progressLabel(content.completedIds.length, content.rows.length)}</span>
      </div>
      <ol className="lumen-list-reference-collection">
        {unique(content.rows).map((row, index) => (
          <li className={`lumen-list-reference-row ${row.disabled ? 'is-disabled' : ''}`} key={row.id}>
            <LumenCheckBoxControl
              aria-label={
                content.completedIds.includes(row.id)
                  ? content.incompleteLabel(row.title, index + 1)
                  : content.completeLabel(row.title, index + 1)
              }
              checked={content.completedIds.includes(row.id)}
              disabled={row.disabled}
              onChange={(event) => content.onFlag(`completed-${row.id}`, event.target.checked)}
            />
            <Identity row={row} />
            <a
              href={content.runbookHref(row.id)}
              aria-label={content.openLabel(row.title)}
              aria-disabled={row.disabled}
              tabIndex={row.disabled ? -1 : 0}
              onClick={(event) => {
                event.preventDefault()
                if (!row.disabled) {
                  content.onRequest({ id: 'runbook', value: row.id, label: content.runbookLabel })
                }
              }}
            >
              {content.runbookLabel}
              <Glyph name="arrow" />
            </a>
          </li>
        ))}
      </ol>
    </React.Fragment>
  )
}
function Leaderboard({ content }: { readonly content: Extract<Content, { kind: 'leaderboard' }> }) {
  return (
    <div className="lumen-list-reference-table-scroll">
      <table className="lumen-list-reference-table">
        <thead>
          <tr>
            {content.columns.map((column, i) => (
              <th scope="col" key={i}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {unique(content.rows).map((row, index) => (
            <tr key={row.id}>
              <td>{index + 1}</td>
              <td>{row.trend}</td>
              <th scope="row">
                <div className="lumen-list-reference-table-identity">
                  <Identity row={row} />
                </div>
              </th>
              <td>{row.resolved}</td>
              <td>{row.response}</td>
              <td>{row.satisfaction}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              {content.totals[0]}
            </th>
            {content.totals.slice(1).map((value, i) => (
              <td key={i}>{value}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
function Tree({ content }: { readonly content: Extract<Content, { kind: 'tree' }> }) {
  const root = React.useRef<HTMLUListElement>(null)
  const nodes = unique(content.nodes)
  function key(event: React.KeyboardEvent<HTMLButtonElement>, node: LumenListReferenceNode) {
    if (event.key === 'ArrowRight' && node.kind === 'folder') {
      event.preventDefault()
      content.onFlag(`expanded-${node.id}`, true)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (node.kind === 'folder' && content.expandedIds.includes(node.id)) {
        content.onFlag(`expanded-${node.id}`, false)
      } else if (node.parentId) {
        root.current?.querySelector<HTMLButtonElement>(`[data-node-id="${CSS.escape(node.parentId)}"]`)?.focus()
      }
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button[role="treeitem"]') ?? [])]
      const index = buttons.indexOf(event.currentTarget)
      let next = index
      if (event.key === 'ArrowDown') {
        next = Math.min(buttons.length - 1, index + 1)
      }
      if (event.key === 'ArrowUp') {
        next = Math.max(0, index - 1)
      }
      if (event.key === 'Home') {
        next = 0
      }
      if (event.key === 'End') {
        next = buttons.length - 1
      }
      buttons[next]?.focus()
    }
  }
  function children(parentId: string | undefined, ancestors: readonly string[]): React.ReactNode {
    if (ancestors.length > 32) {
      return null
    }
    return nodes
      .filter((node) => node.parentId === parentId && !ancestors.includes(node.id))
      .map((node) => (
        <li role="presentation" key={node.id}>
          <LumenButton
            variant="text"
            className="lumen-list-reference-tree-row"
            role="treeitem"
            data-node-id={node.id}
            aria-level={ancestors.length + 1}
            aria-expanded={node.kind === 'folder' ? content.expandedIds.includes(node.id) : undefined}
            aria-selected={node.id === content.activeId}
            tone={node.id === content.activeId ? 'primary' : 'neutral'}
            onClick={() => {
              content.onSelect('entry', node.id)
              if (node.kind === 'folder') {
                content.onFlag(`expanded-${node.id}`, !content.expandedIds.includes(node.id))
              }
            }}
            onKeyDown={(event) => key(event, node)}
          >
            {node.kind === 'folder' ? <Glyph name="chevron" /> : null}
            <Glyph name={node.kind} />
            <strong>{node.name}</strong>
            <small>{node.detail}</small>
          </LumenButton>
          {node.kind === 'folder' && content.expandedIds.includes(node.id) ? (
            <ul role="group">
              {node.childrenKnown ? (
                children(node.id, [...ancestors, node.id])
              ) : (
                <li className="lumen-list-reference-empty">{content.unknownLabel}</li>
              )}
            </ul>
          ) : null}
        </li>
      ))
  }
  return (
    <ul ref={root} className="lumen-list-reference-collection is-tree" role="tree" aria-label={content.title}>
      {children(undefined, [])}
    </ul>
  )
}
function Body({ content }: { readonly content: Content }) {
  if (content.available === false) {
    return (
      <p className="lumen-list-reference-empty" role="status">
        {content.labels.unavailable}
      </p>
    )
  }
  if ('rows' in content && !content.rows.length) {
    return <Empty content={content} />
  }
  switch (content.kind) {
    case 'metrics':
      return <Metrics content={content} />
    case 'spend':
      return <Spend content={content} />
    case 'security':
      return <Security content={content} />
    case 'queue':
      return <Queue content={content} />
    case 'assets':
      return <Assets content={content} />
    case 'deliveries':
      return <Deliveries content={content} />
    case 'suppliers':
      return <Suppliers content={content} />
    case 'inbox':
      return <Inbox content={content} />
    case 'contacts':
      return <Contacts content={content} />
    case 'runbook':
      return <Runbook content={content} />
    case 'leaderboard':
      return <Leaderboard content={content} />
    case 'tree':
      return content.nodes.length ? <Tree content={content} /> : <Empty content={content} />
    default:
      return null
  }
}
export default function LumenListReference({
  content,
  notice,
}: {
  readonly content: Content
  readonly notice?: string | undefined
}) {
  return (
    <div
      className={`lumen-list-reference is-${content.kind} is-${content.listStrategy.kind}`}
      data-reference-kind={content.kind}
      data-list-strategy={content.listStrategy.kind}
      data-expected-maximum={content.listStrategy.expectedMaximum}
    >
      <Header content={content} />
      <Body content={content} />
      {content.footer && content.kind !== 'assets' ? (
        <footer className="lumen-list-reference-footer">{content.footer}</footer>
      ) : null}
      {notice ? (
        <p className="lumen-list-reference-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
