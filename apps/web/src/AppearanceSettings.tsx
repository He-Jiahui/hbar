import { HbarAppUiPreferencesSettings } from 'hbar-app-ui/settings-form'
import { useWorkbench } from './stores'
import { useLocale } from './locale'
import { updateAppearance } from './appearance-model'

export default function AppearanceSettings() {
  const theme = useWorkbench((state) => state.theme)
  const { locale, t } = useLocale()
  return (
    <HbarAppUiPreferencesSettings
      labels={{
        pageTitle: t('appearance'),
        panelTitle: t('appearanceTheme'),
        panelDescription: t('appearanceDeviceHint'),
        themeLabel: t('settingThemeTitle'),
        themeCurrent: t('appearanceCurrentDevice'),
        themeDescription: t('settingThemeDescription'),
        densityLabel: t('appearanceDensity'),
        densityDescription: t('appearanceDensityHint'),
        languageLabel: t('language'),
        languageDescription: t('appearanceLanguageHint'),
        toggleGroup: t('appearanceNotifications'),
        changed: t('appearanceChanged'),
        recommended: t('appearanceRecommended'),
        unsaved: t('appearanceUnsaved'),
        cancel: t('cancel'),
        save: t('save'),
        unavailableChoice: t('appearanceUnavailable'),
      }}
      themeChoices={[
        { id: 'dark', label: t('themeDark') },
        { id: 'light', label: t('themeLight') },
        { id: 'white', label: t('themeWhite') },
      ]}
      themeId={theme}
      languageChoices={[
        { id: 'zh-CN', label: t('languageChinese') },
        { id: 'en-US', label: t('languageEnglish') },
      ]}
      languageId={locale}
      densityChoices={[]}
      densityId=""
      toggles={[]}
      checkbox={undefined}
      persistence={{ mode: 'immediate' }}
      onChange={updateAppearance}
    />
  )
}
