import { FormsForm1PreviewHost } from './FormsForm1PreviewHost'
import { Forms2PreviewHost } from './Forms2PreviewHost'
import { FormsForm3PreviewHost } from './FormsForm3PreviewHost'
import { FormsForm4PreviewHost } from './FormsForm4PreviewHost'
import { FormsForm5PreviewHost } from './FormsForm5PreviewHost'
import { FormsForm6PreviewHost } from './FormsForm6PreviewHost'
import { FormsForm7PreviewHost } from './FormsForm7PreviewHost'
import { FormsForm8PreviewHost } from './FormsForm8PreviewHost'
import { FormsForm9PreviewHost } from './FormsForm9PreviewHost'
import { FormsForm10PreviewHost } from './FormsForm10PreviewHost'
import { FormsForm11PreviewHost } from './FormsForm11PreviewHost'
import { FormsForm12PreviewHost } from './FormsForm12PreviewHost'
import type { PreviewHostProps } from './preview-scene-contract'
export function PreviewFormsScene({ selected, onAction, fixtures, children }: PreviewHostProps) {
  const {
    formsContent,
    formsForm1ReferenceFixture,
    forms2ReferenceFixture,
    forms3ReferenceFixture,
    forms4ReferenceFixture,
    forms5ReferenceFixture,
    forms6ReferenceFixture,
    forms7ReferenceFixture,
    forms8ReferenceFixture,
    forms9ReferenceFixture,
    forms10ReferenceFixture,
    forms11ReferenceFixture,
    forms12ReferenceFixture,
  } = fixtures
  return (
    <FormsForm1PreviewHost
      content={formsContent}
      spec={selected.spec}
      onAction={onAction}
      referenceFixture={formsForm1ReferenceFixture}
    >
      <Forms2PreviewHost
        content={formsContent}
        spec={selected.spec}
        onAction={onAction}
        referenceFixture={forms2ReferenceFixture}
      >
        <FormsForm3PreviewHost
          content={formsContent}
          spec={selected.spec}
          onAction={onAction}
          referenceFixture={forms3ReferenceFixture}
        >
          <FormsForm4PreviewHost
            content={formsContent}
            spec={selected.spec}
            onAction={onAction}
            referenceFixture={forms4ReferenceFixture}
          >
            <FormsForm5PreviewHost
              content={formsContent}
              spec={selected.spec}
              onAction={onAction}
              referenceFixture={forms5ReferenceFixture}
            >
              <FormsForm6PreviewHost
                content={formsContent}
                spec={selected.spec}
                onAction={onAction}
                referenceFixture={forms6ReferenceFixture}
              >
                <FormsForm7PreviewHost
                  content={formsContent}
                  spec={selected.spec}
                  onAction={onAction}
                  referenceFixture={forms7ReferenceFixture}
                >
                  <FormsForm8PreviewHost
                    content={formsContent}
                    spec={selected.spec}
                    onAction={onAction}
                    referenceFixture={forms8ReferenceFixture}
                  >
                    <FormsForm9PreviewHost
                      content={formsContent}
                      spec={selected.spec}
                      onAction={onAction}
                      referenceFixture={forms9ReferenceFixture}
                    >
                      <FormsForm10PreviewHost
                        content={formsContent}
                        spec={selected.spec}
                        onAction={onAction}
                        referenceFixture={forms10ReferenceFixture}
                      >
                        <FormsForm11PreviewHost
                          content={formsContent}
                          spec={selected.spec}
                          onAction={onAction}
                          referenceFixture={forms11ReferenceFixture}
                        >
                          <FormsForm12PreviewHost
                            content={formsContent}
                            spec={selected.spec}
                            onAction={onAction}
                            referenceFixture={forms12ReferenceFixture}
                          >
                            {children}
                          </FormsForm12PreviewHost>
                        </FormsForm11PreviewHost>
                      </FormsForm10PreviewHost>
                    </FormsForm9PreviewHost>
                  </FormsForm8PreviewHost>
                </FormsForm7PreviewHost>
              </FormsForm6PreviewHost>
            </FormsForm5PreviewHost>
          </FormsForm4PreviewHost>
        </FormsForm3PreviewHost>
      </Forms2PreviewHost>
    </FormsForm1PreviewHost>
  )
}
