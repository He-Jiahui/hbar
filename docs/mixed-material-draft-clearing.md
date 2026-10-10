# Clear accepted mixed-material drafts

## Symptom and cause

After selecting a file and then a photo, an accepted Run left the original text
and attachment previews in the composer. A later Send could repeat them. The
reverse intake order happened to clear correctly.

The draft preserves intake order, but the public Run input groups `images` before
`files`. Its acknowledgement matcher compared attachment identities by index.
`git show ed2f07d3 -- packages/app-runtime/src/drafts.ts` confirms that this
order-dependent match originated in the command-owned draft implementation;
`84f91b7e` retained it when attachment intake was expanded. The first-send work
at `27a38f1c` / `2b3e90c1` exposed the same existing mismatch by transferring the
original intake order into the real Session draft. The prior browser checks
asserted accepted Run contents but missed the final Session composer state.

The matcher now compares sorted attachment identity keys (`kind` and artifact
ID), keeping exact counts and text matching. The existing captured revision check
still prevents an acknowledgement from clearing newer user edits. This does not
reorder the displayed draft or change the Run wire contract.

## Verification

- Before the fix, the new normal-flow test failed for file-then-image and passed
  for image-then-file; the accepted receipt was present in both cases.
- After the fix: attachment Runtime and workspace-boundary tests passed,
  **16 tests / 79 assertions**, including the existing late-upload/new-generation
  protection.
- Production Web + temporary real Host: **2/2 first-send tests passed**, each in
  English and Chinese, covering Plan and Goal with mixed file/photo materials.
  Assertions now include the empty real Session composer and removed draft chips
  after acceptance, in addition to the one-Run and artifact-identity checks.
- Scoped strict TypeScript, ESLint and Prettier passed. No native build or paid
  model call was made; the provider is the local fixture.

The verified production bundle is `artifacts/mixed-material-draft/web`, with
`index-DfoZ8U7d.js` and `index-CNnIh6g1.css`. The test accepts an optional capture
directory so these regression captures do not overwrite the earlier photo UI
evidence. Root visually inspected
`the narrow accepted Goal state`（历史产物未随当前仓库提供；原路径：`../artifacts/mixed-material-draft/accepted-goal-zh-CN-320.png`）:
the response remains in history and the composer is ready for new input without
the sent attachment tiles. This regression fix does not claim new visual parity
or a native Tauri/file-dialog acceptance run.
