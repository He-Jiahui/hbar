import { Model } from 'flexlayout-react'
import type { IJsonModel } from 'flexlayout-react'
import rawDefaultLayout from './default-layout.json'

export const CURRENT_LAYOUT_VERSION = 2
const LEGACY_LAYOUT_VERSION = 1
type UnknownRecord = Record<string, unknown>

// This is only an emergency escape hatch for a malformed bundled descriptor.
// The normal default always comes from default-layout.json.
const emergencyLayout: IJsonModel = {
  global: { tabSetEnableMaximize: true, tabSetMinWidth: 230, tabSetMinHeight: 180, tabEnableRename: false },
  layout: {
    type: 'row',
    id: 'root',
    children: [
      {
        type: 'tabset',
        id: 'main',
        weight: 100,
        children: [{ type: 'tab', id: 'welcome', name: '新会话', component: 'conversation', enableClose: false }],
      },
    ],
  },
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasModelRoot(value: unknown): value is IJsonModel {
  if (!isRecord(value) || !isRecord(value.layout)) return false
  return value.layout.type === 'row'
}

function collectNodeIds(value: unknown, ids: Set<string>): boolean {
  if (!isRecord(value)) return false
  if (value.id !== undefined && (typeof value.id !== 'string' || value.id.length === 0)) return false
  if (typeof value.id === 'string') {
    if (ids.has(value.id)) return false
    ids.add(value.id)
  }
  if (
    value.weight !== undefined &&
    (typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight <= 0)
  )
    return false
  if (value.size !== undefined && (typeof value.size !== 'number' || !Number.isFinite(value.size) || value.size <= 0))
    return false
  if (value.children === undefined) return true
  if (!Array.isArray(value.children)) return false
  return value.children.every((child) => collectNodeIds(child, ids))
}

function validateNodes(model: IJsonModel): boolean {
  const ids = new Set<string>()
  if (!collectNodeIds(model.layout, ids)) return false
  if (model.borders && !model.borders.every((border) => collectNodeIds(border, ids))) return false
  return true
}

function parseModel(value: unknown): IJsonModel | null {
  if (!hasModelRoot(value) || !validateNodes(value)) return null
  try {
    const model = Model.fromJson(value)
    const normalized = model.toJson()
    return hasModelRoot(normalized) && validateNodes(normalized) ? normalized : null
  } catch {
    return null
  }
}

function parseCandidate(value: unknown): IJsonModel | null {
  if (!isRecord(value)) return null
  const version = value.schemaVersion
  if (version !== undefined && version !== CURRENT_LAYOUT_VERSION && version !== LEGACY_LAYOUT_VERSION) return null
  const candidate = { ...value }
  delete candidate.schemaVersion
  if (version === LEGACY_LAYOUT_VERSION) migrateLegacyLayout(candidate)
  migrateToolLabels(candidate)
  return parseModel(candidate)
}

function migrateToolLabels(candidate: UnknownRecord) {
  const visit = (value: unknown) => {
    if (!isRecord(value)) return
    if (value.component === 'terminal' && value.id === 'terminal') value.name = '命令控制台'
    if (Array.isArray(value.children)) for (const child of value.children) visit(child)
  }
  visit(candidate.layout)
  if (Array.isArray(candidate.borders)) for (const border of candidate.borders) visit(border)
}

function migrateLegacyLayout(candidate: UnknownRecord) {
  // v1 bundled layouts exposed an always-visible activity tabset. Keep user tabs,
  // but remove that generated tabset so tools become explicit layout actions.
  if (!isRecord(candidate.layout)) return
  const root = candidate.layout
  if (!Array.isArray(root.children)) return
  root.children = root.children.filter((child) => {
    if (!isRecord(child) || child.id !== 'tools') return true
    const children = child.children
    return !(Array.isArray(children) && children.length === 1 && isRecord(children[0]) && children[0].id === 'activity')
  })

  const ids = new Set<string>()
  collectNodeIds(candidate.layout, ids)
  if (Array.isArray(candidate.borders)) for (const border of candidate.borders) collectNodeIds(border, ids)
  const existingBorders: unknown[] = Array.isArray(candidate.borders) ? candidate.borders : []
  const defaultBorders: UnknownRecord[] =
    isRecord(rawDefaultLayout) && Array.isArray(rawDefaultLayout.borders)
      ? (rawDefaultLayout.borders as unknown[]).filter(isRecord)
      : []
  const existingLocations = new Set(
    existingBorders
      .filter(isRecord)
      .flatMap((border) => (typeof border.location === 'string' ? [border.location] : [])),
  )
  const migratedBorders: unknown[] = [...existingBorders]
  for (const source of defaultBorders) {
    if (typeof source.location !== 'string' || existingLocations.has(source.location)) continue
    const children = Array.isArray(source.children)
      ? source.children.filter((child) => {
          if (!isRecord(child) || typeof child.id !== 'string') return false
          if (ids.has(child.id)) return false
          ids.add(child.id)
          return true
        })
      : []
    migratedBorders.push({ ...source, show: false, selected: -1, children })
    existingLocations.add(source.location)
  }
  if (migratedBorders.length) candidate.borders = migratedBorders
}

export function defaultLayout(): IJsonModel {
  return parseCandidate(rawDefaultLayout) ?? emergencyLayout
}

export function restoreLayout(value: unknown): IJsonModel {
  return parseCandidate(value) ?? defaultLayout()
}

export function versionedLayout(value: IJsonModel): IJsonModel & { schemaVersion: number } {
  return { ...value, schemaVersion: CURRENT_LAYOUT_VERSION }
}
