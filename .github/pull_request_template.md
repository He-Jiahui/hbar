## Summary

<!-- What changed, why now, and what user-visible behavior or internal contract changes? -->

## Scope

- [ ] Web / React workbench
- [ ] Host / protocol / Client SDK
- [ ] Kernel / storage / recovery
- [ ] Desktop
- [ ] Plugin SDK or plugin
- [ ] Documentation / Wiki / CI

## Verification

<!-- List commands actually run and their results. Explain a skipped check rather than marking it as passed. -->

- [ ] `bun run check`
- [ ] `bun run build`
- [ ] `bun run check:docs` (when docs or Wiki changed)
- [ ] Relevant E2E, desktop smoke, contract, or manual verification:

## Compatibility, risk, and rollback

<!-- Cover migrations, protocol compatibility, permissions, data/recovery behavior, known gaps, and a safe rollback path. -->

## Review checklist

- [ ] This PR has one focused purpose and does not include unrelated formatting or generated files.
- [ ] Production behavior changes include same-area tests, or the reason is documented above.
- [ ] No credentials, device pairing data, local runtime data, or sensitive logs are included.
- [ ] I updated the relevant documentation and Wiki pages when user-facing behavior or public contracts changed.
