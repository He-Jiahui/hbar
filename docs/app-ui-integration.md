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

Registration is not acceptance. Since the user's 2026-09-29 adjustment, current
preview delivery uses core functionality, source-semantic structure, reasonable
flow layout and reachable key content. Shared controls and unchanged layouts may
be inferred from implementation and representative cases; per-button and full
theme/viewport matrices are not a prerequisite. The evidence and remaining gaps
are recorded separately in [app-ui-visual-audit.md](app-ui-visual-audit.md) and
[the variant inventory](app-ui-variant-inventory.md), never as real service delivery.

Optional strict reference acceptance still requires source/local records for every
configured viewport/theme and sampled interaction, no structural hard-gate failure,
no page/console error, and a passed entry in the generated `review-ledger.json`.
Practical delivery does not fabricate that strict status. The retained audit commands are
`bun run app-ui:reactbits:discover`, `bun run app-ui:reactbits:audit`, and the
development filters documented in that guide.

### Authentication 2 controlled-provider integration status

`hbar-app-ui-authentication-2` now accepts an optional typed `providerFirst.referenceFlow`.
Its controlled view has no mirrored email/domain state; the preview's dedicated Zustand
store owns both drafts, the mode and provider identities. Copy-only locale updates keep
the drafts, while an explicit seed/scenario replacement resets the owner. The public
uncontrolled API still uses its existing action IDs, and controlled callbacks do not
also fire the legacy callback. Navigation and continuation only emit scoped typed
requests with `authentication-and-navigation-unverified`; no real authentication,
account creation, redirect or legal-page navigation was performed or simulated.

