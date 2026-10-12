import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useLumenFormsContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { Forms2PreviewHost } from '../apps/hbar-app-ui-preview/src/Forms2PreviewHost'
import { FormsForm1PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm1PreviewHost'
import { FormsForm10PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm10PreviewHost'
import { FormsForm11PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm11PreviewHost'
import { FormsForm12PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm12PreviewHost'
import { FormsForm3PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm3PreviewHost'
import { FormsForm4PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm4PreviewHost'
import { FormsForm5PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm5PreviewHost'
import { FormsForm6PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm6PreviewHost'
import { FormsForm7PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm7PreviewHost'
import { FormsForm8PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm8PreviewHost'
import { FormsForm9PreviewHost } from '../apps/hbar-app-ui-preview/src/FormsForm9PreviewHost'
import { createForms10PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms10PreviewFixtures'
import { createForms11PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms11PreviewFixtures'
import { createForms12PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms12PreviewFixtures'
import { createForms2PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms2PreviewFixtures'
import { createForms4PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms4PreviewFixtures'
import { createForms5PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms5PreviewFixtures'
import { createForms6PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms6PreviewFixtures'
import { createForms7PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms7PreviewFixtures'
import { createForms8PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms8PreviewFixtures'
import { createForms9PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms9PreviewFixtures'
import { createFormsForm1PreviewFixture } from '../apps/hbar-app-ui-preview/src/formsForm1PreviewFixtures'
import { createForms3PreviewFixture } from '../apps/hbar-app-ui-preview/src/formsForm3PreviewFixtures'
import { HBAR_APP_UI_FORMS_FIXTURES as input } from './fixtures/hbar-app-ui-forms-fixtures'

function ContentKeys() {
  return createElement('span', null, Object.keys(useLumenFormsContent() ?? {}).join(','))
}

function trapFixture<T extends object>(fixture: T, label: string): T {
  return new Proxy(fixture, {
    get(_target, property) {
      throw new Error(`${label} fixture was read through ${String(property)}`)
    },
  })
}

describe('active Forms preview owners', () => {
  test('only the active rich contract is added to the host content', () => {
    const keys = [
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,surveyDeploymentReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,sessionSubmissionReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,freightBookingReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,equipmentRecordReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,workspaceProvisionReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,checkoutReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,communityArtsApplicationReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,inboundPalletRoutingReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,weeklyOpeningHoursReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,guestSurveyReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,environmentDialogReference',
      'record,submission,booking,properties,provision,checkout,application,rule,hours,survey,environment,quote,quoteReviewReference',
    ]
    const html = [
      renderToStaticMarkup(
        createElement(FormsForm1PreviewHost, {
          spec: getHbarAppUiVariant('forms', 1).spec,
          content: input,
          referenceFixture: createFormsForm1PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Forms2PreviewHost, {
          spec: getHbarAppUiVariant('forms', 2).spec,
          content: input,
          referenceFixture: createForms2PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm3PreviewHost, {
          spec: getHbarAppUiVariant('forms', 3).spec,
          content: input,
          referenceFixture: createForms3PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm4PreviewHost, {
          spec: getHbarAppUiVariant('forms', 4).spec,
          content: input,
          referenceFixture: createForms4PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm5PreviewHost, {
          spec: getHbarAppUiVariant('forms', 5).spec,
          content: input,
          referenceFixture: createForms5PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm6PreviewHost, {
          spec: getHbarAppUiVariant('forms', 6).spec,
          content: input,
          referenceFixture: createForms6PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm7PreviewHost, {
          spec: getHbarAppUiVariant('forms', 7).spec,
          content: input,
          referenceFixture: createForms7PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm8PreviewHost, {
          spec: getHbarAppUiVariant('forms', 8).spec,
          content: input,
          referenceFixture: createForms8PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm9PreviewHost, {
          spec: getHbarAppUiVariant('forms', 9).spec,
          content: input,
          referenceFixture: createForms9PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm10PreviewHost, {
          spec: getHbarAppUiVariant('forms', 10).spec,
          content: input,
          referenceFixture: createForms10PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm11PreviewHost, {
          spec: getHbarAppUiVariant('forms', 11).spec,
          content: input,
          referenceFixture: createForms11PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm12PreviewHost, {
          spec: getHbarAppUiVariant('forms', 12).spec,
          content: input,
          referenceFixture: createForms12PreviewFixture(),
          children: createElement(ContentKeys),
        }),
      ),
    ]
    expect(html).toEqual(keys.map((value) => `<span>${value}</span>`))
  })

  test('bypasses the owner for an unrelated category without initializing a provider', () => {
    const html = renderToStaticMarkup(
      createElement(FormsForm1PreviewHost, {
        spec: getHbarAppUiVariant('editor', 1).spec,
        content: input,
        referenceFixture: createFormsForm1PreviewFixture(),
        children: createElement(ContentKeys),
      }),
    )
    expect(html).toBe('<span></span>')
  })

  test('does not read an inactive owner fixture', () => {
    const html = [
      renderToStaticMarkup(
        createElement(FormsForm1PreviewHost, {
          spec: getHbarAppUiVariant('forms', 2).spec,
          content: input,
          referenceFixture: trapFixture(createFormsForm1PreviewFixture(), 'forms-1'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(Forms2PreviewHost, {
          spec: getHbarAppUiVariant('forms', 3).spec,
          content: input,
          referenceFixture: trapFixture(createForms2PreviewFixture(), 'forms-2'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm3PreviewHost, {
          spec: getHbarAppUiVariant('forms', 4).spec,
          content: input,
          referenceFixture: trapFixture(createForms3PreviewFixture(), 'forms-3'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm4PreviewHost, {
          spec: getHbarAppUiVariant('forms', 5).spec,
          content: input,
          referenceFixture: trapFixture(createForms4PreviewFixture(), 'forms-4'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm5PreviewHost, {
          spec: getHbarAppUiVariant('forms', 6).spec,
          content: input,
          referenceFixture: trapFixture(createForms5PreviewFixture(), 'forms-5'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm6PreviewHost, {
          spec: getHbarAppUiVariant('forms', 7).spec,
          content: input,
          referenceFixture: trapFixture(createForms6PreviewFixture(), 'forms-6'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm7PreviewHost, {
          spec: getHbarAppUiVariant('forms', 8).spec,
          content: input,
          referenceFixture: trapFixture(createForms7PreviewFixture(), 'forms-7'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm8PreviewHost, {
          spec: getHbarAppUiVariant('forms', 9).spec,
          content: input,
          referenceFixture: trapFixture(createForms8PreviewFixture(), 'forms-8'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm9PreviewHost, {
          spec: getHbarAppUiVariant('forms', 10).spec,
          content: input,
          referenceFixture: trapFixture(createForms9PreviewFixture(), 'forms-9'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm10PreviewHost, {
          spec: getHbarAppUiVariant('forms', 11).spec,
          content: input,
          referenceFixture: trapFixture(createForms10PreviewFixture(), 'forms-10'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm11PreviewHost, {
          spec: getHbarAppUiVariant('forms', 12).spec,
          content: input,
          referenceFixture: trapFixture(createForms11PreviewFixture(), 'forms-11'),
          children: createElement(ContentKeys),
        }),
      ),
      renderToStaticMarkup(
        createElement(FormsForm12PreviewHost, {
          spec: getHbarAppUiVariant('forms', 1).spec,
          content: input,
          referenceFixture: trapFixture(createForms12PreviewFixture(), 'forms-12'),
          children: createElement(ContentKeys),
        }),
      ),
    ]
    expect(html).toEqual(Array.from({ length: 12 }, () => '<span></span>'))
  })
})
