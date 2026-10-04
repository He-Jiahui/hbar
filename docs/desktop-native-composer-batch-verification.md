# Native composer and batch-entry verification

This is a focused desktop acceptance record for the active-session composer
Slash entry (`c132676`) and the sidebar batch-archive entry. The reference
placement comes from cc-haha's tracked `ChatInput.tsx` and `Sidebar.tsx`: a
composer `+` for nearby actions, and batch management beside sidebar search and
refresh. Hbar adapts the latter to reversible, Host-owned archive rather than
copying cc-haha's permanent delete.

## Native fixture and result

`scripts/verify-native-composer-batch.ts` launches a rebuilt debug Tauri window
with an isolated temporary `HBAR_HOME` and WebView2 profile. It never uses the
user's live desktop profile or a commercial model. It creates two temporary
Sessions, then checks these exact UI and Host facts:

- A nonempty active-session draft can open `+` → Slash, the menu is visible,
  Escape leaves the inserted `/` and draft intact, and no Run is submitted.
- At the physical 900px minimum desktop window width, two captured Session IDs
  can be selected, reviewed, and cancelled with zero archives.
- A second confirmation archives exactly those two Sessions; their history
  remains readable and both Run lists remain empty. No page error or horizontal
  overflow is observed.

The same script passed twice: first with the prior debug executable and freshly
built Web/Host resources, then after rebuilding the debug Tauri executable.
The final verification commands were:

```powershell
bun run build
& "C:\Users\HeJiahui\.codex\skills\using-vsdevcmd\scripts\Invoke-VsDevCommand.ps1" bun scripts/build-host.ts
& "C:\Users\HeJiahui\.codex\skills\using-vsdevcmd\scripts\Invoke-VsDevCommand.ps1" cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
bun scripts/verify-native-composer-batch.ts
```

All four commands exited 0. The Web build emitted an existing large-chunk
warning; Cargo emitted a deprecated user-level config-file warning. The native
build read the then-current, separately modified `Cargo.toml`; this record does
not attribute that unrelated manifest change to the interaction work or claim
that a release installer was built.

The [native 1440px Slash menu](../artifacts/native-composer-batch/active-slash-1440.png),
[900px selection](../artifacts/native-composer-batch/batch-selection-900.png),
and [900px confirmation](../artifacts/native-composer-batch/batch-confirmation-900.png)
were inspected visually. The Tauri main window has a 900px minimum inner width,
so 390/320px responsive behavior is evidenced separately by the production-Web,
real-Host `e2e/composer-add-menu.spec.ts` and
`e2e/session-archive-batch.spec.ts` screenshots; it is not described as a
physical native narrow-window test.

This is not a pass claim for the general `scripts/desktop-smoke.ts`, the full
repository suite, native file dialogs, or every cc-haha desktop control. The
general smoke script remains independently modified and was not used here. At
this verification point, root typecheck still exited 1 only on four missing
`children` props in the other task's
`tests/hbar-app-ui-onboarding-1-reference.test.tsx`; no composer, batch or native
verification-script error was reported. The focused runtime tests, browser
E2E, lint and production build are recorded with their respective feature
commits rather than inferred from this native result.
