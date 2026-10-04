import { HBAR_APP_UI_SETTINGS_FORM_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-settings-form-fixtures'
import type {
  SettingsForm2PreviewStoreSeed,
  SettingsForm2PreviewStoreState,
  SettingsForm2PreviewValidation,
  SettingsForm2PreviewValues,
  SettingsForm2PreviewUsernameStatus,
} from './settingsForm2PreviewStore'

export type SettingsForm2PreviewLocale = 'en' | 'de'
export type SettingsForm2PreviewPhotoMimeType = 'image/png' | 'image/jpeg' | 'image/gif'

export interface SettingsForm2PreviewField {
  readonly label: string
  readonly description: string
  readonly value: string
  readonly changed?: boolean | undefined
  readonly error?: string | undefined
  readonly note?: string | undefined
}

export interface SettingsForm2PreviewUsernameField extends SettingsForm2PreviewField {
  readonly prefix: string
}

export interface SettingsForm2PreviewBioField extends SettingsForm2PreviewField {
  readonly maximumCharacters: number
}

export interface SettingsForm2PreviewContent {
  readonly pageTitle: string
  readonly accountTitle: string
  readonly accountDescription: string
  readonly photoLabel: string
  readonly photoDescription: string
  readonly uploadPhotoAccessibleName: string
  readonly changePhotoLabel: string
  readonly photoInitials: string
  readonly photoMimeTypes: readonly SettingsForm2PreviewPhotoMimeType[]
  readonly changedLabel: string
  readonly countCharacters: (current: number, maximum: number) => string
  readonly unsavedMessage: string
  readonly cancelLabel: string
  readonly saveLabel: string
  readonly fields: {
    readonly fullName: SettingsForm2PreviewField
    readonly title: SettingsForm2PreviewField
    readonly username: SettingsForm2PreviewUsernameField
    readonly email: SettingsForm2PreviewField
    readonly bio: SettingsForm2PreviewBioField
  }
  readonly saveDisabled: boolean
}

type SettingsForm2ProjectionState = Pick<
  SettingsForm2PreviewStoreState,
  'values' | 'maximumBioCharacters' | 'validation' | 'saveDisabled'
>

interface SettingsForm2FieldCopy {
  readonly label: string
  readonly description: string
  readonly note?: string | undefined
  readonly changed?: boolean | undefined
}

interface SettingsForm2PreviewCopy {
  readonly pageTitle: string
  readonly accountTitle: string
  readonly accountDescription: string
  readonly photoLabel: string
  readonly photoDescription: string
  readonly uploadPhotoAccessibleName: string
  readonly changePhotoLabel: string
  readonly changedLabel: string
  readonly unsavedMessage: string
  readonly cancelLabel: string
  readonly saveLabel: string
  readonly usernameRequiredError: string
  readonly usernameTakenError: string
  readonly bioLimitError: (charactersOverLimit: number) => string
  readonly countCharacters: (current: number, maximum: number) => string
  readonly fields: {
    readonly fullName: SettingsForm2FieldCopy
    readonly title: SettingsForm2FieldCopy
    readonly username: SettingsForm2FieldCopy & { readonly prefix: string }
    readonly email: SettingsForm2FieldCopy
    readonly bio: SettingsForm2FieldCopy
  }
}

function requireProfile() {
  const profile = HBAR_APP_UI_SETTINGS_FORM_FIXTURES.profile
  if (!profile) throw new Error('Expected the Settings Form 2 source profile fixture.')
  return profile
}

function requiredSourceTextField(id: 'full-name' | 'title' | 'username' | 'email') {
  const field = requireProfile().fields.find((item) => item.id === id)
  if (!field || field.kind !== 'text') {
    throw new Error(`Expected a source text field for ${id}.`)
  }
  return field
}

function requiredSourceBioField() {
  const field = requireProfile().fields.find((item) => item.id === 'bio')
  if (!field || field.kind !== 'textarea' || field.maxLength === undefined) {
    throw new Error('Expected the source Bio textarea and character limit.')
  }
  return { ...field, maxLength: field.maxLength }
}

function initialValues(): SettingsForm2PreviewValues {
  return {
    fullName: requiredSourceTextField('full-name').value,
    title: requiredSourceTextField('title').value,
    username: requiredSourceTextField('username').value,
    email: requiredSourceTextField('email').value,
    bio: requiredSourceBioField().value,
  }
}

function previewUsernameStatus(value: string): SettingsForm2PreviewUsernameStatus {
  // Local-only preview rule: the captured handle is reserved; this is not a server availability check.
  if (value.trim().length === 0) return 'required'
  return value === requiredSourceTextField('username').value ? 'taken' : 'available'
}

function englishCopy(): SettingsForm2PreviewCopy {
  const profile = requireProfile()
  const fullName = requiredSourceTextField('full-name')
  const title = requiredSourceTextField('title')
  const username = requiredSourceTextField('username')
  const email = requiredSourceTextField('email')
  const bio = requiredSourceBioField()
  if (username.prefix === undefined) throw new Error('Expected the source username prefix.')

  return {
    pageTitle: profile.labels.pageTitle,
    accountTitle: profile.labels.panelTitle,
    accountDescription: profile.labels.panelDescription,
    photoLabel: profile.labels.photoLabel,
    photoDescription: profile.labels.photoDescription,
    uploadPhotoAccessibleName: profile.labels.uploadPhoto,
    changePhotoLabel: profile.labels.changePhoto,
    changedLabel: profile.labels.changed,
    unsavedMessage: profile.labels.unsaved,
    cancelLabel: profile.labels.cancel,
    saveLabel: profile.labels.save,
    usernameRequiredError: 'Enter a username.',
    usernameTakenError: username.error ?? 'This username is unavailable.',
    bioLimitError: (excess) => `Remove ${excess} characters to fit the limit.`,
    countCharacters: (current, maximum) => `${current} of ${maximum} characters`,
    fields: {
      fullName: { label: fullName.label, description: fullName.description },
      title: { label: title.label, description: title.description },
      username: {
        label: username.label,
        description: username.description,
        prefix: username.prefix,
        changed: username.changed,
      },
      email: { label: email.label, description: email.description, note: email.note },
      bio: { label: bio.label, description: bio.description },
    },
  }
}

function germanCopy(): SettingsForm2PreviewCopy {
  const username = requiredSourceTextField('username')

  return {
    pageTitle: 'Öffentliches Profil',
    accountTitle: 'Konto',
    accountDescription: 'Das Profil, das andere sehen, wenn du zusammenarbeitest.',
    photoLabel: 'Profilfoto',
    photoDescription: 'JPG, PNG oder GIF bis zu 2 MB.',
    uploadPhotoAccessibleName: 'Profilfoto hochladen',
    changePhotoLabel: 'Ändern',
    changedLabel: 'Geändert',
    unsavedMessage: 'Ungespeicherte Profiländerungen',
    cancelLabel: 'Abbrechen',
    saveLabel: 'Profil speichern',
    usernameRequiredError: 'Gib einen Benutzernamen ein.',
    usernameTakenError: 'mara ist vergeben. Probiere einen anderen Namen.',
    bioLimitError: (excess) => `Kürze die Biografie um ${excess} Zeichen, um das Limit einzuhalten.`,
    countCharacters: (current, maximum) => `${current} von ${maximum} Zeichen`,
    fields: {
      fullName: {
        label: 'Vollständiger Name',
        description: 'Wird bei Kommentaren, Bearbeitungen und geteilten Dokumenten angezeigt.',
      },
      title: {
        label: 'Titel',
        description: 'Eine kurze Rolle, die unter deinem Namen erscheint.',
      },
      username: {
        label: 'Benutzername',
        description: 'Dies ist die Adresse deines öffentlichen Profils.',
        prefix: username.prefix ?? 'northwind.co/',
        changed: username.changed,
      },
      email: {
        label: 'E-Mail',
        description: 'Wird für die Anmeldung und Kontohinweise verwendet.',
        note: 'Wird niemals öffentlich angezeigt.',
      },
      bio: {
        label: 'Kurzinfo',
        description: 'Eine kurze Zeile unter deinem Namen.',
      },
    },
  }
}

function createContent(
  copy: SettingsForm2PreviewCopy,
  values: SettingsForm2PreviewValues,
  validation: SettingsForm2PreviewValidation,
  maximumBioCharacters: number,
  saveDisabled: boolean,
): SettingsForm2PreviewContent {
  const original = initialValues()
  const usernameError =
    validation.username === 'taken'
      ? copy.usernameTakenError
      : validation.username === 'required'
        ? copy.usernameRequiredError
        : undefined
  const bioError =
    validation.bioCharactersOverLimit > 0 ? copy.bioLimitError(validation.bioCharactersOverLimit) : undefined

  return {
    pageTitle: copy.pageTitle,
    accountTitle: copy.accountTitle,
    accountDescription: copy.accountDescription,
    photoLabel: copy.photoLabel,
    photoDescription: copy.photoDescription,
    uploadPhotoAccessibleName: copy.uploadPhotoAccessibleName,
    changePhotoLabel: copy.changePhotoLabel,
    photoInitials: requireProfile().initials,
    photoMimeTypes: ['image/png', 'image/jpeg', 'image/gif'],
    changedLabel: copy.changedLabel,
    countCharacters: copy.countCharacters,
    unsavedMessage: copy.unsavedMessage,
    cancelLabel: copy.cancelLabel,
    saveLabel: copy.saveLabel,
    fields: {
      fullName: {
        ...copy.fields.fullName,
        value: values.fullName,
        ...(values.fullName === original.fullName ? {} : { changed: true }),
      },
      title: {
        ...copy.fields.title,
        value: values.title,
        ...(values.title === original.title ? {} : { changed: true }),
      },
      username: {
        ...copy.fields.username,
        value: values.username,
        ...(!copy.fields.username.changed && values.username !== original.username ? { changed: true } : {}),
        ...(usernameError === undefined ? {} : { error: usernameError }),
      },
      email: {
        ...copy.fields.email,
        value: values.email,
        ...(values.email === original.email ? {} : { changed: true }),
      },
      bio: {
        ...copy.fields.bio,
        value: values.bio,
        maximumCharacters: maximumBioCharacters,
        ...(values.bio === original.bio ? {} : { changed: true }),
        ...(bioError === undefined ? {} : { error: bioError }),
      },
    },
    saveDisabled,
  }
}

export interface SettingsForm2PreviewFixture {
  readonly locale: SettingsForm2PreviewLocale
  readonly storeSeed: SettingsForm2PreviewStoreSeed
  readonly content: SettingsForm2PreviewContent
  readonly contentFor: (state: SettingsForm2ProjectionState) => SettingsForm2PreviewContent
}

export function createSettingsForm2PreviewFixture(
  locale: SettingsForm2PreviewLocale = 'en',
): SettingsForm2PreviewFixture {
  const values = initialValues()
  const maximumBioCharacters = requiredSourceBioField().maxLength
  const copy = locale === 'de' ? germanCopy() : englishCopy()
  const validateUsername = previewUsernameStatus
  const validation = {
    username: validateUsername(values.username),
    bioCharactersOverLimit: 0,
  } satisfies SettingsForm2PreviewValidation
  const storeSeed: SettingsForm2PreviewStoreSeed = {
    initialValues: values,
    maximumBioCharacters,
    validateUsername,
  }
  const contentFor = (state: SettingsForm2ProjectionState) =>
    createContent(copy, state.values, state.validation, state.maximumBioCharacters, state.saveDisabled)
  const content = createContent(copy, values, validation, maximumBioCharacters, validation.username !== 'available')

  return { locale, storeSeed, content, contentFor }
}
