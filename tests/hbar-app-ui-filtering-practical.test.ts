import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenFiltering, type LumenFilteringReferenceContent as Content } from '@lumen/app-ui/catalog'
import { createFilteringPreviewStore } from '../apps/hbar-app-ui-preview/src/filteringPreviewModel'
import {
  createFilteringPreviewSeed,
  projectFilteringPreview,
} from '../apps/hbar-app-ui-preview/src/filteringPreviewProjection'
import { createFilteringPreviewReferenceContent } from '../apps/hbar-app-ui-preview/src/filteringPreviewReferenceFixtures'

function setup(variant: number, mode = 'default') {
  const content = createFilteringPreviewReferenceContent(variant, mode)
  const store = createFilteringPreviewStore(
    createFilteringPreviewSeed(content, variant, `filtering-${variant}-${mode}`, mode),
  )
  const reports: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const project = () => {
    const projected = projectFilteringPreview(content, store, (event) => reports.push(event))
    if (!projected.reference) throw new Error('Expected reference content')
    return projected.reference
  }
  const render = () =>
    renderToStaticMarkup(
      createElement(LumenFiltering, { variant, variantId: `filtering-${variant}`, content: { reference: project() } }),
    )
  return { content, store, project, render, reports }
}
function ofKind<K extends Content['kind']>(content: Content, kind: K): Extract<Content, { kind: K }> {
  if (content.kind !== kind) throw new Error(`Expected ${kind}`)
  return content as Extract<Content, { kind: K }>
}

