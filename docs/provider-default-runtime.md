# Provider global-default Runtime contract

`providerEditor.setGlobalDefault` is the Runtime action for the provider-row
default operation on the Host-owned Providers settings page. Its input is a
`providerId`; it resolves that profile's configured `provider.model` and writes
only the global `provider.model` field. A multi-model provider uses the
qualified selection ID from the canonical model catalog. Runtime never picks
the first catalog model or changes the provider editor draft, global thinking
level, or an explicit workspace/session override.

The action requires a ready active Settings form with the Providers group
selected. It captures that form and the row's configured primary model before
reading fresh profiles, the global settings snapshot, and the selectable model
catalog. Before writing, it verifies that the captured target still exists,
still has the same configured primary, remains visible/selectable, and that the
same Providers form still owns the action. The form may retain a global,
workspace, or session layered context: that context owns navigation and its
unsaved draft, not the destination of this explicitly global operation. The
write always uses the global snapshot and a single-field
`settings.apply` with the snapshot's revisions and an idempotency key. The
Host's exact settings receipt is the only confirmation of an ambiguous result.

If the selected global model already belongs to the requested provider, the
action is an idempotent no-op. This deliberately preserves a non-primary model
already selected for that provider. Otherwise the operation selects the
provider's configured primary model. A confirmed write refreshes the active
matching settings form only when it is global and clean; a layered, dirty, unsets-bearing,
submitting, unknown, inactive, or editor-covered form is left untouched.

The `providers` Runtime state exposes two domain projections:

- `globalDefault` reports `status` (`idle`, `loading`, `ready`, `unavailable`,
  or `error`), the actual global `modelSelectionId`, resolved `providerId` and
  `modelId`/names when known, whether it is selectable, and an error code when
  the read failed. It is derived from Host settings and the visible catalog,
  not from the provider-row primary-model metadata.
- `globalDefaultAction` reports `status` (`idle`, `submitting`, `succeeded`,
  `failed`, or `unknown`), the target provider and selection IDs, and an error
  code. `unknown` locks out another write until
  `providerEditor.reconcileGlobalDefault` reads the exact original receipt.

The UI should show the actual selected model for the global provider, avoid
presenting that provider's configured primary as the current global model when
they differ, and expose reconciliation for unknown results. Localized labels
and accessibility text remain owned by the host UI contract.

Validation: the focused Provider/settings-form suites passed 23 tests / 163
assertions. The affected Runtime/contract graph and the Provider test passed
scoped strict TypeScript, scoped ESLint and Prettier checks. This is the Runtime
slice only; the row UI, production Web build and browser evidence are delivered
separately. No full-repository, native or external-model validation is claimed.

The later contextual-entry regression and its current validation are recorded
in [Contextual Providers defaults](desktop-provider-context-default.md).
