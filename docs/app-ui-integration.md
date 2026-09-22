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
