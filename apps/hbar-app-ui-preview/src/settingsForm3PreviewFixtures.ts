import type {
  SettingsForm3Density,
  SettingsForm3Language,
  SettingsForm3PreviewStoreSeed,
  SettingsForm3PreviewStoreState,
  SettingsForm3Theme,
} from './settingsForm3PreviewStore'

export type SettingsForm3PreviewLocale = 'en' | 'de'

export interface SettingsForm3PreviewOption<Id extends string> {
  readonly id: Id
  readonly label: string
}

export interface SettingsForm3PreviewField<Id extends string, Value> {
  readonly id: Id
  readonly label: string
  readonly description: string
  readonly value: Value
  readonly changed: boolean
  readonly recommended?: string | undefined
}

export interface SettingsForm3PreviewContent {
  readonly pageTitle: string
  readonly panelTitle: string
  readonly panelDescription: string
  readonly changedLabel: string
  readonly recommendedLabel: string
  readonly fields: {
    readonly theme: SettingsForm3PreviewField<'theme', SettingsForm3Theme> & {
      readonly deviceLabel: string
      readonly options: readonly SettingsForm3PreviewOption<SettingsForm3Theme>[]
    }
    readonly density: SettingsForm3PreviewField<'density', SettingsForm3Density> & {
      readonly options: readonly SettingsForm3PreviewOption<SettingsForm3Density>[]
    }
    readonly language: SettingsForm3PreviewField<'language', SettingsForm3Language> & {
      readonly options: readonly SettingsForm3PreviewOption<SettingsForm3Language>[]
    }
    readonly weeklySummary: SettingsForm3PreviewField<'weeklySummary', boolean>
    readonly mentions: SettingsForm3PreviewField<'mentions', boolean>
    readonly commentReplies: SettingsForm3PreviewField<'commentReplies', boolean>
    readonly notificationSounds: SettingsForm3PreviewField<'notificationSounds', boolean>
  }
  readonly footer: {
    readonly status: string
    readonly cancelLabel: string
    readonly saveLabel: string
    readonly savingLabel: string
    readonly saveButtonLabel: string
    readonly cancelDisabled: boolean
    readonly saveDisabled: boolean
  }
}

interface SettingsForm3Copy {
  readonly pageTitle: string
  readonly panelTitle: string
  readonly panelDescription: string
  readonly changedLabel: string
  readonly recommendedLabel: string
  readonly fields: {
    readonly theme: Omit<SettingsForm3PreviewContent['fields']['theme'], 'value' | 'changed' | 'options'>
    readonly density: Omit<SettingsForm3PreviewContent['fields']['density'], 'value' | 'changed' | 'options'>
    readonly language: Omit<SettingsForm3PreviewContent['fields']['language'], 'value' | 'changed' | 'options'>
    readonly weeklySummary: Omit<
      SettingsForm3PreviewContent['fields']['weeklySummary'],
      'value' | 'changed' | 'recommended'
    >
    readonly mentions: Omit<SettingsForm3PreviewContent['fields']['mentions'], 'value' | 'changed' | 'recommended'>
    readonly commentReplies: Omit<
      SettingsForm3PreviewContent['fields']['commentReplies'],
      'value' | 'changed' | 'recommended'
    >
    readonly notificationSounds: Omit<
      SettingsForm3PreviewContent['fields']['notificationSounds'],
      'value' | 'changed' | 'recommended'
    >
  }
  readonly themeOptions: readonly SettingsForm3PreviewOption<SettingsForm3Theme>[]
  readonly densityOptions: readonly SettingsForm3PreviewOption<SettingsForm3Density>[]
  readonly languageOptions: readonly SettingsForm3PreviewOption<SettingsForm3Language>[]
  readonly footer: {
    readonly unsaved: string
    readonly saving: string
    readonly saved: string
    readonly cancel: string
    readonly save: string
  }
}

const initialSaved: SettingsForm3PreviewStoreSeed['saved'] = {
  theme: 'system',
  density: 'cozy',
  language: 'en',
  weeklySummary: true,
  mentions: true,
  commentReplies: false,
  notificationSounds: false,
}

