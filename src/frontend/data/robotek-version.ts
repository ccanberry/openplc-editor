// Robotek suite version shown in the title bar + window title so a user can
// tell at a glance which build they're running (this is the OpenPLC Suite
// installer version, e.g. 1.0.8 — the number the user tracks, not the upstream
// editor 4.2.x).
//
// Single source of truth is installer/openplc-suite.iss (MyAppVersion):
// installer/build-editor.sh rewrites the string below from it at package time.
// Left as 'dev' for `npm run dev`.
export const ROBOTEK_VERSION = 'dev'

/** e.g. "OpenPLC Editor Robotek v1.0.8" (or "… Robotek dev" in a dev run). */
export const ROBOTEK_TITLE =
  'OpenPLC Editor Robotek ' + (ROBOTEK_VERSION === 'dev' ? 'dev' : 'v' + ROBOTEK_VERSION)
