# Desktop interface zoom

The reference cc-haha General page places **Interface zoom** immediately below
message sending. Its original component has a 50–200% range, 100% reset, and
Ctrl/Cmd + `+`, `-`, `0` shortcuts. The isolated, unmodified original component
at `artifacts/desktop-next-entry-audit/conversation/original-general-send-zh-CN-320.png`
shows that vertical reading order and its compact narrow layout. The published
General screenshot ends above this control, so it is not evidence for the zoom
section. Reference source is `D:/Git/cc-haha/desktop/src/pages/settings/GeneralSettings.tsx`
and `desktop/src/lib/appZoom.ts` at cc revision `e28d0a65`.

Hbar keeps its Lumen visual language and adds the same explicit interaction in
Settings → General, after the Host-global send-key choice. The application-wide
shortcuts work outside Settings too. The range has a visible percentage and a
reset action; pointer changes commit on release, keyboard changes on key-up or
blur. The setting changes presentation only, not the selected session, draft,
attachments, Run or Host business settings. English and Chinese labels come
from `general-settings-copy.ts`, not from the view.

The native Tauri main WebView applies `setZoom` and persists a device-local,
versioned value at the active data root's `settings/desktop-ui-zoom.json`.
`read_ui_zoom` and `write_ui_zoom` are restricted to that window and its current
loopback workbench origin. The file is limited to 4 KiB; malformed data gives
an explicit read error rather than being silently overwritten. The native
bridge is commit `9347ba5`. Browser-only builds use CSS page zoom and a
same-origin local-storage key; this is a browser adaptation, not a claim that
origin storage survives a native Host port change. If native WebView zoom is
unavailable before any native zoom succeeds, the view reports its CSS fallback;
it never multiplies CSS and an already-active native scale.

Verification for the frontend slice uses frozen assets
`artifacts/app-zoom/web-v2/assets/index-oZG6wyC6.js` (SHA-256
`2A484C97B867699B26190B6AA3DCCC91A1612CAB33D90264EB29DA34D7F73662`).
The real temporary Host browser matrix passed 4/4 at en-US/zh-CN × 1440/320:
General visibility and semantics, two shortcut increments, 120% readback,
same-origin reload, reset, range keyboard 50%/200%, no document horizontal
overflow, original unsent draft on Settings return, zero Run and page errors.
Final-asset screenshots and geometry are in `artifacts/app-zoom/browser-v2`;
the earlier exploratory captures remain in `artifacts/app-zoom/browser-slider`.
`tests/web-app-zoom.test.ts` and `tests/web-general-settings.test.tsx` cover
normalization, platform keys, stale writes, read/save failure, localized
markup and the range contract.

The isolated native WebView2 release build then passed en-US/zh-CN × 900/1440
(4/4) with the **same** frozen JS/CSS and a fresh Tauri executable containing
`9347ba5`. Ctrl+`+`/`0`, 50/200% slider endpoints, native rather than CSS
zoom, a saved 120% value, and a second desktop/Host launch from the same owned
data root restoring 120% were verified. No Run or paid provider request was
issued. The precise asset/executable hashes, separate first/restart process
identities, and cleanup are in
`artifacts/app-zoom/native/hbar-native-session-ui-zoom-RUQyTJ`.
At 110% in a physical 900px window, WebView2 reports a CSS viewport of 818px;
the General section, both send-key cards and Reset all end at CSS x≈789,
inside that viewport. Their own scroll widths fit their client widths. CDP
screenshots are captured at CSS viewport dimensions after native zoom, so a
cropped-looking screenshot alone is not evidence of actual right-edge clipping.
An owned-window `PrintWindow` capture independently confirms complete controls
at 900px/110% (`physical-native-110-en-US-900.png`) and no black region at
1440px/50% (`physical-native-050-zh-CN-1440.png`). The latter resolves the
oversized black area seen in the CDP capture as a screenshot artifact.

The separate canonical Lumen boundary test remains red in unrelated concurrent
`hbar-ui` Comments/Authentication files (2 pass, 1 fail). None of the added
General controls is listed in that violation output. Full repository lint/test
was not claimed green during those unrelated changes.
