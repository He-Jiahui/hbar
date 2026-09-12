import { Bell, Blocks, BookOpen, Bot, HardDrive, Monitor, Palette, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { SettingsCatalog } from '@hbar/contracts'
import GlassSurface from './react-bits/GlassSurface'

type SettingsDestination = {
  id: 'appearance' | 'automation' | 'models' | 'permissions' | 'paths' | 'skills' | 'plugins' | 'devices'
  label: string
  description: string
  icon: LucideIcon
}

const SETTINGS_DESTINATIONS = [
  { id: 'appearance', label: '外观', description: '主题与显示体验', icon: Palette },
  { id: 'automation', label: '任务与通知', description: '默认预算与通知提醒', icon: Bell },
  { id: 'models', label: '模型', description: '供应商与能力', icon: Bot },
  { id: 'permissions', label: '权限', description: '工具执行策略', icon: ShieldCheck },
  { id: 'paths', label: '存储', description: '目录与数据位置', icon: HardDrive },
  { id: 'skills', label: '技能', description: '全局技能目录', icon: BookOpen },
  { id: 'plugins', label: '插件', description: '扩展与诊断', icon: Blocks },
  { id: 'devices', label: '设备与连接', description: '配对与宿主地址', icon: Monitor },
] as const satisfies readonly SettingsDestination[]

export type SettingsTab = (typeof SETTINGS_DESTINATIONS)[number]['id']

export default function SettingsNavigation({
  tab,
  onSelect,
  catalog,
  onSelectPlugin,
}: {
  tab: SettingsTab
  onSelect(tab: SettingsTab): void
  catalog?: SettingsCatalog | null
  onSelectPlugin?(id: string): void
}) {
  const pluginGroups = catalog?.navigation.roots.find((root) => root.id === 'plugins')?.groups ?? []
  return (
    <nav className="settings-tabs settings-nav rb-settings-tabs" aria-label="设置分组">
      <GlassSurface className="settings-tabs-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="settings-nav-items">
        {SETTINGS_DESTINATIONS.map(({ id, label, description, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={tab === id ? 'selected' : ''}
            aria-label={label}
            aria-current={tab === id ? 'page' : undefined}
            title={description}
            onClick={() => onSelect(id)}
          >
            <span className="settings-nav-icon" aria-hidden="true">
              <Icon size={16} />
            </span>
            <span className="settings-nav-copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
      {tab === 'plugins' && pluginGroups.length > 0 && (
        <div className="settings-subnav" role="list" aria-label="插件设置">
          {pluginGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              role="listitem"
              title={`${group.title} 插件设置`}
              onClick={() => onSelectPlugin?.(group.id.replace(/^plugin\./, ''))}
            >
              <span>{group.title}</span>
              <small>{group.settingIds.length} 项设置</small>
            </button>
          ))}
        </div>
      )}
    </nav>
  )
}
