'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput } from './forms'
import { LumenButton, LumenIconButton } from './primitives'
import type { LumenFileManagerReferenceContent as Content } from './file-manager-reference-contracts'

const prefix = 'lumen-file-manager-reference'
function Glyph({
  name,
  tier = 'sm',
}: {
  readonly name: string
  readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
}) {
  const paths: Readonly<Record<string, string>> = {
    folder: 'M2 4h4l1 1h7v8H2Z',
    image: 'M2 2h12v12H2ZM3 12l4-4 3 3 2-2 2 3M5 5h.01',
    document: 'M4 2h5l3 3v9H4ZM9 2v3h3M6 8h4M6 11h4',
    file: 'M4 2h5l3 3v9H4ZM9 2v3h3',
    video: 'M2 4h8v8H2Zm8 2 4-2v8l-4-2',
    archive: 'M3 2h10v12H3ZM8 2v8M7 10h2v2H7Z',
    down: 'm3 6 5 5 5-5',
    right: 'm6 3 5 5-5 5',
    close: 'm4 4 8 8m0-8-8 8',
    search: 'm11 11 3 3M7 12A5 5 0 1 1 7 2a5 5 0 0 1 0 10Z',
    star: 'm8 2 1.8 3.7 4.2.6-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.6Z',
    more: 'M3 8h.01M8 8h.01M13 8h.01',
    list: 'M5 4h8M5 8h8M5 12h8M2 4h.01M2 8h.01M2 12h.01',
    grid: 'M2 2h5v5H2ZM9 2h5v5H9ZM2 9h5v5H2ZM9 9h5v5H9Z',
    upload: 'M8 11V2m-3 3 3-3 3 3M3 9v4h10V9',
    download: 'M8 2v8m-3-3 3 3 3-3M3 13h10',
    share:
      'M5 8.5 6-3m-6 2 6 3M3 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM13 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    pause: 'M5 3v10M11 3v10',
    play: 'm5 3 8 5-8 5Z',
    retry: 'M4 5H1V2m0 3a6 6 0 1 1 1 6',
    link: 'm6 10-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0m2-1 2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0m-3 1 6-6',
    copy: 'M6 5h7v8H6ZM3 3h7v2M3 3v8h3',
    sort: 'M5 3v10m-2-2 2 2 2-2M11 13V3m-2 2 2-2 2 2',
  }
  return (
    <svg className={`${prefix}-glyph`} data-tier={tier} viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name] ?? paths.file} />
    </svg>
  )
}
function Meter({ value, label }: { readonly value: number; readonly label: string }) {
  const progress = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      className={`${prefix}-meter`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <span style={{ inlineSize: `${progress}%` }} />
    </div>
  )
}
function Empty({ reference }: { readonly reference: Content }) {
  const message = !reference.available ? reference.labels.unavailable : reference.content.labels.empty
  return (
    <p className={`${prefix}-empty`} role="status">
      {message}
    </p>
  )
}
function Notice({ reference }: { readonly reference: Content }) {
  return reference.notice ? (
    <p className={`${prefix}-notice`} role="status">
      {reference.notice}
    </p>
  ) : null
}
function Selection({
  reference,
  actions,
}: {
  readonly reference: Extract<Content, { kind: 'drive' | 'assets' }>
  readonly actions: readonly { readonly id: string; readonly label: string }[]
}) {
  if (!reference.selectedIds.length) {
    return null
  }
  return (
    <footer
      className={`${prefix}-selection-footer`}
      aria-label={reference.labels.selected(reference.selectedIds.length)}
    >
      <span>{reference.labels.selected(reference.selectedIds.length)}</span>
      <div className={`${prefix}-actions`}>
        {actions.map(({ id, label }) => (
          <LumenButton key={id} variant="text" onClick={() => reference.onAction(id)}>
            {label}
          </LumenButton>
        ))}
        <LumenIconButton label={reference.labels.clearSelection} onClick={() => reference.onAction('clear-selection')}>
          <Glyph name="close" />
        </LumenIconButton>
      </div>
    </footer>
  )
}
function Drive({ reference }: { readonly reference: Extract<Content, { kind: 'drive' }> }) {
  const { content, selectedIds, expandedIds } = reference
  const rows = content.rows
  const all = rows.length > 0 && rows.every(({ id }) => selectedIds.includes(id))
  const sortDirection = (id: string): 'none' | 'ascending' | 'descending' => {
    if (reference.sortId !== id) {
      return 'none'
    }
    return reference.descending ? 'descending' : 'ascending'
  }
  const rootFolder = content.folders.find(({ parentId }) => parentId === undefined)
  const showSearchEmpty = reference.available && Boolean(reference.query) && rows.length === 0
  const renderFolders = (parentId: string | undefined, ancestors: readonly string[] = []): React.ReactNode => (
    <ul className={`${prefix}-tree`}>
      {content.folders
        .filter((folder) => folder.parentId === parentId && !ancestors.includes(folder.id))
        .map((folder) => {
          const expanded = expandedIds.includes(folder.id)
          return (
            <li key={folder.id}>
              <div className={`${prefix}-folder-row`}>
                {folder.expandable ? (
                  <LumenIconButton
                    label={
                      expanded ? content.labels.collapseFolder(folder.name) : content.labels.expandFolder(folder.name)
                    }
                    aria-expanded={expanded}
                    onClick={() => reference.onAction('expand', folder.id)}
                  >
                    <Glyph name={expanded ? 'down' : 'right'} tier="xs" />
                  </LumenIconButton>
                ) : (
                  <Glyph name="folder" tier="xs" />
                )}
                <LumenButton
                  variant="text"
                  aria-current={
                    reference.folderId === folder.id && reference.locationId === 'drive' ? 'page' : undefined
                  }
                  onClick={() => reference.onAction('folder', folder.id)}
                >
                  {folder.name}
                </LumenButton>
              </div>
              {expanded ? renderFolders(folder.id, [...ancestors, folder.id]) : null}
            </li>
          )
        })}
    </ul>
  )
  const nameCell = (row: (typeof rows)[number]) => (
    <div className={`${prefix}-file-name`}>
      <Glyph name={row.kind} />
      <LumenButton
        variant="text"
        aria-label={content.labels.openItem(row.name)}
        onClick={() => reference.onAction('open', row.id)}
      >
        {row.name}
      </LumenButton>
      <LumenIconButton
        label={row.starred ? content.labels.unstarItem(row.name) : content.labels.starItem(row.name)}
        aria-pressed={!!row.starred}
        onClick={() => reference.onAction('star', row.id)}
      >
        <Glyph name="star" tier="xs" />
      </LumenIconButton>
    </div>
  )
  const menuRow = rows.find(({ id }) => id === reference.menuId)
  return (
    <React.Fragment>
      <header className={`${prefix}-header`}>
        <div className={`${prefix}-heading`}>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.description}</p>
        </div>
        <div className={`${prefix}-actions`}>
          <LumenButton variant="outlined" onClick={() => reference.onAction('new-folder')}>
            <Glyph name="folder" />
            {content.labels.newFolder}
          </LumenButton>
          <LumenButton tone="primary" onClick={() => reference.onAction('upload')}>
            <Glyph name="upload" />
            {content.labels.upload}
          </LumenButton>
        </div>
      </header>
      <div className={`${prefix}-layout`}>
        <aside className={`${prefix}-sidebar`}>
          {rootFolder ? (
            <div className={`${prefix}-root-folder`}>
              <LumenIconButton
                label={
                  expandedIds.includes(rootFolder.id)
                    ? content.labels.collapseFolder(rootFolder.name)
                    : content.labels.expandFolder(rootFolder.name)
                }
                aria-expanded={expandedIds.includes(rootFolder.id)}
                onClick={() => reference.onAction('expand', rootFolder.id)}
              >
                <Glyph name={expandedIds.includes(rootFolder.id) ? 'down' : 'right'} tier="xs" />
              </LumenIconButton>
              <LumenButton variant="text" onClick={() => reference.onAction('folder', rootFolder.id)}>
                {rootFolder.name}
              </LumenButton>
            </div>
          ) : null}
          <nav aria-label={content.labels.myDrive}>
            {rootFolder && expandedIds.includes(rootFolder.id) ? renderFolders(rootFolder.id, [rootFolder.id]) : null}
            {!rootFolder ? renderFolders(undefined) : null}
          </nav>
          <nav className={`${prefix}-secondary`} aria-label={content.labels.shared}>
            {[
              { id: 'shared', label: content.labels.shared },
              { id: 'recent', label: content.labels.recent },
              { id: 'starred', label: content.labels.starred },
              { id: 'bin', label: content.labels.bin },
            ].map(({ id, label }) => (
              <LumenButton
                key={id}
                variant="text"
                aria-current={reference.locationId === id ? 'page' : undefined}
                onClick={() => reference.onChange('location', id)}
              >
                {label}
              </LumenButton>
            ))}
          </nav>
          <section className={`${prefix}-storage`} aria-label={content.labels.storage}>
            <div className={`${prefix}-value-row`}>
              <span>{content.labels.storage}</span>
              <span>{content.labels.storageProgress}</span>
            </div>
            <Meter value={content.storagePercent} label={content.labels.storage} />
            <small>{content.labels.storageSummary(content.storageUsed, content.storageTotal)}</small>
          </section>
        </aside>
        <main className={`${prefix}-main`}>
          <div className={`${prefix}-toolbar`}>
            <strong>{reference.folderLabel}</strong>
            <div className={`${prefix}-search`}>
              <Glyph name="search" />
              <LumenInput
                value={reference.query}
                aria-label={content.labels.search}
                placeholder={content.labels.search}
                onChange={(event) => reference.onChange('query', event.currentTarget.value)}
              />
            </div>
            <div className={`${prefix}-actions`} role="group" aria-label={reference.labels.viewGroup}>
              <LumenIconButton
                label={content.labels.listView}
                aria-pressed={reference.view === 'list'}
                onClick={() => reference.onChange('view', 'list')}
              >
                <Glyph name="list" />
              </LumenIconButton>
              <LumenIconButton
                label={content.labels.gridView}
                aria-pressed={reference.view === 'grid'}
                onClick={() => reference.onChange('view', 'grid')}
              >
                <Glyph name="grid" />
              </LumenIconButton>
            </div>
          </div>
          <div
            className={`${prefix}-collection`}
            data-list-strategy={content.listStrategy.kind}
            data-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {showSearchEmpty ? (
              <div className={`${prefix}-empty-search`}>
                <p className={`${prefix}-empty`} role="status">
                  <strong>{reference.labels.nothingHere}</strong>
                  {reference.labels.emptySearch(reference.query, reference.folderLabel)}
                </p>
                <LumenButton variant="text" onClick={() => reference.onChange('query', '')}>
                  {reference.labels.clearSearch}
                </LumenButton>
              </div>
            ) : null}
            {(!reference.available || !rows.length) && !showSearchEmpty ? <Empty reference={reference} /> : null}
            {reference.available && rows.length > 0 && reference.view === 'grid' ? (
              <ul className={`${prefix}-cards`}>
                {rows.map((row) => (
                  <li key={row.id} className={`${prefix}-card`} data-row-id={row.id}>
                    <button
                      type="button"
                      className={`${prefix}-preview`}
                      aria-label={content.labels.selectItem(row.name)}
                      aria-pressed={selectedIds.includes(row.id)}
                      onClick={() => reference.onAction('select', row.id)}
                    >
                      <Glyph name={row.kind} tier="xl" />
                    </button>
                    <div className={`${prefix}-card-copy`}>
                      {nameCell(row)}
                      <small>{reference.labels.fileSummary(row.size, row.detail)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {reference.available && rows.length > 0 && reference.view === 'list' ? (
              <table className={`${prefix}-table`}>
                <thead>
                  <tr>
                    <th>
                      <LumenCheckBoxControl
                        checked={all}
                        aria-label={content.labels.selectAll}
                        onChange={(event) =>
                          reference.onAction(event.currentTarget.checked ? 'select-all' : 'unselect-all')
                        }
                      />
                    </th>
                    {[
                      { id: 'name', label: content.labels.name },
                      { id: 'size', label: content.labels.size },
                      { id: 'modified', label: content.labels.modified },
                    ].map(({ id, label }) => (
                      <th key={id} data-column={id} aria-sort={sortDirection(id)}>
                        <LumenButton
                          variant="text"
                          onClick={() =>
                            reference.onChange(
                              'sort',
                              `${id}:${reference.sortId === id ? !reference.descending : false}`,
                            )
                          }
                        >
                          {label}
                          {reference.sortId === id ? (
                            <Glyph name={reference.descending ? 'down' : 'sort'} tier="xs" />
                          ) : null}
                        </LumenButton>
                      </th>
                    ))}
                    <th data-column="owner">{content.labels.owner}</th>
                    <th>{content.labels.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      data-row-id={row.id}
                      className={
                        selectedIds.includes(row.id) || reference.focusedId === row.id ? 'is-selected' : undefined
                      }
                    >
                      <td>
                        <LumenCheckBoxControl
                          checked={selectedIds.includes(row.id)}
                          aria-label={content.labels.selectItem(row.name)}
                          onChange={() => reference.onAction('select', row.id)}
                        />
                      </td>
                      <td data-column="name">{nameCell(row)}</td>
                      <td data-column="size">
                        <span>{row.size}</span>
                        {row.detail ? <small>{row.detail}</small> : null}
                      </td>
                      <td data-column="modified">{row.modified}</td>
                      <td data-column="owner">
                        <span className={`${prefix}-owner`}>
                          <span>{row.owner.initials}</span>
                          <span>{row.owner.name}</span>
                        </span>
                      </td>
                      <td>
                        <LumenIconButton
                          label={content.labels.itemActions(row.name)}
                          aria-expanded={reference.menuId === row.id}
                          onClick={() => reference.onAction('menu', row.id)}
                        >
                          <Glyph name="more" />
                        </LumenIconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          {menuRow ? (
            <section className={`${prefix}-menu`} aria-label={content.labels.itemActions(menuRow.name)}>
              <strong>{menuRow.name}</strong>
              <div className={`${prefix}-actions`}>
                {reference.menuActions.map(({ id, label, disabled }) => (
                  <LumenButton
                    key={id}
                    variant="text"
                    disabled={disabled}
                    onClick={() => reference.onAction(id, menuRow.id)}
                  >
                    {label}
                  </LumenButton>
                ))}
                <LumenIconButton
                  label={reference.labels.clearSelection}
                  onClick={() => reference.onAction('menu-close')}
                >
                  <Glyph name="close" />
                </LumenIconButton>
              </div>
            </section>
          ) : null}
          <Notice reference={reference} />
        </main>
      </div>
      <Selection reference={reference} actions={[]} />
    </React.Fragment>
  )
}
function Assets({ reference }: { readonly reference: Extract<Content, { kind: 'assets' }> }) {
  const { content } = reference
  return (
    <React.Fragment>
      <header className={`${prefix}-header`}>
        <div className={`${prefix}-heading`}>
          <nav className={`${prefix}-breadcrumb`} aria-label={reference.labels.breadcrumb}>
            <ol>
              {reference.breadcrumbItems.map(({ id, label }, index) => (
                <li key={id}>
                  {index === reference.breadcrumbItems.length - 1 ? (
                    <span aria-current="page">{label}</span>
                  ) : (
                    <LumenButton variant="text" onClick={() => reference.onAction('breadcrumb', id)}>
                      {label}
                    </LumenButton>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.summary}</p>
        </div>
        <div className={`${prefix}-actions`}>
          <div className={`${prefix}-filters`} role="group" aria-label={reference.labels.filterGroup}>
            {[
              { id: 'all', label: content.labels.all },
              { id: 'images', label: content.labels.images },
              { id: 'video', label: content.labels.video },
              { id: 'documents', label: content.labels.documents },
            ].map(({ id, label }) => (
              <LumenButton
                key={id}
                variant="text"
                aria-pressed={reference.filterId === id}
                onClick={() => reference.onChange('filter', id)}
              >
                {label}
              </LumenButton>
            ))}
          </div>
          <LumenButton
            variant="outlined"
            aria-label={reference.labels.sortLabel(content.labels.sort, reference.descending)}
            onClick={() => reference.onChange('sort', `name:${!reference.descending}`)}
          >
            <Glyph name="sort" />
            {content.labels.sort}
          </LumenButton>
        </div>
      </header>
      <div
        className={`${prefix}-asset-body`}
        data-list-strategy={content.listStrategy.kind}
        data-expected-maximum={content.listStrategy.expectedMaximum}
      >
        {content.folders.length ? (
          <section>
            <h3>{content.labels.folders}</h3>
            <ul className={`${prefix}-folders`}>
              {content.folders.map((folder) => (
                <li key={folder.id}>
                  <LumenButton
                    variant="outlined"
                    className={`${prefix}-folder-card`}
                    onClick={() => reference.onAction('folder', folder.id)}
                  >
                    <Glyph name="folder" tier="lg" />
                    <span>
                      <strong>{folder.name}</strong>
                      <small>{folder.detail}</small>
                    </span>
                  </LumenButton>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h3>{content.labels.files}</h3>
          {!reference.available || !content.assets.length ? (
            <Empty reference={reference} />
          ) : (
            <ul className={`${prefix}-cards`}>
              {content.assets.map((asset) => (
                <li key={asset.id} className={`${prefix}-card`} data-row-id={asset.id}>
                  <LumenButton
                    variant="text"
                    aria-label={content.labels.selectAsset(asset.name)}
                    aria-pressed={reference.selectedIds.includes(asset.id)}
                    className={reference.selectedIds.includes(asset.id) ? 'is-selected' : undefined}
                    onClick={() => reference.onAction('select', asset.id)}
                  >
                    <span className={`${prefix}-preview`}>
                      <Glyph name={asset.kind} tier="xl" />
                    </span>
                    <span className={`${prefix}-card-copy`}>
                      <strong>{asset.name}</strong>
                      <small>{content.labels.assetSummary(asset.format, asset.size)}</small>
                    </span>
                  </LumenButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Selection
        reference={reference}
        actions={[
          { id: 'share', label: content.labels.share },
          { id: 'delete', label: content.labels.delete },
          { id: 'more', label: content.labels.more },
        ]}
      />
      <Notice reference={reference} />
    </React.Fragment>
  )
}
function Detail({ reference }: { readonly reference: Extract<Content, { kind: 'detail' }> }) {
  const { content } = reference
  const active = content.items.find(({ id }) => id === content.activeItemId)
  return (
    <div className={`${prefix}-detail-layout`}>
      <section className={`${prefix}-detail-list-region`}>
        <header className={`${prefix}-header`}>
          <div className={`${prefix}-heading`}>
            <h2>{content.labels.title}</h2>
            <p>{content.labels.summary}</p>
          </div>
        </header>
        <ul
          className={`${prefix}-detail-list`}
          data-list-strategy={content.listStrategy.kind}
          data-expected-maximum={content.listStrategy.expectedMaximum}
        >
          {content.items.map((item) => (
            <li key={item.id} data-row-id={item.id}>
              <LumenButton
                variant="text"
                className={`${prefix}-detail-row`}
                aria-label={content.labels.openItem(item.name)}
                aria-current={active?.id === item.id ? 'page' : undefined}
                onClick={() => reference.onAction('focus', item.id)}
              >
                <Glyph name={item.kind} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{content.labels.itemSummary(item.format, item.size)}</small>
                </span>
              </LumenButton>
            </li>
          ))}
        </ul>
        {!content.items.length ? <Empty reference={reference} /> : null}
      </section>
      {active ? (
        <aside className={`${prefix}-detail-panel`}>
          <section className={`${prefix}-detail-summary`}>
            <div className={`${prefix}-preview`} aria-label={active.previewLabel}>
              <Glyph name={active.kind} tier="xl" />
            </div>
            <h3>{active.name}</h3>
            <p>
              {reference.detailAvailable
                ? content.labels.previewSummary(active.version, active.size)
                : content.labels.itemSummary(active.format, active.size)}
            </p>
            <div className={`${prefix}-actions`}>
              <LumenButton tone="primary" onClick={() => reference.onAction('download', active.id)}>
                <Glyph name="download" />
                {content.labels.download}
              </LumenButton>
              <LumenIconButton
                label={content.labels.shareItem(active.name)}
                onClick={() => reference.onAction('share', active.id)}
              >
                <Glyph name="share" />
              </LumenIconButton>
            </div>
          </section>
          {reference.detailAvailable ? (
            <React.Fragment>
              <section className={`${prefix}-metadata`}>
                <h4>{content.labels.details}</h4>
                <dl>
                  {active.metadata.map((row) => (
                    <div key={row.id}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className={`${prefix}-collaborators`}>
                <h4>{content.labels.sharedWith}</h4>
                <ul>
                  {active.collaborators.map((person) => (
                    <li key={`${person.initials}:${person.name}`}>
                      <span className={`${prefix}-avatar`}>{person.initials}</span>
                      <span>{person.name}</span>
                      <small>{person.permission}</small>
                    </li>
                  ))}
                </ul>
                <div className={`${prefix}-access`}>
                  <LumenButton variant="text" onClick={() => reference.onAction('access', active.id)}>
                    {active.accessNotice}
                  </LumenButton>
                  <LumenIconButton
                    label={content.labels.copyLink}
                    onClick={() => reference.onAction('copy-link', active.id)}
                  >
                    <Glyph name="link" />
                  </LumenIconButton>
                </div>
              </section>
              <section className={`${prefix}-activity`}>
                <h4>{content.labels.activity}</h4>
                <ul>
                  {active.activity.map((entry) => (
                    <li key={entry.id}>
                      <p>{entry.text}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </React.Fragment>
          ) : (
            <p className={`${prefix}-empty`}>{reference.labels.unavailable}</p>
          )}
          {reference.detailAvailable ? (
            <LumenButton variant="outlined" onClick={() => reference.onAction('make-copy', active.id)}>
              <Glyph name="copy" />
              {content.labels.makeCopy}
            </LumenButton>
          ) : null}
          <Notice reference={reference} />
        </aside>
      ) : null}
    </div>
  )
}
function Upload({ reference }: { readonly reference: Extract<Content, { kind: 'upload' }> }) {
  const { content } = reference
  const picker = React.useRef<HTMLInputElement>(null)
  const receive = (files: FileList | null) => {
    if (files) {
      reference.onFiles(Array.from(files).map(({ name, size, type }) => ({ name, size, type })))
    }
  }
  if (!reference.open) {
    return (
      <div className={`${prefix}-empty`}>
        <LumenButton variant="outlined" onClick={() => reference.onAction('reopen')}>
          {reference.labels.reopen}
        </LumenButton>
        <Notice reference={reference} />
      </div>
    )
  }
  const stateLabel = (state: (typeof reference.items)[number]['state']) => {
    switch (state) {
      case 'paused':
        return reference.labels.paused
      case 'cancelled':
        return reference.labels.cancelled
      case 'uploading':
        return content.labels.uploading
      case 'uploaded':
        return content.labels.uploaded
      case 'failed':
        return content.labels.failed
      case 'queued':
        return content.labels.queued
    }
  }
  const statusLabel = (item: (typeof reference.items)[number]) => {
    if (item.state === 'uploading') {
      return content.labels.progress(item.progress, item.remaining)
    }
    if (item.state === 'failed') {
      return item.statusDetail ?? stateLabel(item.state)
    }
    return stateLabel(item.state)
  }
  const stateAction = (item: (typeof reference.items)[number]) => {
    if (item.state === 'uploading') {
      return (
        <LumenIconButton label={content.labels.pause(item.name)} onClick={() => reference.onAction('pause', item.id)}>
          <Glyph name="pause" />
        </LumenIconButton>
      )
    }
    if (item.state === 'paused' || item.state === 'queued') {
      return (
        <LumenIconButton label={content.labels.start(item.name)} onClick={() => reference.onAction('start', item.id)}>
          <Glyph name="play" />
        </LumenIconButton>
      )
    }
    if (item.state === 'failed' || item.state === 'cancelled') {
      return (
        <LumenIconButton label={content.labels.retry(item.name)} onClick={() => reference.onAction('retry', item.id)}>
          <Glyph name="retry" />
        </LumenIconButton>
      )
    }
    return null
  }
  return (
    <section className={`${prefix}-upload-panel`}>
      <header className={`${prefix}-header`}>
        <div className={`${prefix}-heading`}>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.summary}</p>
        </div>
        <LumenIconButton label={content.labels.dismiss} onClick={() => reference.onAction('dismiss')}>
          <Glyph name="close" />
        </LumenIconButton>
      </header>
      <section
        className={`${prefix}-drop-region`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          receive(event.dataTransfer.files)
        }}
      >
        <LumenButton variant="outlined" className={`${prefix}-drop-zone`} onClick={() => picker.current?.click()}>
          <Glyph name="upload" tier="xl" />
          <strong>{content.labels.dropTitle}</strong>
          <small>{content.labels.dropDescription}</small>
        </LumenButton>
        <input
          ref={picker}
          className={`${prefix}-file-picker`}
          type="file"
          hidden
          multiple
          aria-label={content.labels.dropTitle}
          onChange={(event) => {
            receive(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
        />
      </section>
      <section className={`${prefix}-queue-region`}>
        <h3>{content.labels.queue}</h3>
        <ul
          className={`${prefix}-upload-queue`}
          data-list-strategy={content.listStrategy.kind}
          data-expected-maximum={content.listStrategy.expectedMaximum}
        >
          {reference.items.map((item) => (
            <li
              className={`${prefix}-upload-row is-${item.state}`}
              key={item.id}
              data-row-id={item.id}
              data-upload-state={item.state}
            >
              <Glyph name={item.kind} />
              <div className={`${prefix}-upload-copy`}>
                <div className={`${prefix}-value-row`}>
                  <strong>{item.name}</strong>
                  <small>{item.size}</small>
                </div>
                {item.state === 'uploading' ||
                item.state === 'paused' ||
                item.state === 'queued' ||
                item.state === 'failed' ? (
                  <Meter value={item.progress} label={reference.labels.progressLabel(item.name)} />
                ) : null}
                <small>{statusLabel(item)}</small>
              </div>
              <div className={`${prefix}-actions`}>
                {stateAction(item)}
                {item.state === 'uploaded' ? (
                  <LumenIconButton
                    label={content.labels.remove(item.name)}
                    onClick={() => reference.onAction('remove', item.id)}
                  >
                    <Glyph name="close" />
                  </LumenIconButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {!reference.items.length ? <Empty reference={reference} /> : null}
      </section>
      <Notice reference={reference} />
      <footer className={`${prefix}-upload-footer`}>
        <small>{content.labels.transferSummary}</small>
        <div className={`${prefix}-actions`}>
          <LumenButton
            variant="outlined"
            disabled={!reference.items.some(({ state }) => ['uploading', 'queued', 'paused'].includes(state))}
            onClick={() => reference.onAction('cancel-all')}
          >
            {content.labels.cancelAll}
          </LumenButton>
          <LumenButton
            tone="primary"
            disabled={!reference.items.some(({ state }) => state === 'uploaded')}
            onClick={() => reference.onAction('clear-completed')}
          >
            {content.labels.clearCompleted}
          </LumenButton>
        </div>
      </footer>
    </section>
  )
}
export default function LumenFileManagerReference({ content }: { readonly content: Content }) {
  const renderContent = () => {
    switch (content.kind) {
      case 'drive':
        return <Drive reference={content} />
      case 'assets':
        return <Assets reference={content} />
      case 'detail':
        return <Detail reference={content} />
      case 'upload':
        return <Upload reference={content} />
      default:
        return null
    }
  }
  return (
    <div
      className={`${prefix}${content.kind === 'drive' && content.view === 'grid' ? ' is-grid' : ''}`}
      data-reference-kind={content.kind}
    >
      {renderContent()}
    </div>
  )
}
