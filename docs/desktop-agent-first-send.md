# Agent completion before the first message

This slice closes the no-tab Agent completion and validation gap left by
`c64749f6`. It does not add another Agent dispatch mode or port every CC profile.
Work is on `codex/session-launch-target`, not installed or merged into the primary
checkout.

## Reference and diagnosis

Read-only CC-haha revision: `e28d0a653481ef41b7a329411eeb2f0fd5656731`.

- Root inspected `D:/Git/cc-haha/docs/images/app/zh-CN/composer-slash.webp`.
  The Agent row contains the command, type/task argument hints and a short
  description in the composer-owned overlay; selecting it is separate from Send.
  This supplied application image is not evidence of a newly run native app.
- `desktop/src/components/chat/ChatInput.tsx:260-268,467-486,534-547,627-636`
  uses the same catalog, menu and token replacement for empty and existing
  Sessions. The hero variant changes presentation, not Agent completion ownership.
  `composerUtils.ts:178-210` derives entries from active Agent definitions.
- Parallel source review confirmed hbar's existing Session path already validates
  profile/task. The no-tab editor excluded Agent entries, and `preSessionDraft.submit`
  only checked workspace/model and ordinary first-send requirements before creation.
  Consequently a manually entered invalid `/agent` could materialize a Session.
  This is an unexpanded path in the earlier slice, not a failure introduced by the
  later inline Open or sidebar Search styling.

## Owned behavior

- First-send and existing-session suggestions now share one localized label
  adapter and the same typed, connection-owned Host profile catalog. The new local
  read-only query needs no active Session and creates no Session, Run or Agent.
  No UI store duplicates the catalog and no profile is fabricated on read failure.
- Clicking or completing a suggestion inserts `/agent explore ` only. Agent does
  not enter the local model/settings/Goal action allowlist. Those exact local
  commands keep their existing Enter behavior.
- Before materializing a Session, Runtime validates the recognized Agent prompt:
  profile, nonempty trimmed task, the existing 4,000-character task bound and the
  currently advertised profiles. Failure retains text and attachments, unlocks
  editing/Send and shows one localized nearby message; it does not create anything.
  A failed catalog can be retried on Send. Async completion rechecks cancellation,
  close and the original navigation before creation.
- A valid request remains ordinary captured first-send text. The existing model,
  thinking, approval, Goal/Plan, launch-target and attachment pipeline confirms
  its settings before handing off `composerIntent.submit`. Unknown Run receipts
  continue to use the original receipt/key, not a fresh child creation request.
- The parent model invokes the already registered Agent tool. Its approval gate
  and canonical child identity are unchanged. The tool result uses the existing
  nearby Open action and Activity route. Attachments remain parent context, not an
  implicit child copy; isolated execution-target rejection remains unchanged.

The current Host catalog is bounded to 32 records and advertises only Explore;
duplicate IDs are rejected by its existing owner. The shared slash menu bounds
matches to 24, uses its existing anchored overlay and scroll boundary, and keeps
rows in normal flex flow. No new CSS, layout coordinates or icon sizes are added.

## Verification boundary

- Production Web: 3,391 modules built to `artifacts/agent-first-send-v34/web`,
  `index-CWUyLCFm.js` / `index-Ddfvs7XW.css`. The existing large-chunk warning remains.
- Focused Runtime, shared completion/SSR, slash and composer-intent suites:
  **109 tests / 728 assertions passed**, 5 files. They cover invalid requests with
  no materialized Session, catalog retry/cache, late cancellation/navigation,
  attachment preservation, and existing model/thinking, Goal/Plan and unknown
  receipt recovery. The new Agent attachment test is a Runtime contract check,
  not a live network-disruption test. Bun emitted its existing directory-mismatch
  warning with `--tsconfig-override`; this run exited successfully.
- Real temporary Host plus that production Web: English 1440px and Chinese 390px
  first-send Agent paths both passed (6.5s / 3.0s). Completion and validation leave
  the fixture's original Session count unchanged. Valid Send creates one parent
  Run; the real tool gateway waits for approval before creating its single child.
  Final snapshots verify original text, selected model and successful Agent tool
  result; the nearby Open action is present. The test-only model driver uses no
  paid provider. Its task and reply text are fixtures, not shipped sample records.
- Existing first-send model/settings/Goal/Plan slash flows passed in English and
  Chinese, **2/2 in 8.8s** on the same build. The first combined browser run had
  two outdated positional assertions: it assumed Model was the first slash row.
  The expanded Host order places Agent first. Tests now choose Model by accessible
  name and Settings by its keyboard token; they retain the no-Session, exact Enter,
  draft, Goal/Plan coexistence and overflow assertions. The initial failing trace
  remains in `artifacts/agent-first-send-v34/results/`; the corrected regression
  output is in `regression-results/`. Test-only preview cwd setup was also corrected.
- Root manually inspected the final Chinese narrow completion and validation
  screens and English desktop menu. The overlay stays beside its composer; narrow
  descriptions and the sole error wrap in normal flow without horizontal overflow.
  No new stylesheet or icon tier was necessary. Captures are in
  `artifacts/agent-first-send-v34/delivery/hbar-agent-menu-zh-390.png`,
  `hbar-agent-validation-zh-390.png` and `hbar-agent-menu-en-1440.png`.
- Changed-path strict TypeScript, type-aware ESLint with zero warnings, Prettier,
  content/icon guards and diff checks passed. Full-repository/native checks and
  all CC profiles or isolated Agent execution are not certified by this slice.

The broader desktop-experience goal remains active. No paid model, user profile
change, native build/start, dependency install, push or merge is part of this slice.
Owned temporary Host/browser/preview processes were stopped and test data removed
by fixture cleanup; only ignored verification artifacts remain.
