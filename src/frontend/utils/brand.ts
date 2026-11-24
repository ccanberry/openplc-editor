// RoboPLC: the product is Robotek's, built on OpenPLC v4 (Autonomy Logic). Device and runtime
// NAMES stay OpenPLC's in the project files and board definitions (they are identifiers: renaming
// them would orphan every saved project); only what the screen shows says RoboPLC.
export const brand = (text: string): string => text.replace(/\bOpenPLC\b/g, 'RoboPLC')

// The GPL-3.0's "appropriate legal notices" (section 5d): shown in the About panel, the one place
// the screen names OpenPLC (data-keep-brand keeps the sweep off it; services/brand-sweep.ts). The
// installer puts the same text in NOTICE.txt beside LICENSE.txt.
export const BASED_ON =
  'RoboPLC is derived from OpenPLC v4 (OpenPLC Editor and OpenPLC Runtime, \u00A9 Autonomy Logic / OpenPLC ' +
  'Project) and the STruC++ compiler, modified by Robotek.'
export const LICENSE_NOTICE =
  'Free software under the GNU General Public License, version 3: you may redistribute and modify it under ' +
  'its terms. It comes with ABSOLUTELY NO WARRANTY. Robotek provides the source code of this version on ' +
  'request. The license text is LICENSE.txt in the installation folder.'
export const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html'
