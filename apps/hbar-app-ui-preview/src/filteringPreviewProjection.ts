import type { LumenFilteringContent, LumenFilteringReferenceContent as Content, LumenFilteringReferenceField as Field, LumenFilteringReferenceValue as Value } from '@lumen/app-ui/catalog'
import type { FilteringPreviewField, FilteringPreviewSeed, FilteringPreviewStoreApi } from './filteringPreviewModel'
import { filteringPreviewNotice } from './filteringPreviewReferenceFixtures'

function unique<T extends { readonly id: string }>(rows: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return rows.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
function seedField(field: Field): readonly FilteringPreviewField[] {
  const base = { id: field.id, ...(field.disabled === undefined ? {} : { disabled: field.disabled }) }
  switch (field.kind) {
    case 'single':
      return [{ ...base, kind: 'single', choices: field.options, initialValue: field.value }]
    case 'multi':
      return [{ ...base, kind: 'multi', choices: field.options, initialValue: field.value }]
    case 'text':
      return [{ ...base, kind: 'text', initialValue: field.value, maximumLength: 1000 }]
    case 'boolean':
      return [{ ...base, kind: 'boolean', initialValue: field.value }]
    case 'stepper':
      return [{ ...base, kind: 'number', initialValue: field.value, minimum: field.minimum, maximum: field.maximum }]
    case 'range':
      return [
        {
          id: field.minimumId,
          ...(field.disabled === undefined ? {} : { disabled: field.disabled }),
          kind: 'number',
          initialValue: field.value[0],
          minimum: field.minimum,
          maximum: field.maximum,
        },
        {
          id: field.maximumId,
          ...(field.disabled === undefined ? {} : { disabled: field.disabled }),
          kind: 'number',
          initialValue: field.value[1],
          minimum: field.minimum,
          maximum: field.maximum,
        },
      ]
    case 'tokens':
      return [
        {
          ...base,
          kind: 'multi',
          choices: [],
          initialValue: field.value,
          allowCustom: true,
          maximumSelections: field.maximum,
        },
        { id: field.draftId, kind: 'text', initialValue: field.draft, maximumLength: 100 },
      ]
    default:
      return []
  }
}
export function createFilteringPreviewSeed(
  content: Content,
  variant: number,
  ownerId: string,
  fixtureId: string,
): FilteringPreviewSeed {
  const fields: FilteringPreviewField[] = content.fields.flatMap(seedField)
  if (content.kind === 'bikes') fields.push({ id: 'filters-open', kind: 'boolean', initialValue: content.open })
  if (content.kind === 'deals') {
    fields.push(
      {
        id: 'rules',
        kind: 'multi',
        choices: content.ruleOptions,
        initialValue: content.rules.map(({ id }) => id),
        maximumSelections: 5,
      },
      { id: 'active-rule', kind: 'single', choices: [{ id: 'none' }, ...content.ruleOptions], initialValue: 'none' },
    )
    content.rules.forEach(({ field }) => fields.push(...seedField(field)))
    fields.push(
      {
        id: 'owner-filter',
        kind: 'single',
        choices: [{ id: 'all' }, ...[...new Set(content.rows.map(({ owner }) => owner))].map((id) => ({ id }))],
        initialValue: 'all',
      },
      { id: 'company-filter', kind: 'text', initialValue: '', maximumLength: 200 },
      { id: 'probability-threshold', kind: 'number', initialValue: 0, minimum: 0, maximum: 100 },
    )
  }
  const requestActions =
    content.kind === 'flights'
      ? content.rows.map(({ id }) => ({ actionId: 'select-flight', value: id }))
      : content.kind === 'bikes'
        ? [{ actionId: 'apply' }]
        : []
  return { ownerId, variant, fixtureId, fields, requestActions }
}
function money(value: number) {
  return `$${value.toLocaleString('en-US')}`
}
export function projectFilteringPreview(
  input: Content,
  store: FilteringPreviewStoreApi,
  report?: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenFilteringContent {
  const state = store.getState()
  const ownerId = state.ownerId
  const string = (id: string, fallback = '') =>
    typeof state.valuesById[id] === 'string' ? (state.valuesById[id] as string) : fallback
  const number = (id: string, fallback = 0) =>
    typeof state.valuesById[id] === 'number' ? (state.valuesById[id] as number) : fallback
  const values = (id: string): readonly string[] =>
    Array.isArray(state.valuesById[id]) ? (state.valuesById[id] as readonly string[]) : []
  const boolean = (id: string) => state.valuesById[id] === true
  const matches = (fieldId: string, value: string) => values(fieldId).length === 0 || values(fieldId).includes(value)
  const field = (value: Field): Field => {
    switch (value.kind) {
      case 'single':
        return { ...value, value: string(value.id, value.value) }
      case 'multi':
        return { ...value, value: values(value.id) }
      case 'text':
        return { ...value, value: string(value.id) }
      case 'boolean':
        return { ...value, value: boolean(value.id) }
      case 'stepper':
        return { ...value, value: number(value.id, value.value) }
      case 'range':
        return { ...value, value: [number(value.minimumId, value.minimum), number(value.maximumId, value.maximum)] }
      case 'tokens':
        return { ...value, value: values(value.id), draft: string(value.draftId) }
      default:
        return value
    }
  }
  let projected = input
  let fields = input.fields.map(field)
  switch (input.kind) {
    case 'catalog': {
      const eligible = (excluding = '') =>
        unique(input.rows).filter(
          (row) =>
            (excluding === 'category' || matches('category', row.categoryId)) &&
            (excluding === 'maker' || matches('maker', row.makerId)) &&
            (excluding === 'glaze' || matches('glaze', row.glazeId)) &&
            row.price >= number('price-minimum') &&
            row.price <= number('price-maximum', 100),
        )
      const rows = eligible()
      fields = fields.map((item) =>
        item.kind === 'multi' && ['category', 'maker', 'glaze'].includes(item.id)
          ? {
              ...item,
              options: item.options.map((option) => {
                const count = eligible(item.id).filter(
                  (row) =>
                    (item.id === 'category' ? row.categoryId : item.id === 'maker' ? row.makerId : row.glazeId) ===
                    option.id,
                ).length
                return { ...option, detail: `${count}${item.id === 'glaze' ? ' pieces' : ''}` }
              }),
            }
          : item,
      )
      rows.sort((a, b) =>
        string('sort') === 'price-asc'
          ? a.price - b.price
          : string('sort') === 'price-desc'
            ? b.price - a.price
            : string('sort') === 'name'
              ? a.title.localeCompare(b.title)
              : 0,
      )
      projected = {
        ...input,
        rows,
        available: values('size').length === 0,
        subtitle: `${rows.length} of ${unique(input.rows).length} pieces`,
      }
      break
    }
    case 'bikes': {
      const filterIds = state.fields.filter(({ id }) => id !== 'filters-open').map(({ id }) => id)
      const active = filterIds.filter((id) => {
        const definition = state.fields.find((item) => item.id === id)
        return definition && JSON.stringify(state.valuesById[id]) !== JSON.stringify(definition.initialValue)
      }).length
      const frames = values('frame')
      const frameField = input.fields.find(({ id }) => id === 'frame')
      const onlyFrames = active === 1 && frames.length > 0
      const count =
        active === 0
          ? 18
          : onlyFrames && frameField?.kind === 'multi'
            ? frameField.options
                .filter(({ id }) => frames.includes(id))
                .reduce((sum, option) => sum + Number(option.detail), 0)
            : undefined
      const knownEmpty = count === 0
      if (knownEmpty) {
        fields = fields.map((item) =>
          item.id === 'groupset' && item.kind === 'multi'
            ? { ...item, options: item.options.map((option) => ({ ...option, detail: '0' })) }
            : item,
        )
      }
      projected = {
        ...input,
        open: boolean('filters-open'),
        dirty: active > 0,
        available: !knownEmpty,
        applyLabel: knownEmpty ? 'No bikes match' : count === undefined ? 'Apply filters' : `Show ${count} results`,
        subtitle: `Second-hand bikes${active ? ` · ${active} active` : ''}`,
        appliedLabel:
          JSON.stringify(state.appliedById) !==
          JSON.stringify(Object.fromEntries(state.fields.map((item) => [item.id, item.initialValue])))
            ? 'Filter selection applied locally; bike records are not included in the reference.'
            : undefined,
      }
      break
    }
    case 'deals': {
      const ruleIds = values('rules')
      const query = string('query').toLocaleLowerCase()
      const rows = unique(input.rows).filter(
        (row) =>
          `${row.title} ${row.company}`.toLocaleLowerCase().includes(query) &&
          (!ruleIds.includes('stage') || row.stage !== string('stage-excluded')) &&
          (!ruleIds.includes('value') || row.amount > number('value-threshold')) &&
          (!ruleIds.includes('owner') || string('owner-filter') === 'all' || row.owner === string('owner-filter')) &&
          (!ruleIds.includes('company') ||
            row.company.toLocaleLowerCase().includes(string('company-filter').toLocaleLowerCase())) &&
          (!ruleIds.includes('probability') || row.probability >= number('probability-threshold')) &&
          (string('view') !== 'late' || ['Proposal', 'Negotiation', 'Won'].includes(row.stage)) &&
          (string('view') !== 'high' || row.amount >= 50000),
      )
      const ownerOptions = [
        { id: 'all', label: 'Any owner' },
        ...[...new Set(input.rows.map(({ owner }) => owner))].map((id) => ({ id, label: id })),
      ]
      const definitions = [
        ...input.rules,
        {
          id: 'owner',
          label: `Owner is ${string('owner-filter', 'all') === 'all' ? 'anyone' : string('owner-filter')}`,
          removeLabel: 'Remove Owner filter',
          field: {
            id: 'owner-filter',
            label: 'Owner',
            kind: 'single' as const,
            display: 'select' as const,
            value: string('owner-filter', 'all'),
            options: ownerOptions,
            placement: 'toolbar' as const,
          },
        },
        {
          id: 'company',
          label: `Company contains ${string('company-filter') || '…'}`,
          removeLabel: 'Remove Company filter',
          field: {
            id: 'company-filter',
            label: 'Company contains',
            kind: 'text' as const,
            value: string('company-filter'),
            placeholder: 'Company name',
            placement: 'toolbar' as const,
          },
        },
        {
          id: 'probability',
          label: `Probability at least ${number('probability-threshold')}%`,
          removeLabel: 'Remove Probability filter',
          field: {
            id: 'probability-threshold',
            label: 'Minimum probability',
            kind: 'stepper' as const,
            value: number('probability-threshold'),
            minimum: 0,
            maximum: 100,
            valueLabel: (value: number) => `${value}%`,
            stepLabels: ['Decrease probability', 'Increase probability'] as const,
            placement: 'toolbar' as const,
          },
        },
      ]
      projected = {
        ...input,
        rows,
        available: string('view') !== 'mine',
        subtitle: `${rows.length} of ${unique(input.rows).length} deals · ${money(rows.reduce((sum, row) => sum + row.amount, 0))} weighted`,
        activeRuleId: string('active-rule', 'none'),
        rules: definitions
          .filter(({ id }) => ruleIds.includes(id))
          .map((rule) => ({
            ...rule,
            label:
              rule.id === 'stage'
                ? `Stage is not ${string('stage-excluded')}`
                : rule.id === 'value'
                  ? `Deal value greater than ${money(number('value-threshold'))}`
                  : rule.label,
            field: field(rule.field),
          })),
      }
      break
    }
    case 'logs': {
      const query = string('query').toLocaleLowerCase()
      const period = Number(string('time', '240'))
      const rows = unique(input.rows).filter(
        (row) =>
          matches('service', row.service) &&
          matches('severity', row.severity) &&
          `${row.title} ${row.service}`.toLocaleLowerCase().includes(query) &&
          row.minute >= 14 * 60 + 32 - period,
      )
      fields = fields.map((item) =>
        item.id === 'severity' && item.kind === 'multi'
          ? {
              ...item,
              options: item.options.map((option) => ({
                ...option,
                detail: String(rows.filter(({ severity }) => severity === option.id).length),
              })),
            }
          : item,
      )
      const volume = Array.from({ length: 30 }, () => 0)
      rows.forEach(({ minute }) => {
        const index = Math.min(29, Math.max(0, Math.floor(((minute - (14 * 60 + 32 - period)) / period) * 30)))
        volume[index] = (volume[index] ?? 0) + 1
      })
      const peak = Math.max(...volume, 0)
      const rangeLabel =
        period === 15
          ? 'last 15 minutes'
          : period === 60
            ? 'last hour'
            : period === 240
              ? 'last 4 hours'
              : 'last 24 hours'
      projected = {
        ...input,
        rows,
        subtitle: `${rows.length} events over ${rangeLabel}`,
        available: period <= 240,
        volume:
          rows.length === input.rows.length && period === 240
            ? input.volume
            : volume.map((value) => (peak ? (value / peak) * 7 : 0)),
        volumeLabels: [
          `Volume · ${rangeLabel}`,
          `peak ${rows.length === input.rows.length && period === 240 ? 7 : peak}/bucket`,
          'oldest',
          'now',
        ],
        footer:
          query || values('service').length || values('severity').length || period !== 240
            ? 'Filters applied to the supplied snapshot'
            : 'No filters applied',
      }
      break
    }
    case 'rentals': {
      const rows = unique(input.rows).filter(
        (row) =>
          (string('property') === 'all' || row.propertyType === string('property')) &&
          row.beds >= number('beds') &&
          row.baths >= number('baths') &&
          row.rent >= number('rent-minimum') &&
          row.rent <= number('rent-maximum', 6000) &&
          (string('available') === 'any' || row.availableDays <= Number(string('available'))),
      )
      projected = {
        ...input,
        rows,
        available: values('amenities').length === 0,
        subtitle: `${rows.length} of ${unique(input.rows).length} homes match`,
      }
      break
    }
    case 'candidates': {
      const rows = unique(input.rows).filter(
        (row) =>
          values('skills').every((value) =>
            row.skills.some((skill) => skill.toLocaleLowerCase() === value.toLocaleLowerCase()),
          ) &&
          matches('seniority', row.seniority) &&
          row.compensation >= number('compensation-minimum') &&
          row.compensation <= number('compensation-maximum', 260) &&
          (string('location') === 'all' || row.location === string('location')) &&
          (!boolean('remote') || row.remote),
      )
      rows.sort((a, b) =>
        string('sort') === 'salary-asc'
          ? a.compensation - b.compensation
          : string('sort') === 'name'
            ? a.title.localeCompare(b.title)
            : b.compensation - a.compensation,
      )
      projected = { ...input, rows, subtitle: `${rows.length} of ${unique(input.rows).length} engineers` }
      break
    }
    case 'assets': {
      const rows = unique(input.rows).filter(
        (row) =>
          matches('type', row.assetType) &&
          matches(
            'orientation',
            row.width === row.height ? 'Square' : row.width > row.height ? 'Landscape' : 'Portrait',
          ),
      )
      rows.sort((a, b) =>
        string('sort') === 'name'
          ? a.title.localeCompare(b.title)
          : string('sort') === 'size-asc'
            ? a.bytes - b.bytes
            : string('sort') === 'size-desc'
              ? b.bytes - a.bytes
              : 0,
      )
      projected = {
        ...input,
        rows,
        density: string('density', 'comfortable'),
        subtitle: `${rows.length} of ${unique(input.rows).length} assets`,
      }
      break
    }
    case 'flights': {
      const eligible = (excluding = '') =>
        unique(input.rows).filter(
          (row) =>
            (excluding === 'airline' || matches('airline', row.airline)) &&
            (excluding === 'stops' || string('stops') === 'any' || row.stops <= Number(string('stops'))) &&
            row.departure >= number('departure-minimum') &&
            row.departure <= number('departure-maximum', 1440) &&
            row.duration >= number('duration-minimum') &&
            row.duration <= number('duration-maximum', 660) &&
            (!boolean('carry-on') || row.carryOn),
        )
      const rows = eligible()
      fields = fields.map((item) => {
        if (item.id === 'stops' && item.kind === 'single') {
          return {
            ...item,
            options: item.options.map((option) => ({
              ...option,
              detail: String(
                eligible('stops').filter((row) => option.id === 'any' || row.stops <= Number(option.id)).length,
              ),
            })),
          }
        }
        if (item.id === 'airline' && item.kind === 'multi') {
          return {
            ...item,
            options: item.options.map((option) => {
              const prices = eligible('airline')
                .filter(({ airline }) => airline === option.id)
                .map(({ price }) => price)
              return { ...option, detail: prices.length ? `from ${money(Math.min(...prices))}` : undefined }
            }),
          }
        }
        return item
      })
      rows.sort((a, b) =>
        string('sort') === 'duration'
          ? a.duration - b.duration
          : string('sort') === 'departure'
            ? a.departure - b.departure
            : a.price - b.price,
      )
      projected = {
        ...input,
        rows,
        selectedId: state.lastRequest?.actionId === 'select-flight' ? (state.lastRequest.value ?? '') : '',
        subtitle: `${rows.length} of ${unique(input.rows).length} flights · Thu, Jun 12 · SFO → JFK`,
      }
      break
    }
    case 'restaurants': {
      const rows = unique(input.rows).filter(
        (row) =>
          (string('cuisine') === 'all' || row.cuisine === string('cuisine')) &&
          row.rating >= Number(string('rating', '0')) &&
          matches('price-level', row.priceLevel) &&
          (string('delivery') === 'any' || row.deliveryMinutes <= Number(string('delivery'))),
      )
      projected = {
        ...input,
        rows,
        available: values('diet').length === 0,
        subtitle: `${rows.length} places deliver to Mission St · 94110`,
      }
      break
    }
    default:
      break
  }
  if (!projected.available && projected.kind !== 'bikes') {
    projected = { ...projected, rows: [], subtitle: projected.labels.unavailable }
  }
  return {
    reference: {
      ...projected,
      fields,
      onChange: (fieldId, value: Value) => {
        const current = store.getState()
        if (input.kind === 'deals' && fieldId === 'view' && value === 'all') {
          current.setValue(ownerId, 'rules', [])
          current.setValue(ownerId, 'active-rule', 'none')
        }
        if (input.kind === 'deals' && fieldId === 'active-rule' && typeof value === 'string' && value !== 'none') {
          if (!input.ruleOptions.some(({ id, disabled }) => id === value && !disabled)) return
          const active = current.valuesById.rules
          if (Array.isArray(active) && !active.includes(value)) {
            const activeIds = active.filter((id): id is string => typeof id === 'string')
            current.setValue(ownerId, 'rules', [...activeIds, value])
          }
        }
        const rangeField = input.fields.find(
          (item) => item.kind === 'range' && (item.minimumId === fieldId || item.maximumId === fieldId),
        )
        if (rangeField?.kind === 'range' && typeof value === 'number') {
          const paired =
            current.valuesById[fieldId === rangeField.minimumId ? rangeField.maximumId : rangeField.minimumId]
          if (typeof paired === 'number' && (fieldId === rangeField.minimumId ? value > paired : value < paired)) return
        }
        current.setValue(ownerId, fieldId, value)
      },
      onReset: () => {
        const current = store.getState()
        current.reset(
          ownerId,
          current.fields.filter(({ id }) => id !== 'filters-open').map(({ id }) => id),
        )
      },
      onRequest: (actionId, value) => {
        const current = store.getState()
        if (input.kind === 'flights') {
          const currentContent = projectFilteringPreview(input, store).reference
          if (
            actionId !== 'select-flight' ||
            !value ||
            !currentContent?.available ||
            !currentContent.rows.some(({ id }) => id === value)
          )
            return
        }
        if (input.kind === 'bikes' && actionId === 'apply') {
          const currentContent = projectFilteringPreview(input, store).reference
          if (currentContent?.kind !== 'bikes' || !currentContent.open || !currentContent.available) return
          current.apply(ownerId)
          current.setValue(ownerId, 'filters-open', false)
        }
        const request = store.getState().request(ownerId, { actionId, ...(value === undefined ? {} : { value }) })
        if (request)
          report?.({ actionId: request.actionId, ...(request.value === undefined ? {} : { value: request.value }) })
      },
    },
    presentation: {
      ownerId,
      notice: state.lastRequest
        ? filteringPreviewNotice(state.lastRequest.actionId, state.lastRequest.value)
        : undefined,
    },
  }
}