const initialDraft: SettingsForm3PreviewStoreSeed['draft'] = {
  ...initialSaved,
  theme: 'dark',
  commentReplies: true,
}

function englishCopy(): SettingsForm3Copy {
  return {
    pageTitle: 'Preferences',
    panelTitle: 'Workspace preferences',
    panelDescription: 'Defaults for appearance, editing, and notifications.',
    changedLabel: 'Changed',
    recommendedLabel: 'Recommended',
    fields: {
      theme: {
        id: 'theme',
        label: 'Theme',
        deviceLabel: 'This device',
        description: 'Choose how this device renders the interface.',
      },
      density: {
        id: 'density',
        label: 'Density',
        description: 'Set the default spacing for tables and panels.',
        recommended: 'Recommended',
      },
      language: {
        id: 'language',
        label: 'Language',
        description: 'Use this language for shared workspace screens.',
      },
      weeklySummary: {
        id: 'weeklySummary',
        label: 'Weekly summary',
        description: 'A digest of activity every Monday morning.',
      },
      mentions: {
        id: 'mentions',
        label: 'Mentions',
        description: 'Notify me when someone mentions my name.',
      },
      commentReplies: {
        id: 'commentReplies',
        label: 'Comment replies',
        description: 'Replies to threads I have posted in.',
      },
      notificationSounds: {
        id: 'notificationSounds',
        label: 'Play notification sounds',
        description: 'A short chime when something needs your attention.',
      },
    },
    themeOptions: [
      { id: 'system', label: 'System' },
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
    ],
    densityOptions: [
      { id: 'comfortable', label: 'Comfortable' },
      { id: 'cozy', label: 'Cozy' },
      { id: 'compact', label: 'Compact' },
    ],
    languageOptions: [
      { id: 'en', label: 'English' },
      { id: 'de', label: 'German' },
      { id: 'fr', label: 'French' },
      { id: 'ja', label: 'Japanese' },
    ],
    footer: {
      unsaved: 'Unsaved preferences',
      saving: 'Saving',
      saved: 'Preferences saved',
      cancel: 'Cancel',
      save: 'Save changes',
    },
  }
}

function germanCopy(): SettingsForm3Copy {
  return {
    pageTitle: 'Einstellungen',
    panelTitle: 'Arbeitsbereichseinstellungen',
    panelDescription: 'Standardeinstellungen für Darstellung, Bearbeitung und Benachrichtigungen.',
    changedLabel: 'Geändert',
    recommendedLabel: 'Empfohlen',
    fields: {
      theme: {
        id: 'theme',
        label: 'Darstellung',
        deviceLabel: 'Dieses Gerät',
        description: 'Legt fest, wie dieses Gerät die Benutzeroberfläche darstellt.',
      },
      density: {
        id: 'density',
        label: 'Abstandsdichte',
        description: 'Legt die Standardabstände für Tabellen und Bereiche im Arbeitsbereich fest.',
        recommended: 'Empfohlen',
      },
      language: {
        id: 'language',
        label: 'Sprache',
        description: 'Verwende diese Sprache für gemeinsam genutzte Arbeitsbereichsansichten.',
      },
      weeklySummary: {
        id: 'weeklySummary',
        label: 'Wöchentliche Zusammenfassung',
        description: 'Ein Überblick über die Aktivitäten, der jeden Montagmorgen gesendet wird.',
      },
      mentions: {
        id: 'mentions',
        label: 'Erwähnungen',
        description: 'Benachrichtige mich, wenn jemand meinen Namen in einem Beitrag erwähnt.',
      },
      commentReplies: {
        id: 'commentReplies',
        label: 'Antworten auf Kommentare',
        description: 'Antworten auf Diskussionen, an denen ich selbst beteiligt bin.',
      },
      notificationSounds: {
        id: 'notificationSounds',
        label: 'Benachrichtigungstöne abspielen',
        description: 'Ein kurzer Ton signalisiert, wenn eine Benachrichtigung Aufmerksamkeit benötigt.',
      },
    },
    themeOptions: [
      { id: 'system', label: 'System' },
      { id: 'light', label: 'Hell' },
      { id: 'dark', label: 'Dunkel' },
    ],
    densityOptions: [
      { id: 'comfortable', label: 'Komfortabel' },
      { id: 'cozy', label: 'Gemütlich' },
      { id: 'compact', label: 'Kompakt' },
    ],
    languageOptions: [
      { id: 'en', label: 'Englisch' },
      { id: 'de', label: 'Deutsch' },
      { id: 'fr', label: 'Französisch' },
      { id: 'ja', label: 'Japanisch' },
    ],
    footer: {
      unsaved: 'Ungespeicherte Einstellungen',
      saving: 'Wird gespeichert',
      saved: 'Einstellungen gespeichert',
      cancel: 'Abbrechen',
      save: 'Änderungen speichern',
    },
  }
}

