# Composer execution menu: reference-aligned disclosure, 2026-09-27

The cc-haha `PermissionModeSelector` presents five compact rows above its
composer trigger, each with a short label and supporting line. Its original
component render at [1440](../artifacts/desktop-final-entry-audit/conversation/reference-execution-en-US-1440.png)
and [320](../artifacts/desktop-final-entry-audit/conversation/reference-execution-zh-CN-320.png)
is visual evidence of the hierarchy and narrow bottom-sheet layout. These
screenshots use a synthetic conversation, not the original Electron Host.

Hbar retains its own public semantics: four **next-send approval** choices
(Ask, Deny, Auto-approve, Host default) plus a **session-persistent Plan mode**.
The original five permission labels are not interchangeable with these Host
contracts. The earlier hbar menu had those five entries but repeated policy
explanations above and below them; at 320px the choices dominated a long sheet.

The current [English 1440](../artifacts/desktop-permission-density/after-en-US-1440.png)
and [Chinese 320](../artifacts/desktop-permission-density/after-zh-CN-320.png)
captures come from a production web bundle paired with an isolated temporary
Host. Default mode now puts the current Host default directly in its own row,
states the per-send approval scope once, and places Plan persistence in the
Plan row. The longer Plan lifecycle note appears when Plan is selected or its
state is unresolved, rather than taking space in the ordinary choice menu.
Risk confirmation for Auto-approve, Goal/Plan conflict recovery, unknown-write
reconciliation and the actual Host policy remain unchanged. Keyboard focus is
still visible as a contained outline instead of being clipped to two heavy
horizontal edges.

The maintained Host-backed test verifies the five actions remain available,
the ordinary default menu omits the repeated Plan lifecycle paragraph, the
Plan row is fully in view at 320×900, there is no horizontal overflow, and
the Host default is not mutated. Component tests cover both locales and
unresolved/recovery states. This evidence is browser/Host, not a physical
Tauri-window claim.
