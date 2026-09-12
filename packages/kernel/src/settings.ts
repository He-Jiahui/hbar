import type {
  JsonSchemaDescriptor,
  PluginInfo,
  ResolvedSetting,
  SettingDescriptor,
  SettingScope,
  SettingsCatalog,
  SettingsNavigationGroup,
  SettingsNavigationRoot,
} from '@hbar/contracts'
import {
  DEFAULT_THEME_PROFILE,
  settingScopeSchema,
  settingsCatalogSchema,
  settingDescriptorSchema,
  settingKey,
} from '@hbar/contracts'

export const BUILTIN_SETTINGS: readonly SettingDescriptor[] = [
  {
    id: 'session.defaultBudgetTokens',
    title: '默认会话预算',
    description: 'Budget 未填写时使用的 token 上限。',
    keywords: ['budget', 'token', '预算', '默认'],
    root: 'automation',
    group: 'automation',
    section: 'session',
    order: 10,
    icon: 'gauge',
    scopes: ['global'],
    schema: { type: 'integer', minimum: 1, maximum: 1_000_000_000, default: 10_000 },
    default: 10_000,
    restartPolicy: 'live',
    secret: false,
  },
  {
    id: 'notifications.taskCompleted',
    title: '任务完成时通知',
    description: '持续目标或普通任务完成时提醒。',
    keywords: ['notification', '完成', '通知'],
    root: 'automation',
    group: 'notifications',
    section: 'notifications',
    order: 20,
    icon: 'bell',
    scopes: ['global'],
    schema: { type: 'boolean', default: true },
    default: true,
    restartPolicy: 'live',
    secret: false,
  },
  {
    id: 'notifications.userInteraction',
    title: '需要用户交互时通知',
    description: '任务暂停等待选择或回答时提醒。',
    keywords: ['notification', 'interaction', '交互', '通知'],
    root: 'automation',
    group: 'notifications',
    section: 'notifications',
    order: 30,
    icon: 'bell',
    scopes: ['global'],
    schema: { type: 'boolean', default: true },
    default: true,
    restartPolicy: 'live',
    secret: false,
  },
  {
    id: 'notifications.retryFailed',
    title: '重试失败时通知',
    description: '持续任务因错误重试失败时提醒。',
    keywords: ['notification', 'retry', '重试', '错误'],
    root: 'automation',
    group: 'notifications',
    section: 'notifications',
    order: 40,
    icon: 'bell',
    scopes: ['global'],
    schema: { type: 'boolean', default: true },
    default: true,
    restartPolicy: 'live',
    secret: false,
  },
  {
    id: 'appearance.theme',
    title: '主题',
    description: '选择工作台的配色主题。',
    keywords: ['theme', '颜色', '显示'],
    root: 'appearance',
    group: 'appearance',
    section: 'theme',
    order: 10,
    icon: 'palette',
    scopes: ['global', 'project', 'session'],
    schema: { type: 'string', enum: ['dark', 'light', 'white'], default: 'dark' },
    default: 'dark',
    restartPolicy: 'live',
    secret: false,
  },
  {
    id: 'appearance.profile',
    title: '主题样式',
    description: '颜色、字体、透明度、模糊和动态效果。',
    keywords: ['theme', 'palette', 'font', 'glass', '颜色', '字体', '模糊'],
    root: 'appearance',
    group: 'appearance',
    section: 'theme',
    order: 20,
    icon: 'palette',
    scopes: ['global', 'project', 'session'],
    schema: { type: 'object' },
    default: DEFAULT_THEME_PROFILE,
    restartPolicy: 'live',
    secret: false,
  },
  {
    id: 'permission.mode',
    title: '默认权限模式',
    description: '控制写入文件和运行命令前是否需要确认。',
    keywords: ['permission', 'approval', '工具'],
    root: 'permissions',
    group: 'permissions',
    section: 'tool-execution',
    order: 10,
    icon: 'shield-check',
    scopes: ['global', 'project', 'session'],
    schema: { type: 'string', enum: ['deny', 'allow', 'ask'], default: 'ask' },
    default: 'ask',
    restartPolicy: 'live',
    secret: false,
  },
]

function pluginDescriptors(plugin: PluginInfo): SettingDescriptor[] {
  const contribution = plugin.contributes?.settings
  if (!contribution) return []
  return contribution.sections.flatMap((section) =>
    section.settings.map((setting) => {
      const id = settingKey(plugin.id, setting.id)
      return settingDescriptorSchema.parse({
        ...setting,
        id,
        root: 'plugins',
        group: `plugin.${plugin.id}`,
        section: setting.section ?? section.id,
        owner: plugin.id,
      })
    }),
  )
}

function navigationGroup(id: string, title: string, order: number, settingIds: string[]): SettingsNavigationGroup {
  return { id, title, order, settingIds }
}

