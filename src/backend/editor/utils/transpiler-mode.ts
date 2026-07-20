/**
 * Build-time toggle that selects between the new in-process JSON →
 * Structured Text transpiler and the legacy bundled `xml2st`
 * subprocess. Default is `false` (legacy xml2st) — flip with
 * `OPENPLC_USE_NEW_TRANSPILER=1` to opt into the JSON-fed transpiler.
 *
 * Lives in `backend/editor/utils/` so every editor-side transpilation
 * call site (`editor-compiler-platform-port.transpileToSt`,
 * `desktop-library-build-port.transpileToSt`,
 * `CompilerModule.compileForDebugger`) reads the same flag.
 *
 * Named without the `use` prefix on purpose: `react-hooks/rules-of-hooks`
 * treats any `use*` call inside a non-component / non-hook function as
 * a violation.
 */
export function isNewTranspilerEnabled(): boolean {
  // Default is now the in-process transpiler: the bundled xml2st.exe (v4.0.7,
  // latest upstream) crashes on win32 with "bad escape \P" — it feeds
  // Windows-joined POU paths (pous\programs\...) into re.sub. Set
  // OPENPLC_USE_NEW_TRANSPILER=0 to fall back to the legacy subprocess.
  const v = process.env.OPENPLC_USE_NEW_TRANSPILER
  return !(v === '0' || v === 'false')
}
