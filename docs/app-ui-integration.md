# app-ui integration

## Current Web reset

On 2026-09-16 the old Web pages, stores, action models, plugin UI loader, layout
adapters and overriding styles were removed at the user's request. `apps/web`
now mounts only the structural components from `hbar-app-ui/workbench`, with
host-supplied copy and a validated shell descriptor. It does not connect to the
Host or expose business controls. Host/CLI functionality and the component
preview remain available. See [the Web host boundary](../apps/web/README.md).

Component tests remain active; their localized fixture data no longer imports
the retired Web adapters. Old Web-specific tests were removed with the retired
implementations. The current browser suite verifies the disconnected shell in
both locales and desktop/narrow viewports. The historical integration increments
below describe the previous implementation, not currently available Web features.

The production entry is `hbar-app-ui`. Gallery hosts explicitly import
`hbar-app-ui/catalog`; the 300 existing variant IDs remain stable. Production
dependencies are checked by `tests/hbar-app-ui-entrypoints.test.ts`.

Registration is not visual acceptance. A variant is only considered fully
accepted after the live React Bits Pro audit in [app-ui-visual-audit.md](app-ui-visual-audit.md)
has source/local records for every configured viewport and theme, every discovered
interaction, no structural hard-gate failure, no page/console error, and a passed
entry in the generated `review-ledger.json`. The audit commands are
`bun run app-ui:reactbits:discover`, `bun run app-ui:reactbits:audit`, and the
development filters documented in that guide.

### Forms 8 audit status