export function buildSettingsCatalog(plugins: PluginInfo[]): SettingsCatalog {
  const settings = [...BUILTIN_SETTINGS, ...plugins.flatMap(pluginDescriptors)]
  const byRoot = new Map<string, SettingDescriptor[]>()
  for (const setting of settings) byRoot.set(setting.root, [...(byRoot.get(setting.root) ?? []), setting])
  const roots: SettingsNavigationRoot[] = [
    {
      id: 'automation',
      title: '任务与通知',
      description: '默认预算、无人模式和通知',
      icon: 'bell',
      order: 5,
      groups: [
        navigationGroup('automation', '会话任务', 10, byRoot.get('automation')?.filter((item) => item.group === 'automation').map((item) => item.id) ?? []),
        navigationGroup('notifications', '通知', 20, byRoot.get('automation')?.filter((item) => item.group === 'notifications').map((item) => item.id) ?? []),
      ],
    },
    {
      id: 'appearance',
      title: '外观',
      description: '主题与显示体验',
      icon: 'palette',
      order: 10,
      groups: [navigationGroup('appearance', '界面主题', 10, byRoot.get('appearance')?.map((item) => item.id) ?? [])],
    },
    {
      id: 'permissions',
      title: '权限',
      description: '工具执行策略',
      icon: 'shield-check',
      order: 20,
      groups: [navigationGroup('permissions', '工具权限', 10, byRoot.get('permissions')?.map((item) => item.id) ?? [])],
    },
    {
      id: 'plugins',
      title: '插件',
      description: '扩展与诊断',
      icon: 'blocks',
      order: 60,
      groups: plugins
        .filter((plugin) => plugin.contributes?.settings)
        .map((plugin, index) =>
          navigationGroup(
            `plugin.${plugin.id}`,
            plugin.name,
            index,
            settings.filter((setting) => setting.owner === plugin.id).map((setting) => setting.id),
          ),
        ),
    },
  ]
  return settingsCatalogSchema.parse({
    schemaVersion: 1,
    navigation: { schemaVersion: 1, roots },
    settings,
  })
}

export function settingDescriptors(catalog: SettingsCatalog): Map<string, SettingDescriptor> {
  return new Map(catalog.settings.map((setting) => [setting.id, setting]))
}

export function validateSettingValue(schema: JsonSchemaDescriptor, value: unknown): void {
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) throw new Error('Value is not one of the allowed options')
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new Error('Value must be a string')
    if (schema.minLength !== undefined && value.length < schema.minLength) throw new Error('Value is too short')
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw new Error('Value is too long')
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) throw new Error('Value has an invalid format')
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)))
      throw new Error(`Value must be a ${schema.type}`)
    if (schema.minimum !== undefined && value < schema.minimum) throw new Error('Value is below the minimum')
    if (schema.maximum !== undefined && value > schema.maximum) throw new Error('Value is above the maximum')
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error('Value must be a boolean')
  else if (schema.type === 'array' && !Array.isArray(value)) throw new Error('Value must be an array')
  else if (schema.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) throw new Error('Value must be an object')
}

export function resolveSettings(
  descriptors: Iterable<SettingDescriptor>,
  scope: SettingScope,
  global: Record<string, unknown>,
  project: Record<string, unknown>,
  session: Record<string, unknown>,
): Record<string, ResolvedSetting> {
  settingScopeSchema.parse(scope)
  const result: Record<string, ResolvedSetting> = {}
  for (const descriptor of descriptors) {
    const defaultValue = descriptor.default ?? descriptor.schema.default
    const candidates: [SettingScope, Record<string, unknown>][] = [
      ['global', global],
      ...(scope !== 'global' ? ([['project', project]] as [SettingScope, Record<string, unknown>][]) : []),
      ...(scope === 'session' ? ([['session', session]] as [SettingScope, Record<string, unknown>][]) : []),
    ]
    let effectiveValue = defaultValue
    let source: ResolvedSetting['source'] = 'default'
    for (const [candidateScope, values] of candidates) {
      if (Object.hasOwn(values, descriptor.id)) {
        effectiveValue = values[descriptor.id]
        source = candidateScope
      }
    }
    result[descriptor.id] = {
      id: descriptor.id,
      effectiveValue,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(Object.hasOwn((scope === 'session' ? session : scope === 'project' ? project : global), descriptor.id)
        ? { localValue: (scope === 'session' ? session : scope === 'project' ? project : global)[descriptor.id] }
        : {}),
      source,
      overridden: source !== 'default' && source !== scope,
      editable: descriptor.scopes.includes(scope),
      restartPolicy: descriptor.restartPolicy,
    }
  }
  return result
}

export function searchSettings(catalog: SettingsCatalog, query: string): Array<SettingDescriptor & { path: string }> {
  const normalized = query.trim().toLocaleLowerCase()
  return catalog.settings
    .filter((setting) => {
      if (!normalized) return true
      return [setting.id, setting.title, setting.description, ...setting.keywords].some((value) =>
        value?.toLocaleLowerCase().includes(normalized),
      )
    })
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((setting) => ({ ...setting, path: [setting.root, setting.group, setting.section, setting.title].filter(Boolean).join(' / ') }))
}
