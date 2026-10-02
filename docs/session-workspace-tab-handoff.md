# Empty-draft Session tab handoff

The Runtime tab owner exposes `replaceCapturedSession(source,
replacementSessionId)` for the Workspace-move use case. The caller must first
confirm the destination composer and choices, select the destination Session,
and keep the captured original tab instance. The method removes the source
view and puts the existing destination tab at its position; it retains the
destination instance key and other tab order. It does not navigate, archive a
Session, delete its draft, or start a Run.

The handoff runs before source archival, because confirmed archive already
retires the original view through the ordinary tab projection. A stale or
reopened source instance, a different selected destination, or disposed Runtime
fails without changing tabs. Session creation still observes the existing
32-tab limit; callers check headroom before creating a replacement.

This is the tab-owned portion of the CC-haha-inspired empty-Session project
replacement, not an implemented UI migration by itself. The focused tab and
archive suites passed 50/50 (275 assertions), including original-position and
stale-reopened-source verification.