type SettingsForm3Projection = Pick<
  SettingsForm3PreviewStoreState,
  'draft' | 'changedPreferenceIds' | 'saveState' | 'status'
>

function projectContent(copy: SettingsForm3Copy, state: SettingsForm3Projection): SettingsForm3PreviewContent {
  const changed = (fieldId: keyof SettingsForm3Projection['draft']) => state.changedPreferenceIds.includes(fieldId)
  const busy = state.saveState === 'saving'
  return {
    pageTitle: copy.pageTitle,
    panelTitle: copy.panelTitle,
    panelDescription: copy.panelDescription,
    changedLabel: copy.changedLabel,
    recommendedLabel: copy.recommendedLabel,
    fields: {
      theme: { ...copy.fields.theme, value: state.draft.theme, changed: changed('theme'), options: copy.themeOptions },
      density: {
        ...copy.fields.density,
        value: state.draft.density,
        changed: changed('density'),
        options: copy.densityOptions,
      },
      language: {
        ...copy.fields.language,
        value: state.draft.language,
        changed: changed('language'),
        options: copy.languageOptions,
      },
      weeklySummary: {
        ...copy.fields.weeklySummary,
        value: state.draft.weeklySummary,
        changed: changed('weeklySummary'),
        recommended: copy.recommendedLabel,
      },
      mentions: { ...copy.fields.mentions, value: state.draft.mentions, changed: changed('mentions') },
      commentReplies: {
        ...copy.fields.commentReplies,
        value: state.draft.commentReplies,
        changed: changed('commentReplies'),
      },
      notificationSounds: {
        ...copy.fields.notificationSounds,
        value: state.draft.notificationSounds,
        changed: false,
      },
    },
    footer: {
      status: state.status === 'saved' ? copy.footer.saved : copy.footer.unsaved,
      cancelLabel: copy.footer.cancel,
      saveLabel: copy.footer.save,
      savingLabel: copy.footer.saving,
      saveButtonLabel: busy ? copy.footer.saving : copy.footer.save,
      cancelDisabled: busy || state.status === 'saved',
      saveDisabled: busy || state.status === 'saved',
    },
  }
}

export interface SettingsForm3PreviewFixture {
  readonly locale: SettingsForm3PreviewLocale
  readonly storeSeed: SettingsForm3PreviewStoreSeed
  readonly content: SettingsForm3PreviewContent
  readonly contentFor: (state: SettingsForm3Projection) => SettingsForm3PreviewContent
}

export function createSettingsForm3PreviewFixture(
  locale: SettingsForm3PreviewLocale = 'en',
): SettingsForm3PreviewFixture {
  const copy = locale === 'de' ? germanCopy() : englishCopy()
  const storeSeed: SettingsForm3PreviewStoreSeed = {
    saved: { ...initialSaved },
    draft: { ...initialDraft },
  }
  const initialState: SettingsForm3Projection = {
    draft: storeSeed.draft,
    changedPreferenceIds: ['theme', 'commentReplies'],
    saveState: 'dirty',
    status: 'unsaved',
  }
  const contentFor = (state: SettingsForm3Projection) => projectContent(copy, state)
  return { locale, storeSeed, content: contentFor(initialState), contentFor }
}