test('nine filtering references preserve distinct results and control structures', () => {
  const owners = Array.from({ length: 9 }, (_, index) => setup(index + 1))
  expect(owners.map(({ project }) => project().kind)).toEqual([
    'catalog',
    'bikes',
    'deals',
    'logs',
    'rentals',
    'candidates',
    'assets',
    'flights',
    'restaurants',
  ])
  expect(owners.map(({ project }) => project().rows.length)).toEqual([18, 0, 14, 42, 22, 16, 20, 15, 18])
  owners.forEach((owner, index) => {
    const html = owner.render()
    expect(html).toContain(`data-reference-kind="${owner.project().kind}"`)
    expect(html).toContain(`data-lumen-variant="${index + 1}"`)
    expect(html).toContain(owner.project().title.replaceAll('&', '&amp;'))
  })
})
test('catalog category, maker and price intersections recover from empty and unknown selections', () => {
  const owner = setup(1)
  owner.project().onChange('category', ['Dinnerware'])
  expect(owner.project().rows).toHaveLength(5)
  owner.project().onChange('maker', ['Kilnhouse'])
  expect(owner.project().rows.map(({ id }) => id)).toEqual(['ridge-dinner', 'ridge-side'])
  owner.project().onChange('price-minimum', 30)
  expect(owner.project().rows.map(({ id }) => id)).toEqual(['ridge-dinner'])
  owner.project().onChange('price-maximum', 20)
  expect(owner.store.getState().valuesById['price-maximum']).toBe(100)
  owner.project().onChange('price-minimum', 90)
  expect(owner.project().rows).toHaveLength(0)
  expect(owner.render()).toContain('No results match')
  owner.project().onReset()
  expect(owner.project().rows).toHaveLength(18)
  owner.project().onChange('size', ['Small'])
  expect(owner.project().available).toBe(false)
  owner.project().onReset()
  expect(owner.project().available).toBe(true)
})
test('bike draft facets have captured zero-match recovery and apply only local filter intent', () => {
  const owner = setup(2)
  const second = setup(2, 'localized')
  owner.project().onChange('frame', ['48'])
  const empty = ofKind(owner.project(), 'bikes')
  expect(empty.applyLabel).toBe('No bikes match')
  expect(empty.available).toBe(false)
  empty.onRequest('apply')
  expect(owner.store.getState().lastRequest).toBeUndefined()
  empty.onReset()
  owner.project().onChange('frame', ['51'])
  expect(ofKind(owner.project(), 'bikes').applyLabel).toBe('Show 5 results')
  owner.project().onRequest('apply')
  expect(owner.store.getState().appliedById.frame).toEqual(['51'])
  expect(ofKind(owner.project(), 'bikes').open).toBe(false)
  expect(owner.reports).toEqual([{ actionId: 'apply' }])
  expect(second.store.getState().valuesById.frame).toEqual([])
  owner.project().onChange('filters-open', true)
  expect(ofKind(owner.project(), 'bikes').open).toBe(true)
})
test('deal conditions restore all eighteen captured records, add owner rules, and reject stale fields', () => {
  const owner = setup(3)
  expect(owner.project().subtitle).toContain('$624,500')
  owner.project().onChange('rules', [])
  expect(owner.project().rows).toHaveLength(18)
  expect(owner.project().subtitle).toContain('$688,500')
  owner.project().onChange('active-rule', 'owner')
  owner.project().onChange('owner-filter', 'Raj Patel')
  expect(ofKind(owner.project(), 'deals').rows.every(({ owner }) => owner === 'Raj Patel')).toBe(true)
  owner.project().onChange('query', 'Meridian')
  expect(owner.project().rows.map(({ id }) => id)).toEqual(['meridian'])
  owner.project().onChange('active-rule', 'invented-rule')
  expect(owner.store.getState().valuesById['active-rule']).toBe('owner')
  owner.project().onReset()
  expect(owner.project().rows).toHaveLength(14)
})
test('log severity, service and query intersect with supplied timestamps and preserve unavailable later periods', () => {
  const owner = setup(4)
  owner.project().onChange('severity', ['error'])
  expect(owner.project().rows).toHaveLength(5)
  owner.project().onChange('service', ['payments'])
  expect(owner.project().rows).toHaveLength(1)
  owner.project().onChange('query', 'impossible query')
  expect(owner.project().rows).toHaveLength(0)
  owner.project().onReset()
  owner.project().onChange('time', '15')
  expect(ofKind(owner.project(), 'logs').rows.every(({ minute }) => minute >= 14 * 60 + 17)).toBe(true)
  owner.project().onChange('time', '1440')
  expect(owner.project().available).toBe(false)
})
test('rental counters and candidate every-skill matching use real record values', () => {
  const rentals = setup(5)
  rentals.project().onChange('property', 'House')
  rentals.project().onChange('beds', 4)
  expect(rentals.project().rows.map(({ id }) => id)).toEqual(['rental-21'])
  rentals.project().onChange('amenities', ['Parking'])
  expect(rentals.project().available).toBe(false)
  const candidates = setup(6)
  candidates.project().onChange('skills', ['typescript', 'React'])
  candidates.project().onChange('remote', true)
  expect(candidates.project().rows.map(({ title }) => title)).toEqual([
    'Isabel Moreno',
    'Yuki Tanaka',
    'Ana Ferreira',
    'Diego Santos',
  ])
  candidates.project().onChange('sort', 'salary-asc')
  expect(candidates.project().rows[0]?.title).toBe('Diego Santos')
  candidates.project().onChange('skill-draft', 'Kubernetes')
  candidates.project().onReset()
  expect(candidates.store.getState().valuesById['skill-draft']).toBe('')
  expect(candidates.project().rows).toHaveLength(16)
})
test('asset orientations and sizes, flight carry-on, and restaurant rating/cost have observable result changes', () => {
  const assets = setup(7)
  assets.project().onChange('type', ['Photography'])
  expect(assets.project().rows).toHaveLength(6)
  assets.project().onChange('orientation', ['Portrait'])
  expect(assets.project().rows.map(({ title }) => title)).toEqual(['Campaign key visual', 'Founder portrait'])
  assets.project().onChange('sort', 'size-asc')
  expect(assets.project().rows[0]?.title).toBe('Founder portrait')
  const flights = setup(8)
  flights.project().onChange('carry-on', true)
  expect(flights.project().rows).toHaveLength(9)
  flights.project().onChange('airline', ['Northwind'])
  expect(flights.project().rows).toHaveLength(2)
  const stale = flights.project()
  const target = stale.rows[0]?.id
  expect(target).toBeDefined()
  stale.onRequest('select-flight', target)
  expect(flights.reports).toEqual([{ actionId: 'select-flight', value: target }])
  flights.project().onChange('airline', ['Cascade'])
  stale.onRequest('select-flight', target)
  expect(flights.store.getState().lastRequest).toBeUndefined()
  const restaurants = setup(9)
  restaurants.project().onChange('cuisine', 'Pizza')
  restaurants.project().onChange('rating', '4.5')
  expect(restaurants.project().rows.map(({ id }) => id)).toEqual(['CC'])
  restaurants.project().onChange('price-level', ['$$$$'])
  expect(restaurants.project().rows).toHaveLength(0)
  restaurants.project().onReset()
  expect(restaurants.project().rows).toHaveLength(18)
})
test('shared content capacity keeps empty, one, eighty, eighty-one and long locale cases host-owned', () => {
  expect(setup(1, 'empty').project().rows).toHaveLength(0)
  expect(setup(1, 'one').project().rows).toHaveLength(1)
  expect(setup(1, 'boundary').project().rows).toHaveLength(80)
  expect(setup(1, 'overflow').project().rows).toHaveLength(81)
  expect(setup(1, 'overflow').render()).toContain('data-expected-maximum="80"')
  expect(setup(1, 'localized').render()).toContain('较长工作区名称下的筛选条件、完整结果与关联记录')
})
