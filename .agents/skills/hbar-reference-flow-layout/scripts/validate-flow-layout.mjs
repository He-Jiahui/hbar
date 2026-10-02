/* global Bun, console, process */

const coordinateProperties = new Set([
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-block',
  'inset-inline',
  'inset-block-start',
  'inset-block-end',
  'inset-inline-start',
  'inset-inline-end',
  'transform',
])

const spacingProperties = new Set([
  'padding',
  'padding-block',
  'padding-block-end',
  'padding-block-start',
  'padding-inline',
  'padding-inline-end',
  'padding-inline-start',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'margin',
  'margin-block',
  'margin-block-end',
  'margin-block-start',
  'margin-inline',
  'margin-inline-end',
  'margin-inline-start',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'gap',
  'row-gap',
  'column-gap',
])

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length
}

function parseRules(source) {
  const rules = []
  const stack = []
  let headerStart = 0
  let inComment = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]
    if (!inComment && character === '/' && next === '*') {
      inComment = true
      index += 1
      continue
    }
    if (inComment && character === '*' && next === '/') {
      inComment = false
      index += 1
      continue
    }
    if (inComment) continue

    if (character === '{') {
      const selector = source
        .slice(headerStart, index)
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')
        .trim()
      stack.push({ selector, bodyStart: index + 1, startLine: lineNumber(source, headerStart) })
      headerStart = index + 1
      continue
    }
    if (character !== '}') continue

    const rule = stack.pop()
    if (rule && !rule.selector.startsWith('@')) {
      rules.push({ selector: rule.selector, body: source.slice(rule.bodyStart, index), startLine: rule.startLine })
    }
    headerStart = index + 1
  }
  return rules
}

