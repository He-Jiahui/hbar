'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput, LumenSelect, LumenToggleControl } from './forms'
import { LumenRange } from './range'
import { LumenButton, LumenIconButton } from './primitives'
import type {
  LumenFilteringReferenceContent as Content,
  LumenFilteringReferenceField as Field,
  LumenFilteringReferenceRecord as Row,
} from './filtering-reference-contracts'

function unique<T extends { readonly id: string }>(rows: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return rows.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}
function Glyph({
  name,
}: {
  readonly name: 'filter' | 'close' | 'plus' | 'minus' | 'file' | 'star' | 'left' | 'right'
}) {
  const paths = {
    filter: 'M2 3h12L9.5 8v4l-3 1V8Z',
    close: 'm4 4 8 8m0-8-8 8',
    plus: 'M8 3v10M3 8h10',
    minus: 'M3 8h10',
    file: 'M4 1.5h5l3 3v10H4zm5 0v3h3',
    star: 'm8 2 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z',
    left: 'm10 3-5 5 5 5',
    right: 'm6 3 5 5-5 5',
  }
  return (
    <svg className="lumen-filtering-reference-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
function OptionControl({
  field,
  content,
}: {
  readonly field: Extract<Field, { kind: 'single' | 'multi' }>
  readonly content: Content
}) {
  const controlId = React.useId()
  const rail = React.useRef<HTMLDivElement>(null)
  const [search, setSearch] = React.useState('')
  const options = unique(field.options).filter(({ label }) =>
    label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  )
  function selected(id: string) {
    return field.kind === 'single' ? field.value === id : field.value.includes(id)
  }
  function choose(id: string) {
    if (field.kind === 'single') {
      content.onChange(field.id, id)
    } else {
      content.onChange(field.id, selected(id) ? field.value.filter((value) => value !== id) : [...field.value, id])
    }
  }
  if (field.kind === 'single' && field.display === 'select') {
    return (
      <LumenSelect
        aria-label={field.label}
        disabled={field.disabled}
        value={field.value}
        onChange={(event) => choose(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </LumenSelect>
    )
  }
  const choices = (
    <div
      ref={rail}
      className={`lumen-filtering-reference-choices is-${field.display}`}
      role={field.display === 'radio' ? 'radiogroup' : 'group'}
      aria-label={field.label}
    >
      {options.map((option) => {
        const label = option.detail ? `${option.label} ${option.detail}` : option.label
        if (field.display === 'checks' || field.display === 'radio' || field.display === 'menu') {
          return (
            <label className="lumen-filtering-reference-choice" key={option.id} htmlFor={`${controlId}-${option.id}`}>
              {field.display === 'radio' ? (
                <input
                  id={`${controlId}-${option.id}`}
                  type="radio"
                  name={controlId}
                  checked={selected(option.id)}
                  disabled={field.disabled || option.disabled}
                  onChange={() => choose(option.id)}
                />
              ) : (
                <LumenCheckBoxControl
                  id={`${controlId}-${option.id}`}
                  checked={selected(option.id)}
                  disabled={field.disabled || option.disabled}
                  onChange={() => choose(option.id)}
                />
              )}
              <span>{option.label}</span>
              {option.detail ? <small>{option.detail}</small> : null}
            </label>
          )
        }
        return (
          <LumenButton
            key={option.id}
            variant="text"
            className="lumen-filtering-reference-choice"
            aria-label={label}
            aria-pressed={selected(option.id)}
            disabled={field.disabled || option.disabled}
            tone={selected(option.id) ? 'primary' : 'neutral'}
            indicatorState={selected(option.id) ? 'selected' : undefined}
            onClick={() => choose(option.id)}
          >
            {field.display === 'swatches' ? (
              <span className="lumen-filtering-reference-swatch" style={{ backgroundColor: option.color }} />
            ) : (
              <React.Fragment>
                <span>{option.label}</span>
                {option.detail ? <small>{option.detail}</small> : null}
              </React.Fragment>
            )}
          </LumenButton>
        )
      })}
    </div>
  )
  if (field.kind === 'single' && field.display === 'rail' && field.scrollLabels) {
    return (
      <div className="lumen-filtering-reference-cuisine-rail">
        <LumenIconButton
          variant="text"
          label={field.scrollLabels[0]}
          onClick={() => rail.current?.scrollBy({ left: -240, behavior: 'smooth' })}
        >
          <Glyph name="left" />
        </LumenIconButton>
        {choices}
        <LumenIconButton
          variant="text"
          label={field.scrollLabels[1]}
          onClick={() => rail.current?.scrollBy({ left: 240, behavior: 'smooth' })}
        >
          <Glyph name="right" />
        </LumenIconButton>
      </div>
    )
  }
  if (field.kind === 'multi' && field.display === 'menu') {
    return (
      <details className="lumen-filtering-reference-menu">
        <summary>
          {field.label}
          <Glyph name="right" />
        </summary>
        <div className="lumen-filtering-reference-menu-body">
          {field.search ? (
            <LumenInput
              aria-label={field.search.label}
              placeholder={field.search.placeholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          ) : null}
          {field.unavailable ? <p role="status">{field.unavailable}</p> : choices}
        </div>
      </details>
    )
  }
  return choices
}
function FieldControl({ field, content }: { readonly field: Field; readonly content: Content }) {
  switch (field.kind) {
    case 'single':
    case 'multi':
      return <OptionControl field={field} content={content} />
    case 'text':
      return (
        <LumenInput
          aria-label={field.label}
          placeholder={field.placeholder}
          value={field.value}
          disabled={field.disabled}
          onChange={(event) => content.onChange(field.id, event.target.value)}
        />
      )
    case 'boolean':
      return (
        <label className="lumen-filtering-reference-choice">
          <span>
            {field.label}
            {field.detail ? <small>{field.detail}</small> : null}
          </span>
          <LumenToggleControl
            aria-label={field.label}
            checked={field.value}
            disabled={field.disabled}
            onChange={(event) => content.onChange(field.id, event.target.checked)}
          />
        </label>
      )
    case 'range':
      return (
        <div className="lumen-filtering-reference-range">
          <output>{field.valueLabel(...field.value)}</output>
          <div className="lumen-filtering-reference-range-inputs">
            <LumenRange
              aria-label={field.endpointLabels[0]}
              min={field.minimum}
              max={field.value[1]}
              step={field.step}
              value={field.value[0]}
              disabled={field.disabled}
              onChange={(event) => content.onChange(field.minimumId, Number(event.target.value))}
            />
            <LumenRange
              aria-label={field.endpointLabels[1]}
              min={field.value[0]}
              max={field.maximum}
              step={field.step}
              value={field.value[1]}
              disabled={field.disabled}
              onChange={(event) => content.onChange(field.maximumId, Number(event.target.value))}
            />
          </div>
        </div>
      )
    case 'stepper':
      return (
        <div className="lumen-filtering-reference-stepper">
          <span>{field.label}</span>
          <LumenIconButton
            variant="outlined"
            label={field.stepLabels[0]}
            disabled={field.disabled || field.value <= field.minimum}
            onClick={() => content.onChange(field.id, field.value - 1)}
          >
            <Glyph name="minus" />
          </LumenIconButton>
          <output>{field.valueLabel(field.value)}</output>
          <LumenIconButton
            variant="outlined"
            label={field.stepLabels[1]}
            disabled={field.disabled || field.value >= field.maximum}
            onClick={() => content.onChange(field.id, field.value + 1)}
          >
            <Glyph name="plus" />
          </LumenIconButton>
        </div>
      )
    case 'tokens':
      return (
        <div className="lumen-filtering-reference-tokens">
          {field.value.map((value) => (
            <span className="lumen-filtering-reference-token" key={value}>
              {value}
              <LumenIconButton
                variant="text"
                label={field.removeLabel(value)}
                onClick={() =>
                  content.onChange(
                    field.id,
                    field.value.filter((item) => item !== value),
                  )
                }
              >
                <Glyph name="close" />
              </LumenIconButton>
            </span>
          ))}
          <LumenInput
            aria-label={field.label}
            placeholder={field.placeholder}
            value={field.draft}
            disabled={field.disabled}
            onChange={(event) => content.onChange(field.draftId, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                const value = field.draft.trim()
                if (
                  value &&
                  field.value.length < field.maximum &&
                  !field.value.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())
                ) {
                  content.onChange(field.id, [...field.value, value])
                  content.onChange(field.draftId, '')
                }
              }
            }}
          />
          <small>{field.value.length >= field.maximum ? field.limitLabel : field.detail}</small>
        </div>
      )
    default:
      return null
  }
}
function Fields({ fields, content }: { readonly fields: readonly Field[]; readonly content: Content }) {
  return fields.map((field) => (
    <section className="lumen-filtering-reference-facet" key={field.id} data-field-id={field.id}>
      {field.placement === 'facet' && field.kind !== 'stepper' && field.kind !== 'boolean' ? (
        <h3>{field.label}</h3>
      ) : null}
      <FieldControl field={field} content={content} />
    </section>
  ))
}
function Identity({ row }: { readonly row: Row }) {
  return (
    <div className="lumen-filtering-reference-identity">
      <strong>{row.title}</strong>
      <small>{row.detail}</small>
      {row.tags ? (
        <div className="lumen-filtering-reference-tokens">
          {row.tags.map((tag) => (
            <span key={tag} className="lumen-filtering-reference-token">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
function Values({ row }: { readonly row: Row }) {
  return (
    <div className="lumen-filtering-reference-values">
      <strong>{row.value}</strong>
      {row.secondary ? <small>{row.secondary}</small> : null}
    </div>
  )
}
function Results({ content }: { readonly content: Content }) {
  if (!content.available) {
    return (
      <p className="lumen-filtering-reference-empty" role="status">
        {content.labels.unavailable}
      </p>
    )
  }
  if (!content.rows.length && content.kind !== 'bikes') {
    return (
      <p className="lumen-filtering-reference-empty" role="status">
        {content.labels.empty}
      </p>
    )
  }
  switch (content.kind) {
    case 'catalog':
      return (
        <ul className="lumen-filtering-reference-collection is-cards">
          {unique(content.rows).map((row) => (
            <li key={row.id} data-row-id={row.id}>
              <article className="lumen-filtering-reference-card">
                <div
                  className="lumen-filtering-reference-visual"
                  style={{ backgroundColor: row.color }}
                  aria-hidden="true"
                />
                <Identity row={row} />
                <Values row={row} />
              </article>
            </li>
          ))}
        </ul>
      )
    case 'assets':
      return (
        <ul className="lumen-filtering-reference-collection is-cards">
          {unique(content.rows).map((row) => (
            <li key={row.id} data-row-id={row.id}>
              <article className="lumen-filtering-reference-card">
                <div className="lumen-filtering-reference-visual">
                  <small>{row.format}</small>
                  <Glyph name="file" />
                </div>
                <Identity row={row} />
                <Values row={row} />
              </article>
            </li>
          ))}
        </ul>
      )
    case 'restaurants':
      return (
        <ul className="lumen-filtering-reference-collection is-cards">
          {unique(content.rows).map((row) => (
            <li key={row.id} data-row-id={row.id}>
              <article className="lumen-filtering-reference-card">
                <div className="lumen-filtering-reference-visual">
                  <small>
                    <Glyph name="star" />
                    {row.rating}
                  </small>
                  <span>{row.abbreviation}</span>
                  <small>{row.value}</small>
                </div>
                <Identity row={row} />
              </article>
            </li>
          ))}
        </ul>
      )
    case 'deals':
      return (
        <div className="lumen-filtering-reference-table-scroll">
          <table className="lumen-filtering-reference-table">
            <caption>{content.tableLabel}</caption>
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
                <tr key={row.id} data-row-id={row.id}>
                  <th scope="row">
                    <Identity row={row} />
                  </th>
                  <td>{row.stage}</td>
                  <td>{row.owner}</td>
                  <td>{row.value}</td>
                  <td>{row.secondary}</td>
                  <td>{row.close}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'logs':
      return (
        <React.Fragment>
          <section className="lumen-filtering-reference-volume" aria-label={content.volumeLabels[0]}>
            <header>
              <span>{content.volumeLabels[0]}</span>
              <small>{content.volumeLabels[1]}</small>
            </header>
            <div className="lumen-filtering-reference-volume-bars" aria-hidden="true">
              {content.volume.map((value, index) => (
                <svg key={index} viewBox="0 0 10 60" preserveAspectRatio="none">
                  <rect x={1} y={60 - value * 8} width={8} height={value * 8} />
                </svg>
              ))}
            </div>
            <footer>
              <small>{content.volumeLabels[2]}</small>
              <small>{content.volumeLabels[3]}</small>
            </footer>
          </section>
          <ul className="lumen-filtering-reference-collection is-rows">
            {unique(content.rows).map((row) => (
              <li key={row.id} data-row-id={row.id} className="lumen-filtering-reference-log-row">
                <time>{row.time}</time>
                <strong data-severity={row.severity}>{row.severity}</strong>
                <small className="lumen-filtering-reference-log-service">{row.service}</small>
                <span>{row.title}</span>
              </li>
            ))}
          </ul>
        </React.Fragment>
      )
    case 'rentals':
    case 'candidates':
      return (
        <ul className="lumen-filtering-reference-collection is-rows">
          {unique<Row>(content.rows).map((row) => (
            <li key={row.id} data-row-id={row.id}>
              <article className="lumen-filtering-reference-row">
                {row.abbreviation ? <span className="lumen-filtering-reference-avatar">{row.abbreviation}</span> : null}
                <Identity row={row} />
                {row.meta ? <small className="lumen-filtering-reference-meta">{row.meta}</small> : null}
                <Values row={row} />
              </article>
            </li>
          ))}
        </ul>
      )
    case 'flights':
      return (
        <ul className="lumen-filtering-reference-collection is-rows">
          {unique(content.rows).map((row) => (
            <li key={row.id} data-row-id={row.id}>
              <article className="lumen-filtering-reference-row">
                <span className="lumen-filtering-reference-avatar">{row.abbreviation}</span>
                <Identity row={row} />
                <small className="lumen-filtering-reference-meta">{row.meta}</small>
                <Values row={row} />
                <LumenButton
                  variant="outlined"
                  aria-pressed={content.selectedId === row.id}
                  onClick={() => content.onRequest('select-flight', row.id)}
                >
                  {content.selectedId === row.id ? content.selectedLabel : content.selectLabel}
                </LumenButton>
              </article>
            </li>
          ))}
        </ul>
      )
    case 'bikes':
      return null
    default:
      return null
  }
}
function DealRules({ content }: { readonly content: Extract<Content, { kind: 'deals' }> }) {
  const [builder, setBuilder] = React.useState(false)
  const activeRule = content.rules.find(({ id }) => id === content.activeRuleId)
  return (
    <React.Fragment>
      <div className="lumen-filtering-reference-toolbar">
        <Fields fields={content.fields.filter(({ placement }) => placement === 'toolbar')} content={content} />
        <LumenButton variant="outlined" aria-expanded={builder} onClick={() => setBuilder(!builder)}>
          <Glyph name="plus" />
          {content.addLabel}
        </LumenButton>
      </div>
      {builder ? (
        <div className="lumen-filtering-reference-menu-body" role="menu" aria-label={content.builderLabel}>
          {content.ruleOptions.map(({ id, label }) => (
            <LumenButton
              key={id}
              variant="text"
              role="menuitem"
              onClick={() => {
                content.onChange('active-rule', id)
                setBuilder(false)
              }}
            >
              {label}
            </LumenButton>
          ))}
        </div>
      ) : null}
      <div className="lumen-filtering-reference-tokens">
        {content.rules.map((rule) => (
          <span className="lumen-filtering-reference-token" key={rule.id}>
            <LumenButton
              variant="text"
              aria-expanded={content.activeRuleId === rule.id}
              onClick={() => content.onChange('active-rule', content.activeRuleId === rule.id ? 'none' : rule.id)}
            >
              {rule.label}
            </LumenButton>
            <LumenIconButton
              variant="text"
              label={rule.removeLabel}
              onClick={() =>
                content.onChange(
                  'rules',
                  content.rules.filter(({ id }) => id !== rule.id).map(({ id }) => id),
                )
              }
            >
              <Glyph name="close" />
            </LumenIconButton>
          </span>
        ))}
        {content.rules.length ? (
          <LumenButton variant="text" onClick={() => content.onChange('rules', [])}>
            {content.clearLabel}
          </LumenButton>
        ) : null}
      </div>
      {activeRule ? (
        <div className="lumen-filtering-reference-menu-body">
          <FieldControl field={activeRule.field} content={content} />
        </div>
      ) : null}
    </React.Fragment>
  )
}
export default function LumenFilteringReference({
  content,
  notice,
}: {
  readonly content: Content
  readonly notice?: string | undefined
}) {
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const facets = content.fields.filter(({ placement }) => placement === 'facet')
  const heading = (
    <div className="lumen-filtering-reference-heading">
      <h2>{content.title}</h2>
      <p>{content.subtitle}</p>
    </div>
  )
  if (content.kind === 'bikes') {
    return (
      <div className="lumen-filtering-reference is-bikes" data-reference-kind={content.kind}>
        {content.open ? (
          <section className="lumen-filtering-reference-filter-panel">
            <header className="lumen-filtering-reference-header">
              {heading}
              <LumenButton variant="text" disabled={!content.dirty} onClick={content.onReset}>
                {content.clearLabel}
              </LumenButton>
              <LumenIconButton
                variant="text"
                label={content.labels.close}
                onClick={() => content.onChange('filters-open', false)}
              >
                <Glyph name="close" />
              </LumenIconButton>
            </header>
            <div className="lumen-filtering-reference-facets">
              <Fields fields={facets} content={content} />
            </div>
            <footer className="lumen-filtering-reference-filter-footer">
              <LumenButton variant="text" disabled={!content.dirty} onClick={content.onReset}>
                {content.labels.reset}
              </LumenButton>
              <LumenButton variant="contained" disabled={!content.available} onClick={() => content.onRequest('apply')}>
                {content.applyLabel}
              </LumenButton>
            </footer>
          </section>
        ) : (
          <React.Fragment>
            {heading}
            {content.appliedLabel ? <p role="status">{content.appliedLabel}</p> : null}
            <LumenButton variant="outlined" onClick={() => content.onChange('filters-open', true)}>
              <Glyph name="filter" />
              {content.labels.filters}
            </LumenButton>
          </React.Fragment>
        )}
        {notice ? (
          <p className="lumen-filtering-reference-notice" role="status">
            {notice}
          </p>
        ) : null}
      </div>
    )
  }
  return (
    <div
      className={`lumen-filtering-reference is-${content.kind}${content.kind === 'assets' && content.density === 'compact' ? ' is-compact' : ''} is-${content.listStrategy.kind}`}
      data-reference-kind={content.kind}
      data-list-strategy={content.listStrategy.kind}
      data-expected-maximum={content.listStrategy.expectedMaximum}
    >
      <header className="lumen-filtering-reference-header">
        {heading}
        <div className="lumen-filtering-reference-controls">
          {facets.length ? (
            <LumenButton
              variant="outlined"
              className="lumen-filtering-reference-filter-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Glyph name="filter" />
              {content.labels.filters}
            </LumenButton>
          ) : null}
          <Fields fields={content.fields.filter(({ placement }) => placement === 'header')} content={content} />
        </div>
      </header>
      {content.kind === 'deals' ? (
        <DealRules content={content} />
      ) : (
        <div className="lumen-filtering-reference-toolbar">
          <Fields fields={content.fields.filter(({ placement }) => placement === 'toolbar')} content={content} />
        </div>
      )}
      <div className={`lumen-filtering-reference-layout${filtersOpen ? ' is-filters-open' : ''}`}>
        {facets.length ? (
          <aside className="lumen-filtering-reference-facets">
            <Fields fields={facets} content={content} />
            <LumenButton variant="text" onClick={content.onReset}>
              {content.labels.reset}
            </LumenButton>
          </aside>
        ) : null}
        <div className="lumen-filtering-reference-results">
          <Results content={content} />
        </div>
      </div>
      {content.kind === 'logs' ? <footer className="lumen-filtering-reference-footer">{content.footer}</footer> : null}
      {notice ? (
        <p className="lumen-filtering-reference-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