The live [Authentication 2 preview](https://pro.reactbits.dev/docs/app-ui/authentication/authentication-2)
was read on 2026-09-29 at 911×640 and 320×640, using visible DOM, computed styles and
accessibility. The content column uses flex flow: 420×504 on desktop and 272×524
at 320px. The narrow 48px footer keeps both text spans, lets each wrap in its own
shrinking flex item and has no block padding; the document reaches 652px rather
than hiding the footer in a fixed 640px content box. Host-provided long copy may
naturally grow controls and content. The observed three providers are not a
source capacity limit: the preview declares a six-provider host boundary and a
17-item keyboard-accessible overflow fixture.

`scripts/verify-hbar-app-ui-authentication-2.ts` captures eight local production
theme/viewport views and samples the different mode/draft gates once. It also checks
320×420 footer reachability, long German labels, provider-pane keyboard scrolling,
request-only local Enter submission and browser errors. A separate in-memory browser
test checks locale replacement, inherited provider content, single callback delivery
and the legacy API. The historical `authentication-2-final-v4` cache uses capture
14/interaction 33 evidence, not current 16/37; no current strict source/local acceptance
is claimed. The reviewed five-case source sampling plan restricts remote outcomes and
does not replay every button in every layout.

The same-day `authentication-2-3-current-v1` subsequently recorded eight source/local
static pairs and five matching Authentication 2 interaction-state deltas. Strict
comparison fails the two stress root geometries: the source root is 286×640, while
the local content-grown root is 286×692. Both snapshots place the header at 0–56,
main at 56–644 and footer at 644–692, with the same nine controls and semantic roles.
The source component PNG stops at the iframe root; the local PNG includes the
flowed footer. This is evidence of unequal capture footprints, not a reason to set
a fixed content height. Source footer scroll reachability beyond the captured root
is not proven by these artifacts. A shared comparison canvas and separate content
extent/reachability evidence are the next audit task; no strict sign-off is given.

### Authentication 3 controlled-quote integration status

`hbar-app-ui-authentication-3` accepts an optional typed `quote.referenceFlow`.
The controlled Lumen view projects email, password visibility, the in-memory password
draft and selected quote without its own mirrored state or timer. A dedicated
Zustand preview owner normalizes blank/duplicate IDs, reconciles removed selections
without reviving stale IDs, and retains drafts across copy-only locale and list
updates. Explicit scenario/initial-seed replacement resets the owner. The legacy
view retains its original email-only action API and timer cleanup.

Only typed, scoped sign-in/provider/navigation requests are emitted, with
`authentication-and-navigation-unverified`. Sign-in records contain the current
email and quote ID, never the password; stale payloads and callbacks from retired
owners cannot append requests. The host owns rotation, retains cadence across
draft/copy changes, cleans up on scenario/variant replacement, and rejects invalid
or browser-overflowing intervals. No real login, social authentication, account
creation or external navigation is performed or simulated.

The live [Authentication 3 preview](https://pro.reactbits.dev/docs/app-ui/authentication/authentication-3)
was read on 2026-09-29. Its actual content-width aside boundary is 1024px visible /
1023px hidden, not a browser-window breakpoint. The flex sign-in column measures
360×434 on the 1071×640 desktop canvas and 272×454 at 320px; its inline footer starts
at 588px in the ordinary 640px canvas. Short hosts grow and scroll naturally, and
long copy can wrap. The source's narrow provider SVGs shrink non-uniformly; Lumen
keeps the shared 16px tier with compact padding rather than distorting or hiding them.
Passive metric labels may wrap to retain host content instead of the source's
ellipsis; this is an explicit fidelity difference, not a theme-only waiver.

The three source stories/providers are observations, not capacity limits. The host
boundary is six, with content-grown 17-provider/story and 17-metric fixtures.
`scripts/verify-hbar-app-ui-authentication-3.ts` checks the split boundary once,
representative draft/reveal/selection and keyboard request behavior, 320×420 footer
reachability, long German copy including its real text bounds, overflow retention,
request-log secrecy and zero browser errors. In-memory tests cover locale/list
updates, timer lifecycle and retired callbacks separately from layout sampling.
The five safe source samples cover next, previous-wrap, direct selection, blank
password reveal and email editing; remote actions and secret entry are restricted.
Historical September 23 captures are not current 16/37 acceptance evidence.
The latest `authentication-3-current-v3` uses the same-day protocol-16 source
canvases from `authentication-2-3-current-v1` and freshly captures the current
production view. All eight structural pairs and five protocol-37 raw interaction
state deltas match after restoring `aria-current` on the carousel dots. Strict
comparison still fails two visual-feedback deltas (direct selection and next):
the source ellipsizes Mina's longer metric labels while Lumen wraps them, changing
the testimonial's content height. This difference has no theme waiver or manual
sign-off; the ledger remains `needs-fix`.

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

### Onboarding 4 integration status

`hbar-app-ui-onboarding-4` renders six host-owned use-case radio cards and four
team-size buttons from stable IDs and localized copy. The initial selection is
Run sprints and 2–10. Raw same-hash source AX before/after shows a Plan a roadmap
click or Enter changes the checked radio; a Just me Space press changes the
team-size pressed state. The legacy comparison summary missed the radio checked
transition and incorrectly called it a no-op. The host store now models both
mutually exclusive choice mechanisms; other choices in each group use the same
mechanism by inference, not one replay per button and layout.

Back and Continue remain typed requests because their outcome, template
application and persistence are not reliably captured. The authorized
[Onboarding 4 reference](https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-4)
`full-static-v10` and `full-interactions-v4` entries share source hash
`b59ffe4e0ac59409bfbbd7e84a374f348d61f9536b4168ac63c4d8c8c64c543c`.
The interaction cache has no current capture protocol, so this is not fresh
strict acceptance. Local narrow flow exposes the controls by natural scrolling,
without assuming the source scroll owner.

### Onboarding 7 integration status

`hbar-app-ui-onboarding-7` renders the host-owned workspace form with name and
URL controls, a three-option native region select, a private-workspace switch
and two requests. Raw same-hash source AX shows that name fill, region selection
and checked state change independently, although the legacy comparator labels
all three as no-ops. The local Zustand store models these observed mechanisms.
Slug edits emit requests and keep the supplied URL hint unchanged; Back and
Continue do not invent navigation, URL derivation or workspace creation.

The authorized [Onboarding 7 reference](https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-7)
`full-static-v10` and `full-interactions-v4` entries share target source hash
`c769fb52bac854061e34445b9722cc24da504e6c6561b21d7b40eda062a5888d`,
but source-directory hashes differ and the interaction cache lacks the current
protocol. The context stepper is outside the captured form AX root, so its scope
remains ambiguous and it is not added to the form. Eight local static views,
German long copy and a real 320×420 document scroll verify flow; the desktop
form is 440×498.06, close to the cached 440×497.5. This is restricted source
evidence, not fresh strict source/local acceptance.

### Onboarding 6 integration status

`hbar-app-ui-onboarding-6` presents a decorative success mark, four host-owned
summary term/definition pairs and two independently named next actions. The
first action's same-hash legacy before/after AX remains unchanged in-frame;
the Tour outcome was not sampled. Both therefore emit typed host requests
without pretending the workspace opened or the tour started. The summary
values and German copy come from the host, with normal content-grown flow on
narrow screens.

The authorized [Onboarding 6 reference](https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-6)
`full-static-v10` and `full-interactions-v4` entries share target source hash
`93ab87124b7b37a54b3787fb2dd7095a4216352a54de126546fe9e6b7b02628a`,
but their source-directory hashes differ and the interaction cache has no
current protocol. The representative local captures and scroll check do not
constitute fresh strict acceptance.

### Onboarding 5 integration status

`hbar-app-ui-onboarding-5` renders a host-owned invitation link and two
stable-ID rows with email drafts and native role selects. The first row starts
with Priya as Admin; the second is empty with Member selected. The raw
same-hash source AX confirms that editing the first email and selecting Member
change those fields even though the legacy comparator calls them unchanged.
The local Zustand store changes only the targeted row. Copy, Add another,
Remove, Skip and Send emit distinct typed requests without inventing clipboard
success, row mutations, navigation or remote delivery.

The authorized [Onboarding 5 reference](https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-5)
`full-static-v10` and `full-interactions-v4` entries share target source hash
`51420cc1343bb3745a2a6b20caa68248033c860c0fcea1319823400de08abf8e`,
but the interaction cache has no current protocol and its source-directory
hash differs. The eight local static views and one short-height scroll do not
constitute fresh strict source/local acceptance. Narrow flow keeps long host
copy readable rather than reproducing the source's truncated text.

### Paywall 1 integration status

`hbar-app-ui-paywall-1` now uses the source's single-column article teaser,
intentional fade and inline overlapping membership card. The host supplies
the article, membership copy, benefit data, action labels and list capacity
policy. The card follows the teaser in reading order; the article/card heading
levels are h2/h3, with separate upgrade and sign-in requests. No checkout or
login outcome is fabricated. On narrow screens the buttons stack and remain
reachable by natural pane scrolling; a host opt-in over-capacity benefit list
is separately keyboard-scrollable.

The authorized [Paywall 1 reference](https://pro.reactbits.dev/docs/app-ui/paywall/paywall-1)
`full-static-v10` and `full-interactions-v4` entries share source hash
`2c7a0feef5f9cfa5e5426b14d1c2d5a48a9c48f74359fb32aa90c6262078c5ed`.
The legacy interaction cache lacks the current protocol. Five desktop first-
button probes were missing (`control-index-not-found`), and the captured mobile
first-button sample has no reliable visible outcome. The second action is not
covered, so this is not fresh strict interaction acceptance.

### Paywall 2 integration status

`hbar-app-ui-paywall-2` renders the host-owned feature-gate dialog with a
heading, three passive feature rows, separate price amount/details and three
independently named requests. Dismiss, Not now and Upgrade do not locally close
the dialog or invent billing success. Empty, one-item, eight-item boundary and
over-capacity fixtures preserve all content; an opt-in overflow list is
keyboard-scrollable. The short-height pane scroll reaches Upgrade at 320×420.
A 356px review exposed a wrapping footer that placed Upgrade outside the card;
the Paywall2-only flow correction keeps the stacked CTA within the card.

The [official Paywall 2 page](https://pro.reactbits.dev/docs/app-ui/paywall/paywall-2)
was reachable but its preview iframe was blank. The authorized `full-static-v10`
reference has source hash
`fde353858cd991100f3c72c61865bac42df24b113d416876df68315c70a1187e`.
Legacy Dismiss click/Enter/Space captures show no visible close, which does not
establish its intended outcome; the interaction cache lacks the current
protocol. Nine focused tests/92 assertions and local browser mechanisms pass,
but no fresh strict source/local acceptance is claimed. The Lumen package build
script was blocked by the installed pnpm version; its Vite and declaration
steps were run directly. Existing other-variant flow rules remain outside this
change, and the child task could not run Stylelint.

### Paywall 3 integration status

`hbar-app-ui-paywall-3` receives its source-shaped plans through the public
Lumen provider, preserving existing children and inherited content. The host
owns period, prices, badges, feature text and stable plan IDs. Monthly updates
both paid-plan prices and the billing note; both native period buttons remain
Tab-reachable, and local Enter activation restores Yearly. The current-plan
action is disabled. Choose and Compare emit requests without switching the
current plan, opening checkout or inventing a comparison result.

The [official Paywall 3 iframe](https://pro.reactbits.dev/docs/app-ui/paywall/paywall-3)
was readable on 2026-09-29. Only the default Yearly→Monthly transition was
observed live: Pro $19→$24, Scale $54→$68 and the monthly note. Yearly restoration
is a local sample, not a source observation. The authorized `full-static-v10`
and legacy `full-interactions-v4` target hash is
`a26e1489398f57fed8f77a7588a91d2123037ebb4e72a2ec4b41c69b49beb527`;
the old interaction subset only covers the disabled current-plan button. These
clues do not constitute current-protocol paired strict acceptance.

Empty, one-item, six-item boundary and 15-plan overflow fixtures distinguish
host policy from a discovered source maximum. Three-column flex-wrap keeps
over-capacity cards readable; narrow cards stack, and only an explicit host
pane-scroll policy bounds the list. The flow guard initially rejected CSS Grid
in child commit `5f3cdf53fe`; the follow-up replaces it with flex flow rather
than weakening the guard. At 320×420 a real document scroll of 721 reaches
Compare. The local desktop root is 900×431.03 versus the old 900×436.5 reference;
this residual is recorded, not reported as exact geometric acceptance.

Ten focused tests/84 assertions, root/Lumen typechecks, targeted integration
lint, style/format/content/icon/flow checks, preview build and direct Lumen
Vite/declaration builds pass. Shared `paywall.tsx` still reports 13 existing
lint errors, down from 14 before; it is not globally lint-clean. Verification
samples period projection, keyboard restoration, one request, capacity and
narrow flow instead of every plan-button/layout combination.

### Paywall 4 integration status

`hbar-app-ui-paywall-4` now presents three host-owned passive quota rows,
segmented used/limit text and ornamental fill tracks. The source has no meter
or progressbar roles; accessible text carries the values. A decorative alert
uses the shared `md` icon tier. Top-up and Upgrade emit typed requests without
resetting quota values, resuming ingestion or claiming checkout success.
Empty, one-item, six-item boundary and 17-item overflow fixtures distinguish
host capacity policy from the source's three observed records. The overflow
region is keyboard-scrollable and all rows remain present.

The [official Paywall 4 iframe](https://pro.reactbits.dev/docs/app-ui/paywall/paywall-4)
was readable on 2026-09-29. The desktop content column is 620×426.25; the 320px
styles show a padded overflow-auto preview stage and stacked narrow actions. One
safe prototype Top-up click has no visible in-frame result; Upgrade was not
sampled. These observations supplement the authorized old static cache but
do not constitute current-protocol paired strict acceptance. The local desktop
content matches 620×426.25 with full-width list/card; the verifier additionally
checks stretch widths after inherited generic centering was found and fixed.
At 320×420 a real document scroll of 159 reaches Upgrade with no horizontal
overflow. The host owns preview-stage versus document scrolling; the local flow
keeps long content readable rather than reproducing centered overflow clipping.

Eight focused tests/53 assertions, root/Lumen typechecks, targeted new-file
lint/style/flow/content/icon checks, preview build and direct Lumen Vite plus
declaration builds pass. Shared `paywall.tsx` lint still has 15 existing errors,
down from 16 before; the overall file is not reported lint-clean.

### Paywall 5 integration status

`hbar-app-ui-paywall-5` presents host-owned trial-expiry copy, four passive
retained-data pairs, a payment-method hint with the shared `md` card icon,
Change, Reactivate and renewal copy in source reading order. Both actions
emit different typed requests; neither changes the retained values, payment
method, billing status or access. Empty, one-item, eight-item boundary and
18-item overflow fixtures exercise host policy, not an asserted source maximum.
The overflow region retains all records and supports keyboard scrolling.

The [official Paywall 5 iframe](https://pro.reactbits.dev/docs/app-ui/paywall/paywall-5)
was readable on 2026-09-29. The source desktop card is 560×517.75 with 24px
content padding and four normal-flow rows. A safe Change prototype click
shows no visible editor; Reactivate was not triggered. This is not a current-
protocol paired strict capture. The local desktop card matches 560×517.75,
including the 188px passive summary, 63.5px payment row and 40px action.
At 320×420 a real document scroll of 376 reaches the action. Below 20rem,
local summary labels and values stack to remain fully readable instead of
reproducing source narrow clipping. German long copy remains present.

Seven focused tests/54 assertions, root/Lumen typechecks, new-file lint,
style/format/content/icon/flow guards, preview build and direct Lumen Vite/
declaration builds pass. Shared `paywall.tsx` still reports 14 existing lint
errors, down from 15 before; the entire shared file is not lint-clean.

### Paywall 6 integration status

`hbar-app-ui-paywall-6` preserves the metered-reader counter as an accessible
image with three ornamental segments, not an interactive progressbar. The host
owns counter data, copy, the optional email draft and three passive assurances.
The native email form keeps browser type validation and associated, unique
accessible labels. Keep reading and Sign in emit different requests without
resetting reads, sending email, completing a subscription or navigating.

The [official Paywall 6 iframe](https://pro.reactbits.dev/docs/app-ui/paywall/paywall-6)
was readable on 2026-09-29. A fictional email draft was filled; neither action
was triggered. The source column is 520×254.25 with a 108×6 counter and 400px
form. Authorized `full-static-v10` target hash
`7992dfa3b2f56a97e10f11a924d11b313e9aced897ca099caab27c412752fa2f`
is an old reference, not current-protocol paired strict evidence. The local
column is 520×255.73; its 37.5px form is slightly taller than the source's 36px
controls. That residual is retained rather than claimed as exact geometry.

One invalid local Enter is blocked by native type=email validation; valid Enter
reaches the host request and preserves the draft. Empty-input optional validity
and equivalent mouse activation are inferred, not replayed in every theme or
layout. Empty, one-item, six-item boundary and 17-item assurance fixtures
exercise host policy, not a source maximum. Extra counter records wrap; only
explicit pane-scroll assurances receive a bounded, keyboard-scrollable region.
At 320×420 a real document scroll reaches Sign in with no horizontal overflow;
long German copy remains readable without duplicated stage padding.

Ten focused tests/82 assertions, root/Lumen typechecks, targeted lint, new-file
style/format/content/icon/flow checks, preview build and direct Lumen Vite plus
declaration builds pass. Stylelint initially found a line-height precision
error in child commit `249fc3c620`; the follow-up fixes that precision without
changing the layout mechanism. The browser reports zero console/page errors.
Shared `paywall.tsx` retains 12 existing lint errors, down from 13 before; the
shared file is not globally lint-clean.

### Paywall 7 integration status

`hbar-app-ui-paywall-7` receives the seat-level admin gate through the public
provider. The host owns two passive administrator records, localized copy,
the optional native note and stable request targets. The lock/building icons
use shared `md`/`sm` tiers; request section copy stays paragraphs, not invented
headings. The textarea has an associated, unique label and native two-row
editing affordance. Compare and Send are different requests, without fabricated
navigation, email delivery, approval or a plan upgrade.

The [official Paywall 7 iframe](https://pro.reactbits.dev/docs/app-ui/paywall/paywall-7)
was readable on 2026-09-29. One fictional note edit was observed; neither action
was triggered. Authorized `full-static-v10` target hash
`faedc1fdcb52ce4544dbba8f9c958c671e20d375f8e74f052caa1150a8531897`
is an old static clue, not a current-protocol paired strict capture. Desktop
source flow is 560×447.25; the 320px preview keeps the lock/title row and stacks
footer copy above its two-button row. The preview stage owns padding/scrolling.

The final local desktop naturally reaches 560×447.25 by preserving the native
inline label/inline-block textarea flow and the observed reason-panel parent
16px/24px typography. No fixed panel height or coordinate compensation is
added. The final 320×420 spot-check scrolls 140 and reaches Send at
360.25–396.25. Empty, one-item, six-item boundary and 16-recipient overflow
fixtures exercise host policy, not a source maximum; the opt-in administrator
region is keyboard-scrollable. Long German text remains present. One local
Send in the preview inspector carries the latest draft and both stable IDs,
preserving the draft and current Pro plan. Equivalent passive rows/actions are
not replayed in every layout.

Eleven focused tests/77 assertions, root/Lumen typechecks, targeted lint,
style/format/content/icon/flow guards, preview build and direct Lumen builds
pass. Eight local stills and representative mechanism checks report zero
console/page errors; the final typography change receives desktop/narrow
spot-checks without repeating unrelated requests. Shared `paywall.tsx` has
11 existing lint errors, down from 12 before; it is not globally lint-clean.
The complete audit unit regression initially reported 98/99 passing: the
native-state fixture finished all eight assertions but exceeded its test budget
while closing Chrome. A separate lifecycle correction reuses one browser
process with isolated contexts and preserves all assertions; the combined
regression now passes 99/99 tests and 543 assertions in 18.70s. This is a unit
regression result, not 300-variant source/local acceptance.

### Paywall shared quality closure

The earlier per-variant lint counts above are historical integration snapshots.
The shared `paywall.tsx` now passes scoped ESLint without suppressions: four
missing braces, the optional icon tier declaration, nested icon-path selection
and the synchronous period-reset effect are corrected together.
History and the `Plans` line diff trace the original effect and glyph branches
to child commit `fe960fbff0`; the later reference-provider integrations did not
introduce them.

The generic plan fallback still owns only its ephemeral billing-period choice.
It is keyed by the host's `initialPeriod`, so a changed initial period resets
that choice without an effect-driven cascading render. Replacing content or
localized labels with the same initial period retains the user's choice. The
host-controlled `plansReference` branch is unchanged. A
[dedicated browser regression](../tests/hbar-app-ui-paywall-generic-plans.test.tsx)
passes one scenario with 20 assertions covering these two lifecycle mechanisms
and stable plan-target requests through the public package API, rather than
repeating every action at every viewport. It builds an isolated in-memory
fixture, uses one temporary localhost port and releases page/browser/server
resources even if a prior cleanup fails; it does not replace the shared preview
build or install another DOM runtime.

All seven generic renderings have exactly the same static HTML SHA-256 hashes
before and after this change. No CSS, semantic region, native control, icon
path or size tier changes; the equality check is regression evidence, not a
claim of source/local visual acceptance. The focused family regression passes
55 tests and 442 assertions; root/Lumen typechecks, scoped lint/format/content/icon
checks, preview build and direct Lumen Vite/declaration builds also pass.

### AI Chat 1–9 controlled reference family

All nine AI Chat variants now have opt-in, independently composed reference
surfaces through `LumenAiChatContent.referenceViewModel`. Existing content APIs
and legacy branches remain compatible. The typed discriminated content covers
reasoning/tool disclosures, versioned artifacts, embedded conversation, context
header, approval conversation, original multi-agent authors/activity, inline
citations/pinned sources, a voice snapshot and a composer-anchored model menu.
Copy, messages, files, model descriptions and code/document payloads come from
Host data; none of the reference records live in the reusable implementation.

The preview Host owns drafts, stable selections, removed attachments and the
local voice phase in one Zustand store per owner. Empty/stale/duplicate IDs have
deterministic handling, owner changes cannot redirect callbacks, and an intent
does not clear the draft or manufacture an assistant response. Approval stays
pending until supplied Host data changes. Copy, download, attachment, settings,
send and approval requests explicitly report intent only: no provider, clipboard,
file, microphone or destructive service operation is performed.

Use `bun scripts/verify-hbar-app-ui-ai-chat-reference-core.ts` for the practical
browser check against the built preview. It checks each of the nine structures
once, samples the distinct shared mechanisms, and checks two narrow flows.
Equivalent native controls, themes and repeated widths are inferred from shared
implementation rather than replayed exhaustively. Artifacts are written to
`artifacts/ai-chat-reference-core-review/`.

The source basis is the authorized `full-static-v10` desktop/tablet/mobile cache
and relevant `full-interactions-v4` observations, not freshly captured strict
pairs. Artifact modes/versions, approval request disclosure and voice stop/resume
are local preview behavior where source-after evidence is absent. Narrow artifact,
activity and pinned-source access is retained through normal flow rather than
silently dropping the source's desktop side panel. Production Web's actual
provider/session history and approval execution are outside this preview increment.

### Paywall 1–7 practical category closure

The seven existing source-shaped surfaces are retained rather than rebuilt:
article membership lock, feature gate, billing-period plan comparison, passive
quota notice, retained-data trial card, email reader gate and administrator
request. The current delivery standard is practical functionality and broadly
normal flow, not another every-button/theme/viewport matrix. The historical
source observations and strict gaps above remain historical; this closure does
not convert them into fresh source/local paired evidence.

One material correction makes the recommended-plan CTA independent of copy.
Child commit `5f3cdf53fe` introduced a comparison between localized badge text
and the technical string `recommended`; the Host actually supplies `Recommended`
or `Empfohlen`. The view now derives recommendation from non-current badge
presence, matching the existing semantic badge kind. A German-label regression
checks primary/solid treatment while retaining the disabled current plan.
Current Paywall 6/7 scoped lint findings are also corrected without changing
their public API or DOM behavior: React namespace imports, braces and typed
named-region props retain the keyboard-scrollable assurance pane.

Run the [practical category check](../scripts/verify-hbar-app-ui-paywall-reference-core.ts)
with `bun scripts/verify-hbar-app-ui-paywall-reference-core.ts` against the built
preview on port 5193. It mounts all seven structures once and samples only
distinct mechanisms: period/price/note changes, native email validity and a
retained request draft, and a target-named administrator request. Two narrow
samples cover wrapping plan cards and long-copy content/actions. Equivalent
passive rows and request buttons are inferred from their shared implementation,
not individually replayed in every layout. Screenshots and browser diagnostics
are written to `artifacts/paywall-reference-core-review`.

Upgrade, comparison, login, top-up, reactivation, mail and administrator actions
remain requests; no purchase, delivery, approval or restored access is asserted.
The current focused family regression (56 tests / 465 assertions), root/Lumen
typechecks, scoped lint and format, production preview and direct Lumen
package/declaration builds pass.
The existing preview chunk warning and installed/pinned pnpm mismatch remain;
direct existing tools do not prove the pinned-pnpm workflow. These seven rows
now meet the practical function/layout standard, while the full 38-category/
300-variant objective continues and strict/backend acceptance stays separate.

### Chat 2–6 practical reference integration

The remaining Chat reference branches now have independent, host-owned layouts:
Direct conversation search and incoming/outgoing bubbles; a social post with its
composer before sorted replies and a nested reply; the full four-message support
history with minimize/restore and a binary helpful vote; a message-only group
transcript with image/document attachment cards and reactions; and eight inline
live-chat rows with Follow. The group reference intentionally has no invented
participant header or composer, and the live reference has no legacy tabs or
viewer list. Existing generic content remains compatible.

The preview Host keeps search, target-specific drafts, sort, likes, reactions and
follow state in Zustand. Local confirmation remains a preview-only message, not
delivery or read receipt; Direct read indicators require an explicit `read` field.
Support capacity accounts for all four source records, and evicted local social
replies also retire their like IDs. Content-grown social threads do not shrink
their reply list into a zero-height slot; More replies stays after the last row.
Narrow support widgets grow naturally and use the outer pane's scrolling.

Verification is focused on the new mechanisms: the
[reference core check](../scripts/verify-hbar-app-ui-chat-reference-core.ts)
samples search/selection, like/sort, minimize/restore/helpful, a reaction and
Follow, plus narrow long-copy Direct/social flow. The
[shared composer regression](../scripts/verify-hbar-app-ui-chat-core.ts)
retains pending/confirmation/failure and captured-target coverage without
replaying every family/button. Both production-preview checks pass with no
console/page errors or horizontal overflow. The 38 focused tests/306 assertions,
root/Lumen types, scoped lint/style/content/icon/flow guards and preview/Lumen
builds pass for this increment; the existing large-preview-chunk warning remains.

The structural reference is the authorized `full-static-v10` cache, not a fresh
source/local strict ledger. Calls, attachment selection, sharing, download and
thread expansion emit named requests only; no remote result is claimed. The
incompatible installed/pinned pnpm versions are unchanged; Lumen verification
uses the existing direct TypeScript/Vite/declaration tools, not a claim that the
standard pinned-pnpm workflow passed. Practical delivery does not imply that
the overall 38-category/300-variant goal is complete.

### Support 1/4/5 practical reference integration

The remaining Support reference branches now use Host-supplied content and
controlled flows. Help retains four topics in a two-column/one-column flex flow,
four popular articles, native search and the contact footer. The embedded,
non-modal Assistant retains the three supplied messages, two article requests,
three suggested actions and its native three-row textarea. Requests retains
six native-list rows, pressed filter buttons, search, column labels and its
retention footer; Open includes requests waiting on the user.

The preview Host keeps queries and filter IDs in Zustand and reuses the existing
Support reply state machine for Assistant drafts, captured-target tickets,
pending/failure/confirmation, cancellation and a bounded local message tail.
Closing cancels a pending preview without clearing its draft. Source actions,
article navigation and new-request creation emit named requests only: no extra
ticket, export, human handoff or AI answer is invented. Generic fallback views
remain compatible and are separate from the controlled reference components.

The [practical core check](../scripts/verify-hbar-app-ui-support-reference-core.ts)
passes desktop mounts, a Help query, open/waiting request filtering, creation
without count inflation, Assistant close/cancel/reopen and local confirmation,
plus one narrow long-copy Requests sample. There are no console/page errors or
horizontal overflow in those samples. Screenshot review caught a translucent
reading token used as own-message text; the opaque shared contrast token now
keeps both the body and preview-only status readable without per-theme tweaks.

The 36 focused Support SSR/store tests and 318 assertions, root/Lumen types, scoped lint/style/format
and content/icon/flow guards, preview build and direct Lumen package/declaration
builds pass. The source structure comes from the authorized `full-static-v10`
cache; this is functional/layout acceptance, not a fresh source/local strict
ledger or an exhaustive button/theme/viewport matrix. The existing preview
chunk warning and incompatible installed/pinned pnpm versions are unchanged;
direct existing tools do not imply that the pinned-pnpm workflow passed. The
overall 38-category/300-variant goal remains in progress.

### Billing 1–8 practical reference integration

All eight Billing reference branches are now dispatched separately from the
compatible generic fallbacks. Statement keeps its balance, four metrics and
eight-row native ledger; Plans keeps three flex columns and native switches;
Invoice Composer supplies the observed Customer/Terms form with ten native
fields. Recovery keeps three metric summaries, six native table rows and the
initial three-attempt expansion. Change Plan projects four native choices and
their Host-supplied proration summaries. Payment Methods keeps three methods,
two contacts, address and tax information. Usage uses a native roving tablist,
four meters and the unabridged 120% overage text. Invoice Detail keeps the
observed four-row native table, totals, activity and collection aside, without
adding an unobserved invoice header or toolbar.

The preview Host owns query, flags, drafts, expansion and selection in one
Zustand owner per surface. Saves and primary-method selection capture immutable
preview tickets, reject duplicate/stale confirmations, retain edits on failure
or cancellation and reconcile retired IDs or changed field constraints.
Confirmation explicitly says nothing was published, persisted or changed at a
payment processor. Compound flag IDs are collision-safe; repeated record IDs
keep the first record and collections are not silently truncated at their
declared expected maximum.

The [practical core check](../scripts/verify-hbar-app-ui-billing-reference-core.ts),
also reached by the established `app-ui:billing:verify` entry, mounts all eight
structures once and samples search, captured save, retained draft, expansion,
plan-summary replacement, primary-method projection and keyboard tabs. One
narrow long-copy form and one narrow internally scrolling table cover the two
different responsive mechanisms; these samples have no console/page errors or
page-level horizontal overflow. Screenshot review confirms broadly normal
layout, not pixel-level equivalence or every button/theme/viewport combination.

The 30 focused Billing SSR/store tests and 270 assertions, root/Lumen types,
scoped lint/style/format and content/icon/flow guards, production preview build
and direct Lumen package/declaration builds pass. Reference structure comes from
the authorized `full-static-v10` cache; the observed Starter summary also agrees
with the cached `full-interactions-v4` selection result. Invoice Next, Change
Plan Continue/Cancel, exports, edits and payment/retry actions emit requests
only. Later wizard steps and their source feedback are unverified, and no real
invoice, retry or charge has been sent. This is not a fresh strict source/local
ledger or final desktop/backend acceptance. The existing preview chunk warning
and incompatible installed/pinned pnpm versions remain; direct existing tools
do not imply the pinned-pnpm workflow passed. The 38-category/300-variant goal
remains in progress.

### Integrations 1–6 practical reference integration

Six opt-in reference branches preserve the compatible generic integrations
fallbacks. Marketplace uses nine flex cards and six keyboard-selectable tabs;
Connection uses four native scope switches, four activity entries and a native
audit link. API Keys keeps four native table rows with reveal, copy, rotate and
revoke actions reachable through its own horizontal scroll region. Webhooks
keeps endpoint selection, HTTPS URL/topics and target-bound delivery expansion.
Consent keeps three permissions and a native workspace trigger/listbox rather
than replacing it with a select. Sync keeps five sources, four metrics and
source progress/failure details, without an unobserved retry control.

The preview Host uses one Zustand owner per surface for query, selection,
scope/endpoint settings, reveal IDs, expansion and source phases. Required
scopes cannot be edited; removed or repeated IDs reconcile safely and stale
delivery callbacks cannot mutate another endpoint. Reveal state stores only
IDs, and fixture keys are preview-only strings. Visible copy, IDs, option seat
details, URLs and labels come from typed Host content; React owns only transient
menu visibility/focus.

Reference structure is based on the authorized `full-static-v10` cache. The
cached Consent workspace-menu expansion proves the trigger-anchored overlap
with the permissions list, so the flow guard permits only that path-scoped menu
container to be positioned. Its solid themed background prevents underlying
text from bleeding through. Other content remains in ordinary flex flow.
Alternate webhook URL/topics/delivery data are explicitly fixtures, not claimed
as captured source feedback. Pause/resume phases are reasonable local-preview
inferences: metric counts follow those phases, while progress and failure copy
are retained. The cached Sync all case has no visible source result; it emits
an intent only, without timers, fake completion or clearing an error.

Run `bun scripts/verify-hbar-app-ui-integrations-reference-core.ts` against the
built preview (default port 5193). This new entry intentionally leaves the
pre-existing `app-ui:integrations:verify` script untouched. The practical check
mounts all six structures once, samples filtering, editable scopes, reveal IDs,
webhook expansion/selection, keyboard workspace selection and local pause/resume,
then checks only two different narrow mechanisms: an internally scrolling table
and stacked long-copy content. Representative screenshots show broadly normal
flow; no every-button, viewport/theme matrix or pixel-level equivalence is
claimed. There are no page/console errors or page-level horizontal overflows in
these samples.

The 29 related SSR/store tests with 230 assertions, root/Lumen types, scoped
lint/style/format, content/icon/flow guards, production preview and direct Lumen
package/declaration builds pass. Connecting/disconnecting, creating/rotating/
revoking/copying keys, test delivery, OAuth and actual sync remain target-named
intents: no clipboard, credential service, OAuth redirect or sync backend was
mutated. This is not a fresh strict source/local ledger or final desktop/backend
acceptance. The existing preview chunk warning and incompatible installed/pinned
pnpm versions remain; direct existing tools do not imply the pinned-pnpm
workflow passed. The 38-category/300-variant goal remains in progress.

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

### Command Menu 1–6 practical reference closure

The newer practical increment closes all six preview flows without claiming the
historical strict matrix or real Host services are complete. Each active variant
owns one Zustand store, initialized from typed EN/DE host fixtures; the reusable
Lumen contracts receive data, localized labels and exact-target callbacks.

Grouped commands, nested project/theme/status pages, typed search and distinct
entity details, invite/rerun/archive argument review, assistant fallback/matching
results, and local room selection now preserve the visible reference differences.
Review is an actual summary, Back preserves drafts, and switching actions resets
the review phase. Confirmation, Ask and external commands remain request-only;
the preview never sends invitations, calls models, runs workflows or changes a
real project. Room selection updates only its owned local projection.

`LumenCommandList` retains its explicit `content-grown`/`virtual` contract. Short
host-bounded menus grow naturally; the preview selects virtualization above 50
items. Large collections now use TanStack virtualization with measured rows and
normal-flow spacers, rather than mounting the whole collection behind CSS.
The 10,000-item browser fixture renders 18 initial options and reaches the last
record. Typed search uses top query, scope tabs and a desktop detail pane; narrow
layouts omit the detail pane as the reference does.

The [core browser check](../scripts/verify-hbar-app-ui-command.ts) samples all six
distinct flows once, two narrow cases and one large-list scroll, with 18 check
records and three representative screenshots. Command model/SSR/compatibility
tests and targeted workbench command palette regressions pass. These results
justify the practical function/layout status in the inventory, not a new full
viewport/theme/button audit or desktop/service acceptance.

### Navbar 1–14 practical reference closure

All fourteen compositions keep distinct header/body structures. The preview mounts
one active-variant Zustand owner and supplies typed content, EN/DE labels, drafts,
stable-ID selections, local star/bookmark flags and exact-target request callbacks.
Project tabs replace whole content groups; analytics primary tabs replace their
secondary choices and metrics; deployment choices update the header and summary.
Search displays Host-provided results above an unchanged Today list. The source
filter tabs change selection/count, not the five supplied records.

Typed popup and narrow navigation contracts support grouped menus, project search,
documentation disclosure and article contents. The article contents menu scrolls
only the current document. External actions are request-only: no invitation, model,
search service, theme persistence, shopping mutation, clipboard write or download.
Menus support local dismissal and keyboard selection; drawers support dismissal
and trigger restoration, but this increment does not claim focus containment.

Normal flex flow replaces ordinary Grid/overlap. Bounded panes still own real
scrolling; long translated headings and CTAs wrap without hiding navigation. Shared
canonical control classes now match the navbar stylesheet, and selectors target
the native Lumen content frame rather than the removed legacy variant box.
Only evidenced menu/search/drawer containers receive positioning exceptions.

The [practical browser check](../scripts/verify-hbar-app-ui-navbar.ts) takes one
core path per composition, two narrow representatives and one 64-row pane scroll.
Its 34 check records and three inspected screenshots support the practical status,
not a new pixel/viewport/theme/button matrix or real service/desktop acceptance.

### Mobile 1–5 practical reference closure

The preview mounts one active mobile owner, supplies typed labels/records and
projects selection, query, task display state and exact-target request intent.
Reusable Lumen components no longer generate tasks or runs. First-wins stable IDs,
removed records, owner identity and currently visible targets guard callbacks;
selection/draft changes clear stale intent. New task, attachments, destinations,
navigation and new run remain request-only, with a nearby preview notice.

Observed reference states include seven activity records and seven Recent searches,
seven open tasks and four quick actions, five noninteractive Home cards, six orders
with a More sheet, and eight Running/three Queue rows with a Navigation sheet.
More supports two actual sheet extents. Navigation keeps Workflows and its four
observed destinations, the known section labels and the profile footer. Unknown
Data/Settings children are not invented. Closing menus restores the trigger where
provided; this increment does not claim full focus containment.

Source metadata describes Mobile3's morphing search dock, but no source search
result capture is available. The matching/empty results are explicitly a local
query of host-supplied cards. Task completion is also an explicit local display
extension. Source Filters and task Search captures were no-ops, so the preview
records those requests without inventing a remote result.

Ordinary layout uses natural flex flow and shared semantic icon tiers. A bounded
phone canvas owns main-content scrolling; menus alone use evidenced positioning.
The 81-row stress sample reaches its last record while preserving bottom navigation.
Long German task labels wrap at narrow width. The [core browser check](../scripts/verify-hbar-app-ui-mobile.ts)
samples five paths, two narrow representatives and one list scroll: 16 check records,
three inspected screenshots and no browser diagnostics. Fifteen focused tests with
134 assertions support the practical inventory status, not a fresh full strict
matrix, protected-source equivalence, real service or desktop acceptance.
