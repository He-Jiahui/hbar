import { SettingsPreviewHost } from './SettingsPreviewHost'
import { SettingsForm2PreviewHost } from './SettingsForm2PreviewHost'
import { SettingsForm3PreviewHost } from './SettingsForm3PreviewHost'
import { SettingsForm4PreviewHost } from './SettingsForm4PreviewHost'
import { SettingsForm5PreviewHost } from './SettingsForm5PreviewHost'
import { SettingsForm6PreviewHost } from './SettingsForm6PreviewHost'
import type { PreviewHostProps } from './preview-scene-contract'
export function PreviewSettingsScene({ selected, onAction, fixtures, children }: PreviewHostProps) {
  const {
    settingsFormContent,
    settingsForm1ReferenceFixture,
    settingsForm2ReferenceFixture,
    settingsForm3ReferenceFixture,
    settingsForm4ReferenceFixture,
    settingsForm5ReferenceFixture,
    settingsForm6ReferenceFixture,
  } = fixtures
  return (
    <SettingsPreviewHost
      content={settingsFormContent}
      spec={selected.spec}
      onAction={onAction}
      referenceFixture={settingsForm1ReferenceFixture}
    >
      <SettingsForm2PreviewHost
        content={settingsFormContent}
        spec={selected.spec}
        onAction={onAction}
        referenceFixture={settingsForm2ReferenceFixture}
      >
        <SettingsForm3PreviewHost
          content={settingsFormContent}
          spec={selected.spec}
          onAction={onAction}
          referenceFixture={settingsForm3ReferenceFixture}
        >
          <SettingsForm4PreviewHost
            content={settingsFormContent}
            spec={selected.spec}
            onAction={onAction}
            referenceFixture={settingsForm4ReferenceFixture}
          >
            <SettingsForm5PreviewHost
              content={settingsFormContent}
              spec={selected.spec}
              onAction={onAction}
              referenceFixture={settingsForm5ReferenceFixture}
            >
              <SettingsForm6PreviewHost
                content={settingsFormContent}
                spec={selected.spec}
                onAction={onAction}
                referenceFixture={settingsForm6ReferenceFixture}
              >
                {children}
              </SettingsForm6PreviewHost>
            </SettingsForm5PreviewHost>
          </SettingsForm4PreviewHost>
        </SettingsForm3PreviewHost>
      </SettingsForm2PreviewHost>
    </SettingsPreviewHost>
  )
}
