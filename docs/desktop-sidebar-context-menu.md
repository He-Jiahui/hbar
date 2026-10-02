# Session-row context action parity

The CC desktop Sidebar at `e28d0a653481ef41b7a329411eeb2f0fd5656731` offers a right-click menu on each session row. The hbar row already had Rename/Archive behind its More trigger, but right-click had no matching shortcut. A real temporary-Host browser test at `299555fd` reproduced the missing menu before the change.

## Visible reference

`artifacts/sidebar-context-reference/cc-sidebar-context-menu-desktop-1440x900.png` and `cc-sidebar-context-menu-mobile-390x844.png` show the original CC `Sidebar.tsx` / `SidebarTaskList.tsx`, with in-memory synthetic session stores in an isolated Vite harness. They show the actual right-click Rename/Delete menu, not a full application or native-shell session. No Host/provider requests or real-user profile writes occurred. The metadata records that scope; unrelated harness icon-font crowding does not establish a defect in CC.

Root inspected these reference images and the actual hbar desktop/narrow captures. The menu is a true overlay with a short vertical action list and a visually distinct destructive action. The change reuses hbar's row-owned More menu rather than adding a separate action surface or copying screenshot coordinates. It keeps hbar's recoverable Archive lifecycle, not CC's Delete semantics, and anchors to the existing row action trigger rather than the pointer.

## Behavior

- Right-click, the Context Menu key and Shift+F10 open the same row-owned action menu without opening that conversation.
- The first enabled item receives focus; Escape uses the menu's existing close/focus-return behavior. Pointer interaction outside the menu closes it. Outside listeners are attached only while a row menu is open and released on close/unmount.
- Rename and Archive continue through the existing commands with the original row's workspace/session IDs. Batch selection, active rename editing and archive feedback do not gain a second action menu.
- The popup uses an opaque theme surface and removes decorative button edge indicators within this menu only. No global Lumen theme or native-shell styling was changed.

## Verification

The focused production-Web browser test passes in English 1440px and Chinese 390px: right-click, focus, Escape, Shift+F10, rename the non-active row, Host-confirmed title, outside dismissal, no horizontal overflow, no page errors, and preservation of the active conversation and its unsent draft. Screenshots: `artifacts/session-context-menu/{en-US,zh-CN}-open.png`.

The first regression run failed on the missing menu, as expected. Intermediate test failures were fixture assertion mistakes: the composer is contenteditable, and the narrow drawer correctly makes main content inert. The final test uses the existing composer-text assertion and includes hidden DOM only for retained-content checks; it does not claim hidden content is interactable.

Scoped strict TypeScript/ESLint, formatting/diff checks, content/icon guards, the changed stylesheet's flow-layout guard and production Web build passed. No native desktop build, dependency installation or paid model call was performed. This is a completed session-row entrance improvement, not completion of the overall desktop migration.