function isOverlaySelector(path, selector) {
  // Mobile 2/3/4/5 cached iframe states confirm phone-owned quick actions,
  // floating dock/FAB, a More sheet and Navigation drawer. Only these containers
  // may float; all menu choices and content remain in normal flex flow.
  if (/packages\/lumen-app-ui\/src\/mobile\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-mobile-floating',
      '.lumen-mobile-home-dock',
      '.lumen-mobile-action-layer',
      '.lumen-mobile-action-backdrop',
      '.lumen-mobile-more-layer',
      '.lumen-mobile-menu',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // Navbar 3/4/6/10/14 public iframe evidence confirms trigger-owned menus,
  // search results and a canvas-covering documentation drawer. Only containers
  // may float; their buttons, headings and article content stay in flex flow.
  if (/packages\/lumen-app-ui\/src\/navbar\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-navbar-menu',
      '.lumen-navbar-search-results',
      '.lumen-navbar-drawer-layer',
      '.lumen-navbar-drawer-backdrop',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // Prompt Input 1 model evidence shows the menu above the toolbar trigger.
  // Other bounded choice menus reuse that observed container, never float their options.
  if (/packages\/lumen-app-ui\/src\/prompt-input\/primitives\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-prompt-reference-choice-menu',
      ".lumen-prompt-reference-choice-menu[data-anchor='above']",
      ".lumen-prompt-reference-choice-menu[data-anchor='below']",
    ])
    if (overlays.has(selector.trim())) return true
  }
  // AI Chat 4/9: cached model lists overlap messages below/above their trigger.
  // The exception covers only the listbox container, never its options or anchor.
  if (/packages\/lumen-app-ui\/src\/ai-chat\/primitives\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-ai-chat-reference-model-menu',
      ".lumen-ai-chat-reference-model-menu[data-anchor='above']",
      ".lumen-ai-chat-reference-model-menu[data-anchor='below']",
    ])
    if (overlays.has(selector.trim())) return true
  }
  // Integrations 5: the captured Workspace listbox overlaps the permission list.
  // Only its trigger-anchored container floats; the card and options stay in flow.
  if (
    /packages\/lumen-app-ui\/src\/integrations\/reference-consent\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-integration-consent-reference-workspace-menu'
  )
    return true
  // The Session More tools menu is a trigger-anchored top-layer overlay;
  // captured in artifacts/session-tools-menu-v13/zh-tools-*.png. Rows remain flex.
  if (
    /packages\/app-react\/src\/session-tools-menu\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-session-tools-menu-popover:popover-open'
  )
    return true
  // CC-haha Sidebar's observed Projects and Sessions header menu and sort flyout
  // are measured from their owning trigger/row; only the two top-layer containers overlay.
  if (/packages\/app-react\/src\/workspace-header-sort-menu\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.hbar-app-react-workspace-header-menu-popover:popover-open',
      '.hbar-app-react-workspace-sort-submenu:popover-open',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // CC WorkspacePanel's observed selected-text action floats beside a DOM Range.
  // Evidence: artifacts/file-selection-reference/*-source-selection-menu.png;
  // only this measured menu container floats, not source rows or comment content.
  if (
    /packages\/app-react\/src\/file-context-surfaces\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-file-selection-menu'
  )
    return true
  // CC MessageList's original selected-message action floats beside the selection.
  // Evidence: artifacts/chat-selection-reference/*-menu.png. Only this exact
  // measured menu container overlays; message bodies, action text and cards flow.
  if (
    /packages\/app-react\/src\/conversation-selection\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-conversation-selection-menu'
  )
    return true
  // Forms 5: the observed data-region options list overlays the plan cards.
  // Only the listbox container floats; the options and surrounding form stay in flow.
  if (
    /packages\/lumen-app-ui\/src\/forms-5-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-forms-5-region-options'
  )
    return true
  // Forms 8: the live rule editor's condition/operator option list overlays
  // sibling condition rows beneath its picker trigger; option content itself flows.
  if (
    /packages\/lumen-app-ui\/src\/forms-8-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-forms-8-options'
  )
    return true
  // Forms 10: the property combobox's old-hash interaction evidence adds the
  // option list without changing the owning preview height. Only its anchored
  // listbox container overlays; the options and questionnaire remain in flow.
  if (
    /packages\/lumen-app-ui\/src\/forms-10-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-forms-10-property-options'
  )
    return true
  // Forms 11: the observed Region combobox menu overlays the dialog body;
  // only this anchored listbox container floats above the flowing fields.
  if (
    /packages\/lumen-app-ui\/src\/forms-11-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-forms-11-region-options'
  )
    return true
  // Settings Form 4: the observed member action menu overlays its trigger row.
  // Only the anchored menu container floats; member content and menu choices flow.
  if (
    /packages\/lumen-app-ui\/src\/settings-form-4-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-settings-form-4-menu'
  )
    return true
  // Comments 6: numbered review pins overlay their owning diagram canvas.
  // Only these data-positioned markers float; artwork and comment text use flow.
  if (
    /packages\/lumen-app-ui\/src\/comments-canvas-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-comments-canvas-pin'
  )
    return true
  // Comments 4: the rendered @ suggestion list is anchored to the composer
  // and overlaps earlier messages. Only its container, not option content, floats.
  if (
    /packages\/lumen-app-ui\/src\/comments-composer-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-comments-composer-mention-menu'
  )
    return true
  // Kanban 4: the narrow detail sheet has a real board-covering close backdrop.
  if (
    /packages\/lumen-app-ui\/src\/kanban-detail-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-kanban-detail-backdrop'
  )
    return true
  // cc-haha AttachmentGallery.tsx:235/286: only the sibling remove control
  // overlays the image corner; captions, status and retry remain normal flow.
  if (
    /packages\/lumen-app-ui\/src\/image-gallery\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-image-tile > .lumen-image-tile-remove-overlay'
  )
    return true
  // cc-haha Files: the five-scope context menu overlays its triggering preview tab.
  // See docs/desktop-file-preview-reference-audit.md; only the container is positioned.
  if (
    /packages\/app-react\/src\/file-preview-tabs\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-file-preview-menu-popover'
  )
    return true
  // Authentication 1: the reference's password reveal control sits inside the input bounds.
  if (
    /packages\/lumen-app-ui\/src\/authentication-sign-in-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-auth-sign-in-surface .hbar-app-ui-auth-input-wrap > .hbar-app-ui-auth-icon-button'
  )
    return true
  // Authentication 4: password visibility is the one observed control overlaid within its input.
  if (
    /packages\/lumen-app-ui\/src\/authentication-two-step-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() ===
      '.hbar-app-ui-auth-two-step-surface .hbar-app-ui-auth-input-wrap > .hbar-app-ui-auth-icon-button'
  )
    return true
  // Notifications 6: only the observed trigger-anchored popover and its badge overlap the flowing header.
  if (
    /packages\/lumen-app-ui\/src\/notifications-bell-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-notifications-variant-6 .lumen-bell-popover'
  )
    return true
  // Notifications 6: the observed unread count overlaps only its owning bell trigger.
  if (
    /packages\/lumen-app-ui\/src\/notifications-bell-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-notifications-variant-6 .lumen-notifications-bell > button > .lumen-bell-badge'
  )
    return true
  // Notifications 4: Snooze opens a trigger-anchored menu over the flowing
  // detail pane. Only its container is positioned; menu choices stay in flex.
  if (
    /packages\/lumen-app-ui\/src\/notifications-activity-reference\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-notifications-variant-4 .lumen-activity-menu'
  )
    return true
  // App Dialog 7: the scrim, trigger-anchored dialog/submenu and action result
  // demonstrably float above the centered trigger and flowing menu rows.
  if (/packages\/lumen-app-ui\/src\/app-dialog-menu-reference\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = [
      '.lumen-app-dialog-reference-menu-scrim',
      '.lumen-app-dialog-reference-menu-dialog',
      '.lumen-app-dialog-reference-submenu',
      '.lumen-app-dialog-reference-menu-result',
    ]
    if (selector.split(',').every((part) => overlays.some((name) => part.trim().endsWith(name)))) return true
  }
  // App Dialog 6: only the post-action result toast floats over the edge drawer.
  if (
    /packages\/lumen-app-ui\/src\/app-dialog-evidence\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-app-dialog-evidence-toast'
  )
    return true
  // App Dialog 5: the reference guards unsaved changes with a modal scrim
  // and shows a result toast after the drawer closes; their contents flow.
  if (/packages\/lumen-app-ui\/src\/app-dialog-alert\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set(['.lumen-app-dialog-alert-guard-backdrop', '.lumen-app-dialog-alert-toast'])
    if (overlays.has(selector.trim())) return true
  }
  // App Dialog 4: completion toast floats over the canvas after the wizard closes.
  if (
    /packages\/lumen-app-ui\/src\/app-dialog-wizard\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-dialog-wizard-toast'
  )
    return true
  // App Dialog 3: success feedback floats over the empty canvas after submit.
  if (
    /packages\/lumen-app-ui\/src\/app-dialog-invite\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-dialog-invite-toast'
  )
    return true
  // App Dialog 2: the observed destructive-action result floats over the
  // canvas after the modal closes; all panel content remains in flex flow.
  if (
    /packages\/lumen-app-ui\/src\/app-dialog-delete\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-dialog-delete-toast'
  )
    return true
  // App Dialog 1: confirmation feedback floats over the now-empty canvas.
  if (
    /packages\/lumen-app-ui\/src\/app-dialog-plan\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-app-ui-dialog-plan-toast'
  )
    return true
  // App Sidebar 7: the narrow-only scrim and drawer overlay the blank
  // application canvas; navigation, help, and profile remain in flex flow.
  if (/packages\/lumen-app-ui\/src\/app-sidebar-full\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set(['.lumen-full-scrim', '.lumen-full-dialog'])
    if (overlays.has(selector.trim())) return true
  }
  // App Sidebar 6: the scrim covers the preview, with the observed drawer
  // anchored at its left edge; the drawer's internal content remains in flow.
  if (/packages\/lumen-app-ui\/src\/app-sidebar-drawer\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set(['.lumen-drawer-scrim', '.lumen-drawer-panel'])
    if (overlays.has(selector.trim())) return true
  }
  // App Sidebar 5: a row's More button opens a trigger-anchored action menu
  // over later document rows. The menu contents themselves remain in flex flow.
  if (
    /packages\/lumen-app-ui\/src\/app-sidebar-tree\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-tree-menu'
  )
    return true
  // App Sidebar 3: the workspace radio menu overlays the search and navigation below its switcher.
  if (
    /packages\/lumen-app-ui\/src\/app-sidebar-workspace\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-workspace-menu'
  )
    return true
  // App Sidebar 2: hover flyouts and the account menu anchor to their icon buttons.
  if (/packages\/lumen-app-ui\/src\/app-sidebar-rail\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-rail-flyout',
      '.lumen-rail-account-menu',
      '.lumen-rail-navigation .lumen-rail-flyout',
      '.lumen-rail-navigation.is-long .lumen-rail-flyout',
      '.lumen-rail-footer-item .lumen-rail-flyout',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Sidebar 1: the account menu is anchored above its profile trigger;
  // the narrow navigation dialog and backdrop cover the blank preview canvas.
  if (/packages\/lumen-app-ui\/src\/app-sidebar-primary\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set(['.lumen-primary-account-menu', '.lumen-primary-drawer-layer', '.lumen-primary-backdrop'])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 9: observed model-trigger menu, narrow navigation drawer/backdrop,
  // the visually hidden Expand control at the model trigger, and the composer
  // label overlaying its native textarea without altering flow.
  if (/packages\/lumen-app-ui\/src\/app-shell-chat\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-chat-model-menu',
      '.lumen-chat-drawer-layer',
      '.lumen-chat-backdrop',
      '.lumen-shell-chat-composer',
      '.lumen-chat-field-label',
      '.lumen-shell-chat-header',
      '.lumen-chat-expand',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 8: observed mobile queue drawer/backdrop, anchored bottom navigation
  // and the follow-up action covering the card's top-right corner.
  if (/packages\/lumen-app-ui\/src\/app-shell-adaptive\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-adaptive-drawer-layer',
      '.lumen-adaptive-backdrop',
      '.lumen-adaptive-flag',
      '.lumen-adaptive-bottom-nav',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 7: observed scope/status/account popovers, navigation backdrop and scroll fades.
  if (/packages\/lumen-app-ui\/src\/app-shell-scope\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-scope-sr-only',
      '.lumen-scope-menu',
      '.lumen-scope-status-popover',
      '.lumen-scope-account-menu > .lumen-scope-menu',
      '.lumen-scope-overlay',
      '.lumen-scope-backdrop',
      '.lumen-scope-scroll-frame::before',
      '.lumen-scope-scroll-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 6: observed trigger-relative menus and document drawer/backdrop only.
  if (/packages\/lumen-app-ui\/src\/app-shell-documents\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-documents-menu',
      '.lumen-documents-more-formatting > .lumen-documents-menu',
      '.lumen-documents-overlay',
      '.lumen-documents-backdrop',
      '.lumen-documents-scroll-frame::before',
      '.lumen-documents-scroll-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 5: observed mailbox drawer, trigger-relative menu/tooltips and decorative markers.
  if (/packages\/lumen-app-ui\/src\/app-shell-inbox\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-inbox-overlay',
      '.lumen-inbox-backdrop',
      '.lumen-inbox-drawer',
      '.lumen-inbox-menu',
      '.lumen-inbox-tooltip',
      '.lumen-inbox-rail-dot',
      '.lumen-inbox-search-icon',
      '.lumen-inbox-scroll-frame::before',
      '.lumen-inbox-scroll-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // cc-haha ComposerDropOverlay covers only its owning input; text remains in flex flow.
  if (
    /packages\/app-react\/src\/composer-attachments\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-composer-attachment-drop-overlay'
  )
    return true
  // cc-haha FileSearchMenu: the composer-width suggestion menu overlays only its owning editor.
  if (
    /packages\/app-react\/src\/composer-mention-editor\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-composer-mention-menu'
  )
    return true
  // cc-haha ChatInput plus menu: only the two-choice panel overlays its composer trigger.
  if (
    /packages\/app-react\/src\/composer-add-menu\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-composer-add-popover'
  )
    return true
  // cc-haha TabBar context menu: only the observed trigger-anchored top-layer container.
  if (
    /packages\/app-react\/src\/workspace-tabs\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-workspace-tab-menu-popover(?::popover-open)?$/.test(selector.trim())
  )
    return true
  // Narrow shell navigation: only the trigger-anchored overlay container floats;
  // its sections and buttons stay in normal flow.
  if (
    /packages\/app-react\/src\/mobile-header-menu\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-mobile-header-menu-content'
  )
    return true
  // cc-haha PermissionModeSelector: composer-trigger overlay / narrow bottom sheet.
  // Goal/Plan mutual-exclusion recovery uses the same observed trigger-owned
  // dialog relationship; its explanation and actions remain in normal flow.
  if (
    /packages\/app-react\/src\/composer-intent-blocked\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-composer-intent-blocked-popover(?::popover-open|::backdrop)?$/.test(selector.trim())
  )
    return true
  // Only this evidenced top-layer container; its option and confirmation content stays in flex flow.
  if (
    /packages\/app-react\/src\/composer-permission-picker\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-composer-permission-popover(?::popover-open|::backdrop)?$/.test(selector.trim())
  )
    return true
  // Reference ContextUsageIndicator: trigger-anchored read-only usage overlay / narrow bottom sheet.
  if (
    /packages\/app-react\/src\/session-usage-control\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-session-usage-popover(?::popover-open|::backdrop)?$/.test(selector.trim())
  )
    return true
  // cc-haha original-component evidence: composer model/effort anchored popovers;
  // only the Web model menu becomes a bottom sheet on narrow screens.
  if (
    /packages\/app-react\/src\/composer-model-picker\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-composer-picker-popover(?::popover-open|::backdrop|\[data-kind='thinking'\]|\[data-kind='model'\]\[data-presentation='web'\](?:::backdrop)?)?$/.test(
      selector.trim(),
    )
  )
    return true
  // cc-haha EmptySession model selector: only the no-tab composer's
  // trigger-owned desktop popup / narrow bottom-sheet container floats.
  if (
    /packages\/app-react\/src\/pre-session-choice-picker\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-pre-session-choice-popover(?::popover-open|::backdrop|\[data-presentation='web'\](?:::backdrop)?)?$/.test(
      selector.trim(),
    )
  )
    return true
  // cc-haha Location: only the observed trigger overlay / narrow bottom-sheet shell floats.
  if (
    /packages\/app-react\/src\/pre-session-location-picker\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-pre-session-location-popover(?::popover-open|::backdrop)?$/.test(selector.trim())
  )
    return true
  // cc-haha AgentManager uses the shared trigger-anchored model selector.
  // Only hbar's top-layer Agent model menu, never its flowing options, floats.
  if (
    /packages\/app-react\/src\/agent-model-picker\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-agent-model-popover:popover-open'
  )
    return true
  // App Shell 1: observed drawer/backdrop, footer-anchored account menu and pane-edge fades.
  // Only these containers may overlay; content descendants still require normal flow.
  if (/packages\/lumen-app-ui\/src\/app-shell-sidebar\.css$/.test(path.replaceAll('\\', '/'))) {
    const containers = new Set([
      '.lumen-sidebar-overlay',
      '.lumen-sidebar-backdrop',
      '.lumen-sidebar-mobile',
      '.lumen-sidebar-account-menu',
      '.lumen-sidebar-nav-frame::after',
      '.lumen-sidebar-main-frame::after',
    ])
    if (selector.split(',').every((part) => containers.has(part.trim()))) return true
  }
  // App Shell 2: observed mobile navigation, workspace menu and scroll-edge fades.
  if (/packages\/lumen-app-ui\/src\/app-shell-rail\.css$/.test(path.replaceAll('\\', '/'))) {
    const containers = new Set([
      '.lumen-rail-overlay',
      '.lumen-rail-backdrop',
      '.lumen-rail-mobile',
      '.lumen-rail-workspace-menu',
      '.lumen-rail-nav-frame::after',
      '.lumen-rail-main-frame::after',
    ])
    if (selector.split(',').every((part) => containers.has(part.trim()))) return true
  }
  // App Shell 3: observed drawer, account menu, scroll-edge fades and decorative search adornments.
  if (/packages\/lumen-app-ui\/src\/app-shell-contracts\.css$/.test(path.replaceAll('\\', '/'))) {
    const containers = new Set([
      '.lumen-contracts-overlay',
      '.lumen-contracts-backdrop',
      '.lumen-contracts-drawer',
      '.lumen-contracts-account-menu',
      '.lumen-contracts-nav-frame::after',
      '.lumen-contracts-main-frame::after',
      '.lumen-contracts-search-field > svg',
      '.lumen-contracts-search-field kbd',
    ])
    if (selector.split(',').every((part) => containers.has(part.trim()))) return true
  }
  // App Shell 4: navigation overlay and observed decorative date/event/scroll markers only.
  if (/packages\/lumen-app-ui\/src\/app-shell-editorial\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-editorial-overlay',
      '.lumen-editorial-backdrop',
      '.lumen-editorial-drawer',
      '.lumen-editorial-date-dot',
      '.lumen-editorial-event-line',
      '.lumen-editorial-main-frame::after',
      '.lumen-editorial-agenda-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // Plan 6's main scroll pane has observed pointer-transparent edge fades.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-summary\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-summary-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // Plan 5 has observed fades for the stacked board and each wide-screen column.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-board\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-board-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // Plan 4's main scroll region has the same observed pointer-transparent fades.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-actual\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-actual-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // Plan 3 has pointer-transparent fades above and below its ul-owned scroll area.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-tree\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-tree-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // Plan 2 uses the same observed pair around its div-owned scroll area.
  if (
    /packages\/lumen-app-ui\/src\/plan-review\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-review-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // The rendered Plan 1 scroll frame has two pointer-transparent edge fades.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-checklist\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-app-ui-agent-plan-checklist-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(
      selector.trim(),
    )
  )
    return true
  // Live Agent Approval 1 has two pointer-transparent scroll-edge fades.
  // Allow only those containers in their owning file, never their descendants.
  if (
    /packages\/lumen-app-ui\/src\/agent-approval\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-app-ui-agent-approval-scroll-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(
      selector.trim(),
    )
  ) {
    return true
  }
  if (/hbar-app-ui-(?:dialog-backdrop|dialog-menu|app-sidebar-drawer|app-tool-drawer)(?:[\s.:#>+~]|$)/.test(selector)) {
    return true
  }
  if (!/packages\/lumen-app-ui\/src\/(?:materials|primitives)\.module\.css$/.test(path.replaceAll('\\', '/'))) {
    return (
      /packages\/lumen-app-ui\/src\/forms\.css$/.test(path.replaceAll('\\', '/')) &&
      /(?:^|,)\s*\.lumen-(?:combobox-popup|checkbox-input|toggle-input)(?:[\s[:.#>+~]|$)/.test(selector)
    )
  }
  return /(?:^|,)\s*(?:\.surface\s*>\s*\.indicator|\.field\s*>\s*\.indicator|\.button\s*>\s*\[data-edge|\.iconButton\s*>\s*\[data-edge|\.glass|\.filter|\.halo)(?:[=\]\s[:.#>+~]|$)/.test(
    selector,
  )
}

function validateCss(path, source) {
  const errors = []
  for (const rule of parseRules(source)) {
    const isOverlay = isOverlaySelector(path, rule.selector)
    const lines = rule.body.split(/\r?\n/)
    for (const [offset, rawLine] of lines.entries()) {
      const match = rawLine.match(/^\s*([a-z-]+)\s*:\s*([^;]+);/)
      if (!match) continue
      const [, property, value] = match
      const location = `${path}:${rule.startLine + offset}`
      // The Pro preferences matrix has a real sticky label strip over its own scrolling rows.
      // Permit only its zero vertical anchor, not absolute positioning or arbitrary offsets.
      const isObservedStickyColumns =
        ((/packages\/lumen-app-ui\/src\/notifications-preferences-reference\.css$/.test(path.replaceAll('\\', '/')) &&
          rule.selector.trim() === '.hbar-app-ui-notifications-variant-3 .lumen-preferences-columns') ||
          (/packages\/lumen-app-ui\/src\/kanban-swimlanes-reference\.css$/.test(path.replaceAll('\\', '/')) &&
            rule.selector.trim() === '.hbar-app-ui-kanban-swimlane-stages')) &&
        /(?:^|\n)\s*position:\s*sticky;/.test(rule.body) &&
        property === 'inset-block-start' &&
        value.trim() === '0'
      // The captured table previews have sticky table headers; capacity also has
      // a sticky first column inside its horizontal scroll pane. Only zero anchors
      // on those exact selectors are permitted, never ordinary content offsets.
      const tableStickyVertical = new Set(['.lumen-data-table thead th', '.lumen-data-table-reference-scroll thead th'])
      const tableStickyHorizontal = new Set([
        '.lumen-data-table-wide tbody th',
        '.lumen-data-table-wide thead th:first-child',
        '.hbar-app-ui-table-variant-8 .lumen-data-table-reference-scroll tbody th',
        '.hbar-app-ui-table-variant-8 .lumen-data-table-reference-scroll thead th:first-child',
      ])
      const tableStickySelectors = rule.selector.split(',').map((selector) => selector.trim())
      const isObservedTableSticky =
        /packages\/lumen-app-ui\/src\/data-table\.css$/.test(path.replaceAll('\\', '/')) &&
        /(?:^|\n)\s*position:\s*sticky;/.test(rule.body) &&
        value.trim() === '0' &&
        ((property === 'inset-block-start' &&
          tableStickySelectors.every((selector) => tableStickyVertical.has(selector))) ||
          (property === 'inset-inline-start' &&
            tableStickySelectors.every((selector) => tableStickyHorizontal.has(selector))))
      if (coordinateProperties.has(property) && !isOverlay && !isObservedStickyColumns && !isObservedTableSticky) {
        errors.push(`${location}: ${property} is reserved for a real overlay container; use flex flow for content.`)
      }
      const isShellAccessibleText =
        ((/packages\/lumen-app-ui\/src\/app-shell-sidebar\.css$/.test(path.replaceAll('\\', '/')) &&
          rule.selector.trim() === '.lumen-sidebar-sr') ||
          (/packages\/lumen-app-ui\/src\/app-shell-contracts\.css$/.test(path.replaceAll('\\', '/')) &&
            rule.selector.trim() === '.lumen-contracts-sr') ||
          (/packages\/lumen-app-ui\/src\/app-shell-editorial\.css$/.test(path.replaceAll('\\', '/')) &&
            rule.selector.trim() === '.lumen-editorial-sr') ||
          (/packages\/lumen-app-ui\/src\/app-shell-inbox\.css$/.test(path.replaceAll('\\', '/')) &&
            rule.selector.trim() === '.lumen-inbox-sr')) &&
        /clip-path:\s*inset\(50%\)/.test(rule.body) &&
        value.trim() === 'absolute'
      if (property === 'position' && /\b(?:absolute|fixed)\b/.test(value) && !isOverlay && !isShellAccessibleText) {
        errors.push(
          `${location}: ${value.trim()} positioning is reserved for a real overlay container; use flex flow for content.`,
        )
      }
      if (property === 'display' && /\b(?:inline-)?grid\b/.test(value)) {
        errors.push(`${location}: ${value.trim()} uses CSS Grid; use flex flow for ordinary content.`)
      }
      if (/^grid(?:-|$)/.test(property)) {
        errors.push(`${location}: ${property} is a CSS Grid declaration; use flex flow for ordinary content.`)
      }
      if (/\b\d+(?:\.\d+)?px\b/.test(value) && !spacingProperties.has(property)) {
        errors.push(
          `${location}: ${property} contains a px value outside spacing; use rem, em, percentages, or intrinsic sizing.`,
        )
      }
    }
  }
  return errors
}

const inputPaths = Bun.argv.slice(2)
if (inputPaths.length === 1 && inputPaths[0] === '--self-test') {
  const mobilePath = 'packages/lumen-app-ui/src/mobile.css'
  for (const selector of [
    '.lumen-mobile-floating',
    '.lumen-mobile-home-dock',
    '.lumen-mobile-action-layer',
    '.lumen-mobile-action-backdrop',
    '.lumen-mobile-more-layer',
    '.lumen-mobile-menu',
  ]) {
    const overlay = `${selector} {\nposition: absolute;\ninset: 0;\n}`
    if (validateCss(mobilePath, overlay).length || validateCss('other.css', overlay).length !== 2)
      throw new Error('Mobile overlay exceptions must remain exact and path scoped')
    if (validateCss(mobilePath, `${selector} > button {\nposition: absolute;\n}`).length !== 1)
      throw new Error('Mobile overlay choices must remain in normal flow')
  }
  if (validateCss(mobilePath, '.lumen-mobile-card {\nposition: absolute;\ninset: 0;\n}').length !== 2)
    throw new Error('Mobile ordinary cards must not inherit overlay exceptions')
  const navbarPath = 'packages/lumen-app-ui/src/navbar.css'
  for (const selector of [
    '.lumen-navbar-menu',
    '.lumen-navbar-search-results',
    '.lumen-navbar-drawer-layer',
    '.lumen-navbar-drawer-backdrop',
  ]) {
    const overlay = `${selector} {\nposition: absolute;\ninset: 0;\n}`
    if (validateCss(navbarPath, overlay).length || validateCss('other.css', overlay).length !== 2)
      throw new Error('Navbar overlay exceptions must remain exact and path scoped')
    if (validateCss(navbarPath, `${selector} > button {\nposition: absolute;\n}`).length !== 1)
      throw new Error('Navbar overlay options must remain in normal flow')
  }
  if (validateCss(navbarPath, '.hbar-app-ui-navbar-landing > main {\nposition: absolute;\ninset: 0;\n}').length !== 2)
    throw new Error('Navbar ordinary content must not inherit the overlay exception')
  const promptPath = 'packages/lumen-app-ui/src/prompt-input/primitives.css'
  const promptMenu = '.lumen-prompt-reference-choice-menu { position: absolute; inset-block-end: 100%; }'
  if (validateCss(promptPath, promptMenu).length || !validateCss('other.css', promptMenu).length)
    throw new Error('Prompt choice overlay must be exact and path-scoped')
  if (!validateCss(promptPath, '.lumen-prompt-reference-choice-menu > button { position: absolute; left: 0; }').length)
    throw new Error('Prompt choice options must remain in flow')
  const aiChatPath = 'packages/lumen-app-ui/src/ai-chat/primitives.css'
  const aiChatMenuCss =
    ".lumen-ai-chat-reference-model-menu { position: absolute; inset-inline-start: 0; } .lumen-ai-chat-reference-model-menu[data-anchor='above'] { inset-block-end: 100%; }"
  if (validateCss(aiChatPath, aiChatMenuCss).length)
    throw new Error('Observed AI Chat trigger-relative model overlay must be accepted')
  if (!validateCss('other/primitives.css', aiChatMenuCss).length)
    throw new Error('AI Chat model overlay must remain path scoped')
  if (!validateCss(aiChatPath, '.lumen-ai-chat-reference-model-menu > button { position: absolute; left: 0; }').length)
    throw new Error('AI Chat option content must remain in flow')
  const consentPath = 'packages/lumen-app-ui/src/integrations/reference-consent.css'
  const consentMenu = '.lumen-integration-consent-reference-workspace-menu'
  const consentOverlay = `${consentMenu} {\nposition: absolute;\ninset-block-start: 100%;\n}`
  if (validateCss(consentPath, consentOverlay).length !== 0)
    throw new Error('Observed Workspace listbox overlay must be accepted')
  if (validateCss('other.css', consentOverlay).length < 2)
    throw new Error('Workspace overlay allowance must remain path scoped')
  if (validateCss(consentPath, `${consentMenu} > button {\nposition: absolute;\n}`).length !== 1)
    throw new Error('Workspace option content must remain in flow')
  const sessionToolsMenuPath = 'packages/app-react/src/session-tools-menu.css'
  const sessionToolsMenu =
    '.hbar-session-tools-menu-popover:popover-open {\nposition: fixed;\ninset: auto;\ntop: 0;\nleft: 0;\n}'
  if (
    validateCss(sessionToolsMenuPath, sessionToolsMenu).length ||
    validateCss('other.css', sessionToolsMenu).length === 0 ||
    validateCss(sessionToolsMenuPath, sessionToolsMenu.replace(':popover-open {', '> button {')).length === 0
  )
    throw new Error('Session tools menu overlay exception must be exact, path-scoped and exclude rows')
  const workspaceSortMenuPath = 'packages/app-react/src/workspace-header-sort-menu.css'
  const workspaceSortMenuPopovers = `.hbar-app-react-workspace-header-menu-popover:popover-open,
.hbar-app-react-workspace-sort-submenu:popover-open {
position: fixed;
inset: auto;
top: 0;
left: 0;
}`
  if (
    validateCss(workspaceSortMenuPath, workspaceSortMenuPopovers).length ||
    validateCss('other.css', workspaceSortMenuPopovers).length === 0 ||
    validateCss(
      workspaceSortMenuPath,
      workspaceSortMenuPopovers.replace('workspace-sort-submenu:popover-open', 'workspace-sort-submenu > button'),
    ).length === 0
  )
    throw new Error('Workspace sort overlays must remain path-scoped containers and exclude their menu items')

  const selectionMenuPath = 'packages/app-react/src/file-context-surfaces.css'
  const selectionMenu = '.hbar-file-selection-menu {\nposition: fixed;\nleft: 0;\n}'
  if (
    validateCss(selectionMenuPath, selectionMenu).length ||
    validateCss('other.css', selectionMenu).length === 0 ||
    validateCss(selectionMenuPath, selectionMenu.replace('selection-menu {', 'selection-menu button {')).length === 0
  )
    throw new Error('Source selection overlay exception must remain exact, path-scoped and exclude menu content')
  const conversationSelectionPath = 'packages/app-react/src/conversation-selection.css'
  const conversationSelectionMenu = '.hbar-conversation-selection-menu {\nposition: fixed;\nleft: 0;\n}'
  if (
    validateCss(conversationSelectionPath, conversationSelectionMenu).length ||
    validateCss('other.css', conversationSelectionMenu).length === 0 ||
    validateCss(
      conversationSelectionPath,
      conversationSelectionMenu.replace('selection-menu {', 'selection-menu button {'),
    ).length === 0
  )
    throw new Error('Conversation selection overlay exception must remain exact, path-scoped and exclude menu content')
  const settingsForm4Menu = `.lumen-settings-form-4-menu {
position: absolute;
inset-block-start: calc(100% + 0.25rem);
inset-inline-end: 0;
}`
  const settingsForm4MenuPath = 'hbar-ui/packages/lumen-app-ui/src/settings-form-4-reference.css'
  if (
    validateCss(settingsForm4MenuPath, settingsForm4Menu).length ||
    validateCss('hbar-ui/packages/lumen-app-ui/src/other.css', settingsForm4Menu).length === 0 ||
    validateCss(
      settingsForm4MenuPath,
      settingsForm4Menu.replace('lumen-settings-form-4-menu {', 'lumen-settings-form-4-menu > button {'),
    ).length === 0
  )
    throw new Error('Settings Form 4 menu overlay exception must be exact, path-scoped and exclude its options')
  const canvasPin =
    '.lumen-comments-canvas-pin { position: absolute; inset-inline-start: var(--lumen-comment-pin-x); inset-block-start: var(--lumen-comment-pin-y); transform: translate(-50%, -50%); }'
  if (
    validateCss('packages/lumen-app-ui/src/comments-canvas-reference.css', canvasPin).length ||
    validateCss('other.css', canvasPin).length === 0 ||
    validateCss('packages/lumen-app-ui/src/comments-canvas-reference.css', canvasPin.replace('pin {', 'pin > span {'))
      .length === 0 ||
    validateCss(
      'packages/lumen-app-ui/src/comments-canvas-reference.css',
      canvasPin.replace('canvas-pin {', 'canvas-card {'),
    ).length === 0
  )
    throw new Error('Observed canvas pin overlay exception must remain exact, path-scoped and exclude flowing content')
  const commentMentions =
    '.lumen-comments-composer-mention-menu { position: absolute; inset-block-start: calc(100% - 0.375rem); inset-inline-start: 3.25rem; }'
  if (
    validateCss('packages/lumen-app-ui/src/comments-composer-reference.css', commentMentions).length ||
    validateCss('packages/lumen-app-ui/src/other.css', commentMentions).length === 0 ||
    validateCss(
      'packages/lumen-app-ui/src/comments-composer-reference.css',
      commentMentions.replace('mention-menu {', 'mention-menu > button {'),
    ).length === 0
  )
    throw new Error('Observed comment mention menu exception must be exact, path-scoped and exclude option content')
  const imageRemove =
    '.lumen-image-tile > .lumen-image-tile-remove-overlay { position: absolute; inset-block-start: 0; inset-inline-end: 0; }'
  if (
    validateCss('hbar-ui/packages/lumen-app-ui/src/image-gallery.css', imageRemove).length ||
    validateCss('hbar-ui/packages/lumen-app-ui/src/other.css', imageRemove).length === 0 ||
    validateCss(
      'hbar-ui/packages/lumen-app-ui/src/image-gallery.css',
      imageRemove.replace('remove-overlay {', 'remove-overlay span {'),
    ).length === 0 ||
    validateCss('hbar-ui/packages/lumen-app-ui/src/image-gallery.css', imageRemove.replace('remove-overlay', 'open'))
      .length === 0
  )
    throw new Error('Image remove overlay exception must be exact, path-scoped and exclude its content')
  const authReveal =
    '.hbar-app-ui-auth-sign-in-surface .hbar-app-ui-auth-input-wrap > .hbar-app-ui-auth-icon-button { position: absolute; inset-inline-end: 0.25rem; }'
  if (
    validateCss('packages/lumen-app-ui/src/authentication-sign-in-reference.css', authReveal).length ||
    validateCss('packages/lumen-app-ui/src/other.css', authReveal).length === 0
  )
    throw new Error('Authentication reveal exception must be path-scoped')
  const bellPopover =
    '.hbar-app-ui-notifications-variant-6 .lumen-bell-popover { position: absolute; inset-inline-end: 0; }'
  if (
    validateCss('packages/lumen-app-ui/src/notifications-bell-reference.css', bellPopover).length ||
    validateCss('packages/lumen-app-ui/src/other.css', bellPopover).length === 0
  )
    throw new Error('Observed bell popover exception must be path-scoped')
  const bellBadge =
    '.hbar-app-ui-notifications-variant-6 .lumen-notifications-bell > button > .lumen-bell-badge { position: absolute; inset-block-start: 0; }'
  if (
    validateCss('packages/lumen-app-ui/src/notifications-bell-reference.css', bellBadge).length ||
    validateCss('packages/lumen-app-ui/src/other.css', bellBadge).length === 0
  )
    throw new Error('Observed bell badge overlay exception must be path-scoped')
  const stickyColumns = `.hbar-app-ui-notifications-variant-3 .lumen-preferences-columns {
  position: sticky;
  inset-block-start: 0;
}`
  if (
    validateCss('packages/lumen-app-ui/src/notifications-preferences-reference.css', stickyColumns).length ||
    validateCss('packages/lumen-app-ui/src/other.css', stickyColumns).length === 0 ||
    validateCss(
      'packages/lumen-app-ui/src/notifications-preferences-reference.css',
      stickyColumns.replace('sticky', 'absolute'),
    ).length === 0 ||
    validateCss(
      'packages/lumen-app-ui/src/notifications-preferences-reference.css',
      stickyColumns.replace('inset-block-start: 0', 'inset-block-start: 1rem'),
    ).length === 0
  )
    throw new Error('Observed preferences sticky strip exception must remain exact and path-scoped')
  const stickySwimlaneStages = `.hbar-app-ui-kanban-swimlane-stages {
  position: sticky;
  inset-block-start: 0;
}`
  if (
    validateCss('packages/lumen-app-ui/src/kanban-swimlanes-reference.css', stickySwimlaneStages).length ||
    validateCss('packages/lumen-app-ui/src/other.css', stickySwimlaneStages).length === 0 ||
    validateCss(
      'packages/lumen-app-ui/src/kanban-swimlanes-reference.css',
      stickySwimlaneStages.replace('sticky', 'absolute'),
    ).length === 0 ||
    validateCss(
      'packages/lumen-app-ui/src/kanban-swimlanes-reference.css',
      stickySwimlaneStages.replace('inset-block-start: 0', 'inset-block-start: 1rem'),
    ).length === 0
  )
    throw new Error('Observed swimlane sticky header exception must remain exact and path-scoped')
  const tableSticky = `.lumen-data-table-reference-scroll thead th {
  position: sticky;
  inset-block-start: 0;
}`
  const capacitySticky = `.hbar-app-ui-table-variant-8 .lumen-data-table-reference-scroll tbody th {
  position: sticky;
  inset-inline-start: 0;
}`
  for (const example of [tableSticky, capacitySticky]) {
    if (
      validateCss('packages/lumen-app-ui/src/data-table.css', example).length ||
      validateCss('packages/lumen-app-ui/src/other.css', example).length === 0 ||
      validateCss('packages/lumen-app-ui/src/data-table.css', example.replace('sticky', 'absolute')).length === 0 ||
      validateCss('packages/lumen-app-ui/src/data-table.css', example.replace(': 0', ': 1rem')).length === 0
    )
      throw new Error('Observed table sticky exception must be exact, path-scoped and zero-anchored')
  }
  const detailBackdrop = '.hbar-app-ui-kanban-detail-backdrop { position: absolute; inset-inline-start: 0; }'
  if (
    validateCss('packages/lumen-app-ui/src/kanban-detail-reference.css', detailBackdrop).length ||
    validateCss('packages/lumen-app-ui/src/other.css', detailBackdrop).length === 0 ||
    validateCss(
      'packages/lumen-app-ui/src/kanban-detail-reference.css',
      detailBackdrop.replace('detail-backdrop', 'detail-card'),
    ).length === 0
  )
    throw new Error('Observed detail backdrop exception must remain exact and path-scoped')
  const wizardToast = '.hbar-app-ui-dialog-wizard-toast { position: absolute; inset-block-end: 1rem; }'
  if (
    validateCss('packages/lumen-app-ui/src/app-dialog-wizard.css', wizardToast).length ||
    validateCss('packages/lumen-app-ui/src/other.css', wizardToast).length === 0
  )
    throw new Error('App Dialog wizard toast overlay exception must be path-scoped')
  const inviteToast = '.hbar-app-ui-dialog-invite-toast { position: absolute; inset-block-end: 1rem; }'
  if (
    validateCss('packages/lumen-app-ui/src/app-dialog-invite.css', inviteToast).length ||
    validateCss('packages/lumen-app-ui/src/other.css', inviteToast).length === 0
  )
    throw new Error('App Dialog invite toast overlay exception must be path-scoped')
  const deleteToast = '.hbar-app-ui-dialog-delete-toast { position: absolute; inset-block-end: 1rem; }'
  if (
    validateCss('packages/lumen-app-ui/src/app-dialog-delete.css', deleteToast).length ||
    validateCss('packages/lumen-app-ui/src/other.css', deleteToast).length === 0
  )
    throw new Error('App Dialog delete toast overlay exception must be path-scoped')
  const planToast = '.hbar-app-ui-dialog-plan-toast { position: absolute; inset-block-end: 1rem; }'
  if (
    validateCss('packages/lumen-app-ui/src/app-dialog-plan.css', planToast).length ||
    validateCss('packages/lumen-app-ui/src/other.css', planToast).length === 0
  )
    throw new Error('App Dialog plan toast overlay exception must be path-scoped')
  const workspaceMenu = '.lumen-workspace-menu {\nposition: absolute;\ninset-block-start: 0;\n}'
  if (validateCss('packages/lumen-app-ui/src/app-sidebar-workspace.css', workspaceMenu).length)
    throw new Error('Rejected observed workspace switcher overlay')
  if (validateCss('other.css', workspaceMenu).length < 2)
    throw new Error('Workspace switcher overlay exception leaked to another stylesheet')
  const valid = validateCss(
    'self-test-valid.css',
    `.card {
  display: flex;
  padding: 8px;
  margin-inline: 4px;
  gap: 6px;
  border-radius: .5rem;
}`,
  )
  if (valid.length !== 0) {
    console.error(`Flow layout guard self-test expected valid CSS, got: ${valid.join('; ')}`)
    process.exit(1)
  }
  const invalid = validateCss(
    'self-test-invalid.css',
    `.card {
  display: grid;
  border: 1px solid red;
  width: 320px;
  left: 2px;
}`,
  )
  if (invalid.length < 4) {
    console.error(
      `Flow layout guard self-test expected CSS Grid, px, and coordinate errors, got: ${invalid.join('; ')}`,
    )
    process.exit(1)
  }
  const overlay = validateCss(
    'self-test-overlay.css',
    `.hbar-app-ui-dialog-backdrop {
  position: fixed;
  inset: 0;
  padding: 1rem;
}
.hbar-app-ui-app-sidebar-drawer {
  position: fixed;
  inset: 0;
}`,
  )
  if (overlay.length !== 0) {
    console.error(`Flow layout guard self-test expected overlay exception, got: ${overlay.join('; ')}`)
    process.exit(1)
  }
  const modelSheet = `.hbar-composer-picker-popover[data-kind='model'][data-presentation='web'] { inset: auto 0 0; }
.hbar-composer-picker-popover[data-kind='model'][data-presentation='web']::backdrop { inset: 0; }`
  if (
    validateCss('packages/app-react/src/composer-model-picker.css', modelSheet).length !== 0 ||
    validateCss('packages/app-react/src/other.css', modelSheet).length === 0 ||
    validateCss(
      'packages/app-react/src/composer-model-picker.css',
      `.hbar-composer-picker-popover[data-kind='model'][data-presentation='web'] span { inset: 0; }`,
    ).length === 0
  ) {
    console.error('Flow layout guard self-test expected only the path-scoped model popover to float')
    process.exit(1)
  }
  const treeMenuCss = `.lumen-tree-menu {
  position: absolute;
  inset-block-start: 1.875rem;
  inset-inline-end: 0.125rem;
}`
  const treeMenu = validateCss('packages/lumen-app-ui/src/app-sidebar-tree.css', treeMenuCss)
  const leakedTreeMenu = validateCss('packages/lumen-app-ui/src/other.css', treeMenuCss)
  if (treeMenu.length !== 0 || leakedTreeMenu.length === 0) {
    console.error('Flow layout guard self-test expected a path-scoped tree menu overlay exception')
    process.exit(1)
  }
  const drawerOverlayCss = `.lumen-drawer-scrim { position: absolute; inset: 0; }
.lumen-drawer-panel { position: absolute; inset-block: 0; inset-inline-start: 0; }`
  const drawerOverlay = validateCss('packages/lumen-app-ui/src/app-sidebar-drawer.css', drawerOverlayCss)
  const leakedDrawerOverlay = validateCss('packages/lumen-app-ui/src/other.css', drawerOverlayCss)
  if (drawerOverlay.length !== 0 || leakedDrawerOverlay.length === 0) {
    console.error('Flow layout guard self-test expected path-scoped drawer and scrim overlay exceptions')
    process.exit(1)
  }
  const fullOverlayCss = `.lumen-full-scrim { position: absolute; inset: 0; }
.lumen-full-dialog { position: absolute; inset-block: 0; inset-inline-start: 0; }`
  const fullOverlay = validateCss('packages/lumen-app-ui/src/app-sidebar-full.css', fullOverlayCss)
  const leakedFullOverlay = validateCss('packages/lumen-app-ui/src/other.css', fullOverlayCss)
  if (fullOverlay.length !== 0 || leakedFullOverlay.length === 0) {
    console.error('Flow layout guard self-test expected path-scoped full-sidebar overlay exceptions')
    process.exit(1)
  }
  const lumenMaterialOverlay = validateCss(
    'packages/lumen-app-ui/src/materials.module.css',
    `.surface > .indicator {
  position: absolute;
  inset-block-start: 0;
}
.glass {
  position: absolute;
  inset: 0;
}
.button > [data-edge],
.iconButton > [data-edge] {
  position: absolute;
  inset-block-start: 0;
}`,
  )
  if (lumenMaterialOverlay.length !== 0) {
    console.error(
      `Flow layout guard self-test expected Lumen material overlay exception, got: ${lumenMaterialOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  const leakedLumenOverlay = validateCss(
    'packages/hbar-app-ui/src/feature.css',
    `.surface > .indicator {
  position: absolute;
  inset: 0;
}`,
  )
  if (leakedLumenOverlay.length < 2) {
    console.error(
      `Flow layout guard self-test expected Lumen material exception to remain path-scoped, got: ${leakedLumenOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  const lumenComboboxOverlay = validateCss(
    'packages/lumen-app-ui/src/forms.css',
    `.lumen-combobox-popup {
  position: absolute;
  inset-block-start: calc(100% + 0.25rem);
  inset-inline: 0;
}`,
  )
  if (lumenComboboxOverlay.length !== 0) {
    console.error(
      `Flow layout guard self-test expected Lumen combobox overlay exception, got: ${lumenComboboxOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  const lumenNativeControlOverlay = validateCss(
    'packages/lumen-app-ui/src/forms.css',
    `.lumen-checkbox-input,
.lumen-toggle-input {
  position: absolute;
  inset: 0;
}`,
  )
  if (lumenNativeControlOverlay.length !== 0) {
    console.error(
      `Flow layout guard self-test expected Lumen native control overlay exception, got: ${lumenNativeControlOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  const approvalScrollOverlay = validateCss(
    'packages/lumen-app-ui/src/agent-approval.css',
    `.hbar-app-ui-agent-approval-scroll-overlay {
  position: absolute;
  inset-inline: 0;
  block-size: 2rem;
}
.hbar-app-ui-agent-approval-scroll-overlay.is-top {
  inset-block-start: 0;
}
.hbar-app-ui-agent-approval-scroll-overlay.is-bottom {
  inset-block-end: 0;
}`,
  )
  if (approvalScrollOverlay.length !== 0) {
    console.error(`Flow layout guard rejected verified scroll-edge overlays: ${approvalScrollOverlay.join('; ')}`)
    process.exit(1)
  }
  for (const suffix of ['', '.is-top', '.is-bottom', '[data-visible="true"]']) {
    const summaryErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-summary.css',
      `.lumen-plan-summary-edge-overlay${suffix} { position: absolute; inset-inline: 0; }`,
    )
    if (summaryErrors.length) {
      console.error(`Flow layout guard rejected verified summary edge overlays: ${summaryErrors.join('; ')}`)
      process.exit(1)
    }
    const boardErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-board.css',
      `.lumen-plan-board-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (boardErrors.length) {
      console.error(`Flow layout guard rejected verified board edge overlays: ${boardErrors.join('; ')}`)
      process.exit(1)
    }
    const actualErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-actual.css',
      `.lumen-plan-actual-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (actualErrors.length) {
      console.error(`Flow layout guard rejected verified timing edge overlays: ${actualErrors.join('; ')}`)
      process.exit(1)
    }
    const treeErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-tree.css',
      `.lumen-plan-tree-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (treeErrors.length) {
      console.error(`Flow layout guard rejected verified tree edge overlays: ${treeErrors.join('; ')}`)
      process.exit(1)
    }
    const reviewErrors = validateCss(
      'packages/lumen-app-ui/src/plan-review.css',
      `.lumen-plan-review-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (reviewErrors.length) {
      console.error(`Flow layout guard rejected verified review edge overlays: ${reviewErrors.join('; ')}`)
      process.exit(1)
    }
    const errors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-checklist.css',
      `.hbar-app-ui-agent-plan-checklist-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (errors.length) {
      console.error(`Flow layout guard rejected verified checklist edge overlays: ${errors.join('; ')}`)
      process.exit(1)
    }
  }
  for (const [path, selector] of [
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-summary-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-summary.css', '.lumen-plan-summary-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-summary.css', '.lumen-plan-summary-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-board-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-board.css', '.lumen-plan-board-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-board.css', '.lumen-plan-board-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-actual-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-actual.css', '.lumen-plan-actual-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-actual.css', '.lumen-plan-actual-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-tree-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-tree.css', '.lumen-plan-tree-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-tree.css', '.lumen-plan-tree-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-review-edge-overlay'],
    ['packages/lumen-app-ui/src/plan-review.css', '.lumen-plan-review-edge-overlay p'],
    ['packages/lumen-app-ui/src/plan-review.css', '.lumen-plan-review-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.hbar-app-ui-agent-plan-checklist-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-checklist.css', '.hbar-app-ui-agent-plan-checklist-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-checklist.css', '.hbar-app-ui-agent-plan-checklist-edge-overlay > button'],
    ['packages/hbar-app-ui/src/feature.css', '.hbar-app-ui-agent-approval-scroll-overlay'],
    ['packages/lumen-app-ui/src/agent-approval.css', '.hbar-app-ui-agent-approval-scroll-overlay p'],
    ['packages/lumen-app-ui/src/agent-approval.css', '.hbar-app-ui-agent-approval-scroll-overlay > button'],
  ]) {
    const errors = validateCss(
      path,
      `${selector} {
  position: absolute;
  inset: 0;
}`,
    )
    if (errors.length < 2) {
      console.error(`Flow layout guard leaked the scroll-edge exception into ${path}: ${selector}`)
      process.exit(1)
    }
  }
  for (const selector of [
    '.lumen-sidebar-overlay',
    '.lumen-sidebar-backdrop',
    '.lumen-sidebar-mobile',
    '.lumen-sidebar-account-menu',
    '.lumen-sidebar-nav-frame::after, .lumen-sidebar-main-frame::after',
  ]) {
    const path = 'packages/lumen-app-ui/src/app-shell-sidebar.css'
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed shell overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Shell exception leaked across files')
  }
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-sidebar.css',
      '.lumen-sidebar-account-menu > button {\nposition: absolute;\n}',
    ).length !== 1
  )
    throw new Error('Shell overlay exception leaked to menu content')
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-sidebar.css',
      '.lumen-sidebar-sr {\nposition: absolute;\nclip-path: inset(50%);\n}',
    ).length
  )
    throw new Error('Rejected accessible hidden copy')
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-sidebar.css',
      '.lumen-sidebar-sr {\nposition: fixed;\nclip-path: inset(50%);\n}',
    ).length !== 1
  )
    throw new Error('Hidden text exception allowed fixed placement')
  for (const selector of [
    '.lumen-rail-overlay',
    '.lumen-rail-backdrop',
    '.lumen-rail-mobile',
    '.lumen-rail-workspace-menu',
    '.lumen-rail-nav-frame::after, .lumen-rail-main-frame::after',
  ]) {
    const path = 'packages/lumen-app-ui/src/app-shell-rail.css'
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed rail overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Rail exception leaked across files')
  }
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-rail.css',
      '.lumen-rail-workspace-menu > button {\nposition: absolute;\n}',
    ).length !== 1
  )
    throw new Error('Rail exception leaked to menu content')
  const composerPath = 'packages/app-react/src/composer-model-picker.css'
  const tabsPath = 'packages/app-react/src/workspace-tabs.css'
  const filePreviewsPath = 'packages/app-react/src/file-preview-tabs.css'
  if (validateCss(filePreviewsPath, '.hbar-file-preview-menu-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed file preview menu container')
  for (const [path, selector] of [
    ['other.css', '.hbar-file-preview-menu-popover'],
    [filePreviewsPath, '.hbar-file-preview-menu-popover > button'],
    [filePreviewsPath, '.hbar-file-preview-tab'],
  ]) {
    if (validateCss(path, `${selector} { position: fixed; }`).length !== 1)
      throw new Error('File preview menu exception leaked to content or another file')
  }
  if (validateCss(tabsPath, '.hbar-workspace-tab-menu-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed workspace tab menu container')
  for (const [path, selector] of [
    ['other.css', '.hbar-workspace-tab-menu-popover'],
    [tabsPath, '.hbar-workspace-tab-menu-popover > button'],
    [tabsPath, '.hbar-workspace-tab'],
  ]) {
    if (validateCss(path, `${selector} {\nposition: fixed;\ninset: 0;\n}`).length !== 2)
      throw new Error('Workspace tab menu exception leaked to content or another file')
  }
  const mobileNavigationPath = 'packages/app-react/src/mobile-header-menu.css'
  if (
    validateCss(
      mobileNavigationPath,
      '.hbar-mobile-header-menu-content {\nposition: absolute;\ninset-block-start: 100%;\ninset-inline-end: 0;\n}',
    ).length
  )
    throw new Error('Rejected anchored narrow-shell navigation overlay')
  for (const [path, selector] of [
    ['other.css', '.hbar-mobile-header-menu-content'],
    [mobileNavigationPath, '.hbar-mobile-header-menu-content button'],
    [mobileNavigationPath, '.hbar-mobile-header-menu'],
  ]) {
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length !== 2)
      throw new Error('Narrow-shell overlay allowance leaked to content or another file')
  }
  if (validateCss(composerPath, '.hbar-composer-picker-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed composer popover container')
  if (validateCss(composerPath, '.hbar-composer-picker-popover > button { position: fixed; }').length !== 1)
    throw new Error('Composer popover exception leaked to content')
  if (validateCss('other.css', '.hbar-composer-picker-popover { position: fixed; }').length !== 1)
    throw new Error('Composer popover exception leaked across files')
  const locationPath = 'packages/app-react/src/pre-session-location-picker.css'
  if (validateCss(locationPath, '.hbar-pre-session-location-popover { position: fixed; inset: 0; }').length)
    throw new Error('Location overlay shell must allow positioning')
  for (const [path, selector] of [
    ['other.css', '.hbar-pre-session-location-popover'],
    [locationPath, '.hbar-pre-session-location-popover > button'],
    [locationPath, '.hbar-pre-session-location-row'],
  ]) {
    if (!validateCss(path, `${selector} { position: fixed; top: 0; }`).length)
      throw new Error('Location overlay exception must not permit positioned content')
  }
  const preSessionChoicePath = 'packages/app-react/src/pre-session-choice-picker.css'
  if (validateCss(preSessionChoicePath, '.hbar-pre-session-choice-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed pre-session model popover container')
  if (
    validateCss(preSessionChoicePath, ".hbar-pre-session-choice-popover[data-presentation='web'] { inset: auto 0 0; }")
      .length
  )
    throw new Error('Rejected observed first-send mobile Web sheet container')
  for (const [path, selector] of [
    ['other.css', '.hbar-pre-session-choice-popover'],
    [preSessionChoicePath, '.hbar-pre-session-choice-popover > button'],
    [preSessionChoicePath, '.hbar-pre-session-choice-row'],
    ['other.css', ".hbar-pre-session-choice-popover[data-presentation='web']"],
    [preSessionChoicePath, ".hbar-pre-session-choice-popover[data-presentation='web'] > button"],
  ]) {
    if (validateCss(path, `${selector} { position: fixed; }`).length !== 1)
      throw new Error('Pre-session model popover exception leaked to content or another file')
  }
  const agentModelPath = 'packages/app-react/src/agent-model-picker.css'
  if (validateCss(agentModelPath, '.hbar-agent-model-popover:popover-open { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed Agent model popover container')
  if (validateCss(agentModelPath, '.hbar-agent-model-popover button { position: fixed; }').length !== 1)
    throw new Error('Agent model popover exception leaked to options')
  if (validateCss('other.css', '.hbar-agent-model-popover:popover-open { position: fixed; }').length !== 1)
    throw new Error('Agent model popover exception leaked across files')
  const attachmentPath = 'packages/app-react/src/composer-attachments.css'
  if (validateCss(attachmentPath, '.hbar-composer-attachment-drop-overlay {\nposition: absolute;\ninset: 0;\n}').length)
    throw new Error('Rejected observed composer attachment drop overlay')
  for (const [path, selector] of [
    ['other.css', '.hbar-composer-attachment-drop-overlay'],
    [attachmentPath, '.hbar-composer-attachment-drop-overlay > p'],
    [attachmentPath, '.hbar-composer-attachment-transfer'],
  ]) {
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length !== 2)
      throw new Error('Composer attachment overlay exception leaked to content or another file')
  }
  const mentionPath = 'packages/app-react/src/composer-mention-editor.css'
  if (validateCss(mentionPath, '.hbar-composer-mention-menu {\nposition: absolute;\ninset: 0;\n}').length)
    throw new Error('Rejected evidence-backed composer mention menu overlay')
  for (const [path, selector] of [
    ['other.css', '.hbar-composer-mention-menu'],
    [mentionPath, '.hbar-composer-mention-menu > p'],
    [mentionPath, '.hbar-composer-mention-row'],
  ]) {
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length !== 2)
      throw new Error('Composer mention overlay exception leaked to content or another file')
  }
  const permissionPath = 'packages/app-react/src/composer-permission-picker.css'
  const intentBlockedPath = 'packages/app-react/src/composer-intent-blocked.css'
  if (validateCss(intentBlockedPath, '.hbar-composer-intent-blocked-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected scoped Goal/Plan explanation overlay')
  for (const [path, selector] of [
    ['other.css', '.hbar-composer-intent-blocked-popover'],
    [intentBlockedPath, '.hbar-composer-intent-blocked-popover > button'],
    [intentBlockedPath, '.hbar-composer-intent-blocked-body'],
  ]) {
    if (validateCss(path, `${selector} { position: fixed; }`).length !== 1)
      throw new Error('Goal/Plan explanation overlay exception leaked')
  }
  const usagePath = 'packages/app-react/src/session-usage-control.css'
  if (validateCss(usagePath, '.hbar-session-usage-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed session usage popover container')
  if (validateCss(usagePath, '.hbar-session-usage-popover > button { position: fixed; }').length !== 1)
    throw new Error('Session usage popover exception leaked to content')
  if (validateCss('other.css', '.hbar-session-usage-popover { position: fixed; }').length !== 1)
    throw new Error('Session usage popover exception leaked across files')
  if (validateCss(permissionPath, '.hbar-composer-permission-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed composer permission popover container')
  if (validateCss(permissionPath, '.hbar-composer-permission-popover > button { position: fixed; }').length !== 1)
    throw new Error('Composer permission popover exception leaked to content')
  if (validateCss('other.css', '.hbar-composer-permission-popover { position: fixed; }').length !== 1)
    throw new Error('Composer permission popover exception leaked across files')
  const contractsPath = 'packages/lumen-app-ui/src/app-shell-contracts.css'
  for (const selector of [
    '.lumen-contracts-overlay',
    '.lumen-contracts-backdrop',
    '.lumen-contracts-drawer',
    '.lumen-contracts-account-menu',
    '.lumen-contracts-nav-frame::after, .lumen-contracts-main-frame::after',
    '.lumen-contracts-search-field > svg',
    '.lumen-contracts-search-field kbd',
  ]) {
    if (validateCss(contractsPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed contracts overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Contracts overlay exception leaked across files')
  }
  if (validateCss(contractsPath, '.lumen-contracts-account-menu > button {\nposition: absolute;\n}').length !== 1)
    throw new Error('Contracts overlay exception leaked to content')
  if (validateCss(contractsPath, '.lumen-contracts-sr {\nposition: absolute;\nclip-path: inset(50%);\n}').length)
    throw new Error('Rejected contracts accessible hidden copy')
  if (validateCss(contractsPath, '.lumen-contracts-sr {\nposition: fixed;\nclip-path: inset(50%);\n}').length !== 1)
    throw new Error('Contracts hidden copy exception allowed fixed positioning')
  const editorialPath = 'packages/lumen-app-ui/src/app-shell-editorial.css'
  for (const selector of [
    '.lumen-editorial-overlay',
    '.lumen-editorial-backdrop',
    '.lumen-editorial-drawer',
    '.lumen-editorial-date-dot',
    '.lumen-editorial-event-line',
    '.lumen-editorial-main-frame::after, .lumen-editorial-agenda-frame::after',
  ]) {
    if (validateCss(editorialPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed editorial overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Editorial overlay exception leaked across files')
  }
  if (validateCss(editorialPath, '.lumen-editorial-schedule {\nposition: absolute;\n}').length !== 1)
    throw new Error('Editorial normal-flow schedule cannot become an overlay')
  const inboxPath = 'packages/lumen-app-ui/src/app-shell-inbox.css'
  for (const selector of [
    '.lumen-inbox-overlay',
    '.lumen-inbox-backdrop',
    '.lumen-inbox-drawer',
    '.lumen-inbox-menu',
    '.lumen-inbox-tooltip',
    '.lumen-inbox-rail-dot',
    '.lumen-inbox-search-icon',
    '.lumen-inbox-scroll-frame::before, .lumen-inbox-scroll-frame::after',
  ]) {
    if (validateCss(inboxPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error('Rejected observed inbox overlay')
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Inbox overlay exception leaked across files')
  }
  if (validateCss(inboxPath, '.lumen-inbox-summary {\nposition: absolute;\n}').length !== 1)
    throw new Error('Inbox message content cannot use overlay placement')
  const documentsPath = 'packages/lumen-app-ui/src/app-shell-documents.css'
  for (const selector of [
    '.lumen-documents-menu',
    '.lumen-documents-more-formatting > .lumen-documents-menu',
    '.lumen-documents-overlay',
    '.lumen-documents-backdrop',
    '.lumen-documents-scroll-frame::before, .lumen-documents-scroll-frame::after',
  ]) {
    if (validateCss(documentsPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error('Rejected document overlay')
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Document overlay allowance leaked across files')
  }
  if (validateCss(documentsPath, '.lumen-documents-reader p {\nposition: absolute;\n}').length !== 1)
    throw new Error('Document prose cannot use overlay placement')
  console.log('Flow layout guard self-test passed.')
  process.exit(0)
}
if (inputPaths.length === 0) {
  console.error('Usage: bun validate-flow-layout.mjs <stylesheet> [...stylesheet]')
  process.exit(1)
}

const allErrors = []
for (const path of inputPaths) {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    allErrors.push(`${path}: stylesheet does not exist`)
    continue
  }
  allErrors.push(...validateCss(path, await file.text()))
}

if (allErrors.length > 0) {
  console.error(allErrors.join('\n'))
  process.exit(1)
}

console.log(`Flow layout guard passed for ${inputPaths.length} stylesheet(s).`)
