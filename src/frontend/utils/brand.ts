// RoboPLC: the product is Robotek's, built on OpenPLC v4 (Autonomy Logic). Device and runtime
// NAMES stay OpenPLC's in the project files and board definitions (they are identifiers: renaming
// them would orphan every saved project); only what the screen shows says RoboPLC.
export const brand = (text: string): string => text.replace(/\bOpenPLC\b/g, 'RoboPLC')

export const BASED_ON =
  'RoboPLC is built on OpenPLC v4 (OpenPLC Editor and OpenPLC Runtime, open source, \u00A9 Autonomy Logic).'
