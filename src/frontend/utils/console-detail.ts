/**
 * Build output that is detail, not a step: shown in the console only with File > Settings >
 * Verbose. Such a line is logged at the debug level; warnings and errors are never detail.
 */
const DETAIL: RegExp[] = [
  // editor pipeline
  /^Found C\/C\+\+ POU/,
  /^(Processing|Successfully processed) \d+ C\/C\+\+ POU/,
  /^Host Hardware Info/,
  /^Checking tools availability/,
  /^(Arduino CLI|STruC\+\+) available/,
  /^Directories for compilation source files created/,
  /is not from a VPP package/,
  /^Debug map:/,
  /^Generating Runtime v4 conf files/,
  /^Composing Runtime v4 upload bundle/,
  /^Runtime v4 bundle composed/,
  /^Checking runtime version/,
  // runtime: plugin configuration
  /^Protected plugins/,
  /^update_plugin_configurations/,
  /^Looking for config files/,
  /^Loaded \d+ plugins/,
  /^(Initial|Final) state - /,
  /^Found \d+ config files/,
  /^Copied config file/,
  /^Plugin '.*' is protected/,
  /^Plugin configuration update complete/,
  /^Plugin summary/,
  /^hardware target for this upload/,
  // runtime: the compiler, file by file
  /^Starting compilation$/,
  /^TARGET=\S+: cross-compiling/,
  /^Compiling (core\/generated\/|runtime_v4_entry|python_loader)/,
  /^(ccache )?\S*(g\+\+|gcc)\s/,
  /^make(\[\d+\])?:/,
]

/** The build's elapsed-time prefix, `[1.2 s] `. */
const ELAPSED = /^\[\d+(\.\d+)? s\]\s*/

export function isDetailLine(message: string): boolean {
  const text = message.replace(ELAPSED, '').trim()
  return DETAIL.some((re) => re.test(text))
}

/** An info line that is detail goes to the debug level (verbose only); anything else as is. */
export function withDetailLevel<T extends { level?: string; message: string }>(entry: T): T {
  return entry.level === 'info' && isDetailLine(entry.message) ? { ...entry, level: 'debug' } : entry
}