`hbar-app-ui-forms-8` was captured from the live [Forms 8 rule builder](https://pro.reactbits.dev/docs/app-ui/forms/forms-8)
for eight viewport/theme pairs in `artifacts/reactbits-pro-visual-audit/forms-8-final-v4/`.
Static semantic structure passes all eight pairs. Two of the three mechanism samples
(Match any and the condition-field menu) match; the Add-condition sample remains
strict `needs-fix`: the source icon-only Remove buttons contain visually hidden
`Remove condition` text nodes, while the local buttons use equivalent `aria-label`
attributes without those text nodes. This leaves visible copy, AX names, the new
blank condition, disabled Test/Save buttons and validation text aligned, but the
captured `textContent` delta differs by 16 characters (source +66, local +50).
The difference is not treated as a visual or remote-action success. The 320px
preview verifier separately confirms a reachable footer, no horizontal overflow,
German host copy and zero page errors. The source Route-to-zone target menu was
observed, but target selection remains callback-only and is explicitly restricted;
Save/Test outcomes were not triggered or invented.

### Forms 9 integration status

`hbar-app-ui-forms-9` is routed to a host-owned `weeklyOpeningHoursReference` ViewModel.
The Lumen view renders the ordered seven-day schedule; the preview Zustand store owns
the editable draft and derives per-day and weekly minutes. Copy Monday updates weekday
time values without changing day/interval IDs, closing a day retains its intervals,
and the holiday checkbox stays independent of the weekly total. Add/Remove/Save are
typed callback requests with no invented remote result; Reset is a local preview
baseline restore. Time-zone and time menus expose partial host-supplied options only.
The seven-day collection is a bounded, pane-owned scroll region with the header,
holiday option and footer outside that region.

The authorized source inventory resolves to [Forms 9 opening hours](https://pro.reactbits.dev/docs/app-ui/forms/forms-9),
source hash `5dfcd697…73586752`. A live capture attempt on 2026-09-29 wrote only
three source/local view pairs before navigation to the public URL timed out; no full
capture manifest or same-hash source interaction ledger was produced. The complete
static cache at `full-static-v9` uses an older audit protocol and cannot be imported
into the current strict pipeline. `forms-9-local-review-r4/` contains eight local
light/dark and desktop/tablet/mobile/320px screenshots plus measured scroll/overflow
metrics. The local panel geometry matches the authorized cache dimensions (760×659,
590×659, 292×742 and 286×800), and the focused browser verifier passes Copy Monday,
Monday closed (49 h → 40 h), holiday toggling and 320px footer reachability. These
local results do not constitute fresh live source pairs; Forms 9 remains pending
strict source acceptance.

### Forms 10 integration status

`hbar-app-ui-forms-10` uses a host-owned guest-survey draft and a dedicated Lumen
reference view. Typed localized copy, a partial property catalog, eleven NPS scores,
four five-point matrix criteria, six highlights and derived question progress come
from the host. An optional reservation reference does not count toward completion.
The low-score follow-up and 300-character counter are explicitly based on an older,
different-hash source interaction cache; their local draft behavior is not presented
as a current-source match. Submit only emits a typed host request and never displays
an unconfirmed remote result.

The authorized [Forms 10 guest survey](https://pro.reactbits.dev/docs/app-ui/forms/forms-10)
static cache (`full-static-v10`, hash `5336fea7…c49ed45ef3`) covers eight viewport/theme
screenshots. Its same-hash `full-interactions-v4` cache has no useful state-change
sample; the v3 property menu, low-score branch and rating changes have a different
source hash. No fresh source interaction ledger or strict sign-off is claimed.
`forms-10-local-review-r1/` contains eight final local screenshots and panel/document/
matrix-scroll metrics. A scoped anchored property overlay uses the older-cache
geometry evidence; the rest of the survey stays in flow. On narrow screens the
matrix has an accessible local horizontal scroll owner because the source owner
was not captured, and the footer remains reachable through document scrolling.
The independent browser verifier samples one low-score, one matrix cell and one
highlight, plus 320px reachability and localized copy, without submitting.

### Forms 11 integration status

`hbar-app-ui-forms-11` now renders a host-owned new-environment dialog. The preview
store owns the kind, name, Region, variable source, auto-deploy and description
draft; the Lumen component receives typed localized copy and option catalogs.
The cached name sample projects `audit sample` to `audit-sample.yourapp.dev` and
enables Create; the four Region options, switch transition and `12 / 160`
description count are sampled as distinct mechanisms. Kind descriptions beyond
Preview and variable-source choices beyond the default remain unobserved/partial.
Create, Cancel and Close only emit typed host requests, with no invented remote
result or slug-availability response.

The authorized [Forms 11 new-environment dialog](https://pro.reactbits.dev/docs/app-ui/forms/forms-11)
has matching source hashes in `full-static-v10` and `full-interactions-v4`
(`8293f152…1db0e34a0023d2`), but both are 2026-09-23
legacy unversioned captures. The official URL was inaccessible this round, so
there is no fresh strict source/local ledger. Eight final local-only screenshots
and scroll metrics are in `forms11-local-only-r2/`; the 560×574 desktop/tablet
dialog has a bounded scrolling body and reachable footer. At 320px, the local
dialog uses the available viewport width rather than mimicking the source site's
222px iframe crop; Description and footer remain reachable with no horizontal
overflow. The independent browser verifier samples each change mechanism once,
plus German copy and narrow reachability, without clicking Create.

### Forms 12 integration status

`hbar-app-ui-forms-12` is a host-owned, four-step quote review. The Lumen view
renders the four typed summary sections and a GBP Premium snapshot with two
consents. Business details is the only editor shape observed in the authorized
interaction cache: entering it exposes name, industry and employee controls,
Cancel/Save section, hides its own Edit and disables the other three Edit
buttons. Draft changes do not silently mutate the review summary or recalculate
Premium. Cancel, Save and Request bound quote only produce typed host requests;
the Request button remains disabled because its post-consent enabled state and
remote result were not observed.

The authorized [Forms 12 quote review](https://pro.reactbits.dev/docs/app-ui/forms/forms-12)
static cache and legacy `full-interactions-v4` share hash
`4434587bef024bb8048a3da8db49fbdf684e151e82fc4b1f4985a62a3ab1d863`
only as a source-version reference. The official page was inaccessible this round,
and the legacy interaction report has no current capture protocol. It shows
Business Edit via keyboard, but a pointer click capture failed; the first consent
appears checked in source-after while the old comparator recorded no source
change. No fresh strict ledger or matched consent delta is claimed.
`forms-12-local-review-r3/` contains eight final local screenshots and layout
metrics. The 1022px desktop two-column review is 775px tall; on narrow screens
the sections, Premium, consents and Request flow vertically. At 320px a real
mouse wheel scroll reaches Request (`documentScrollTop=698`) with no horizontal
overflow. The independent browser verifier samples Business Edit and one consent,
then checks localization and narrow reachability without Save or Request.

### Onboarding 1 integration status

`hbar-app-ui-onboarding-1` uses a dedicated profile form and a host-owned Zustand
draft rather than the generic onboarding fixture. The host supplies all labels,
the four native timezone options, initial Sam Rivera/Product Engineer/Berlin and
updates opt-in, plus a directory-preview projection. Desktop presents form and
preview in two flow columns; tablet and narrower widths hide the preview and
keep the form in normal flow. Upload photo and Continue emit typed requests only:
the source cache does not show upload, validation or a later navigation result.
The preview's post-edit projection is a local inference, not a matched source
desktop after-state.

The authorized [Onboarding 1 profile](https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-1)
`full-static-v10` and `full-interactions-v4` caches share source hash
`2d34fb8f19ec4c1e4934800f987b1f426aea8446c744372cc4b4a1ef1b665a4a`,
but the old schema has no current capture protocol. The official page was
unavailable this round; no fresh strict visual or interaction sign-off is claimed.
The useful dark/mobile samples show a name fill, selecting the timezone
placeholder and opting out of updates; the preview is hidden there. The local
browser verifier samples those distinct mechanisms, default desktop content and
localized copy. At 286×640 Continue is visible without horizontal overflow; a
real mouse wheel at 320×420 scrolls the document 176px to reveal Continue.
The eight final local light/dark viewport images, edited-name desktop sample and
short-height reachability capture are in `artifacts/onboarding1-local-review/`.
They support a local geometry review, not a fresh source/local pair.

### Onboarding 2 integration status

`hbar-app-ui-onboarding-2` uses a dedicated six-step vertical rail and a
host-owned Profile/Role draft. The initial Profile has Sam Rivera and Product
Lead; Continue advances to Role, where Product is selected among four radios.
At narrow widths the rail is hidden and a `Step N of 6` counter replaces it.
The source cache only usefully shows this transition. Back, changing a role,
rail jumps and the Source/Workspace/Goals/Invite bodies remain typed request
boundaries; the preview does not invent those four forms or navigation results.

The authorized [Onboarding 2 stepper](https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-2)
`full-static-v10` and `full-interactions-v4` entries share source hash
`e37748d4786df18d23b5ce09479762a71c405d2c007d43bf583b75f984e24747`,
but use an old schema without the current capture protocol. The documentation
text was visible, not the interactive iframe, so no fresh strict replay is
claimed. The local browser verifier samples a Profile draft and Continue→Role
on desktop/narrow screens, localized copy and natural short-height reachability.
At 320×420 a real mouse wheel moves the document 49px to make the Role Continue
button visible at y347–387; no horizontal overflow or page errors were found.
The final local desktop/mobile light/dark views, Role state and short-height
capture are in `artifacts/onboarding2-local-review/`; they are not same-round
source/local pairs.

### Onboarding 3 integration status

`hbar-app-ui-onboarding-3` uses a host-owned six-task checklist, initially
2 of 6 complete. Each row has a checkbox, title/detail and a separate task
action link; the host supplies all copy and stable IDs. The one reliable
same-target-hash before/after sample clicks the completed Profile checkbox:
it becomes unchecked and progress falls to 1 of 6. Other completion changes
and link outcomes remain typed requests, without invented navigation or
progress persistence. The narrow local flow keeps content readable rather
than reproducing source text truncation.

The authorized [Onboarding 3 checklist](https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-3)
`full-static-v10` and `full-interactions-v4` entries share source hash
`396e5c679645f9d54792a317e5899cb5b94205d54f9836d25f9f4313b2b3f0ba`,
but the interaction cache lacks the current capture protocol, so this is not
fresh strict acceptance. Its old comparator labels the Profile click a
`source-no-op` because its delta signature omits checkbox checked and AX
progress text. The raw before/after AX and image show the actual 2/6→1/6
transition, now covered by the host store and browser verifier. At 320×420 a
real wheel scroll reaches the local footer (`documentScrollTop=495`) without
horizontal overflow; source scroll ownership was not captured.

## Migration inventory

This table is a work inventory, not a declaration that the migration is done.
Each family retains its independent surfaces and receives host-owned content,
localized labels, explicit actions, and a documented collection strategy.

The [per-variant inventory](app-ui-variant-inventory.md) lists all 300 stable IDs,
their current contract status and remaining gaps. Regenerate it with
`bun scripts/inventory-hbar-app-ui.ts`; update the explicit controlled-surface
registry only after implementation and relevant verification.

| Delivery group            | Component families                                                                                   | Production owner                                | Collection strategy                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Navigation                | app-shell, app-sidebar, navbar, command-menu, mobile                                                 | Workbench ViewModel and module descriptors      | Bounded navigation; virtualized session collections        |
| Conversation              | ai-chat, prompt-input, chat                                                                          | Session projection and composer ViewModel       | Paged, virtualized history; bounded attachment controls    |
| Execution                 | agent-activity, tool-calls, agent-approval, agent-plan, ai-usage                                     | Session and capability ViewModels               | Virtualized history; pane-owned plan, capped by protocol   |
| Files                     | file-manager, editor                                                                                 | Workspace file ViewModel                        | Virtualized directory rows; editor owns document scrolling |
| Configuration             | settings-form, forms, app-dialog, authentication, integrations                                       | Settings, pairing, plugin and device ViewModels | Content-grown forms; pane-owned or virtualized collections |
| Data presentation         | card, data-table, dashboard, analytics, list, filtering, monitoring, empty-state                     | Owning feature or preview host                  | Host-declared bound, pagination or virtualization          |
| Optional product patterns | notifications, onboarding, paywall, kanban, wizard, comments, scheduling, feedback, support, billing | Preview host until backed by a real capability  | Per-surface explicit bound or incremental loading          |

## Ownership

- React views render typed host input. Zustand owns shared projections, selection,
  drafts, command state and recovery. Transport remains in the existing Client SDK.
- Domain callbacks capture their target IDs and connection/workspace/session scope.
  A missing selection never silently targets another record.
- Preview fixture records and simulated command transitions belong to the preview
  host or test fixtures, never to the production dependency graph.
- Web resolves both `zh-CN` and `en-US` labels. State contains IDs, not translations.
- Existing protocol limits remain authoritative. Layout descriptors own workbench
  dimensions; semantic design tokens own control and icon dimensions.

## Delivery gates

Each independently usable feature is checked and committed before the next one.
Run lint, typecheck, the relevant behavioral tests and both production/preview
builds. Interactive changes additionally require browser coverage, desktop/narrow
screenshots and the content/icon/flow guards. Final integration includes the
existing full E2E suite and desktop smoke test.

The starting worktree contains unrelated and overlapping uncommitted changes.
Keep those changes intact and stage only the verified integration delta.

## Implemented increments

- The production root is independent of catalog metadata and preview fixtures.
  AiUsage, AppDialog, SettingsForm and Authentication additionally have production category subentries; other legacy category
  subentries still need migration before the package boundary is complete.
- App Shell 03, session navigation, file listing/document viewing, chat message
  and prompt surfaces, approvals, questionnaires, plan editing, usage/budget
  controls, run history and event traces now have production contracts and Web
  adapters. This does not imply that all surrounding legacy page content is gone.
- Plan drafts have stable client IDs and explicit stale-snapshot review. Budget
  drafts survive usage notifications and failures. Trace loading coalesces
  requests, merges event IDs and bounds retained records; session/file/run/event
  panes use virtualization where appropriate.
- Shared icon tiers replace per-family size maps. Broader spacing, typography,
  layer, breakpoint and legacy Web style consolidation remains in progress.
- Native dialogs share focus containment, Escape/backdrop dismissal and trigger
  restoration. Web and SettingsForm 03 share a controlled preferences surface;
  Web persists supported themes/languages immediately, while preview owns its
  draft/save/cancel lifecycle. Unsupported preference groups are omitted.
- Authentication 06 and real Host pairing share controlled code verification.
  Pairing drafts survive failure, duplicate submits coalesce, and switching Host
  aborts obsolete HTTP pairing before it can reconnect the old client. Code/name
  limits come from shared protocol constants; preview owns the resend countdown.
- Goal editing uses a controlled form in Web and the shell preview. Its ViewModel
  keeps drafts through usage/lifecycle updates and failures, requires review after
  remote objective changes, and owns the clear confirmation. Older Goal responses
  cannot replace newer notifications. Goal/Plan/Budget tabs use shared theme and
  spacing tokens; obsolete capability form styles were removed.
- All six CommandMenu variants expose production list, search/detail, invite and
  assistant contracts; fixture records and workflow state live in the preview host.
  Web command state uses
  stable IDs, preserves selection through reordering, clears unavailable targets,
  suppresses duplicate execution and ignores old workspace results. Workbench
  command descriptors and current Host/client plugin panel contributions supply
  the menu; large collections are virtualized.

The latest full `bun run check` at the CommandMenu increment passed 199 tests. Web and
preview builds passed. Targeted Host E2E covers shell/session/file/chat/approval,
questionnaire/plan/budget/activity flows; AiUsage has a 48-case viewport/theme
check. These are incremental results, not final all-package or desktop acceptance.
Desktop build/smoke, the complete E2E suite and the remaining 280 variant
contracts are still outstanding at this checkpoint.
