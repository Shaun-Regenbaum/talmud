/** A number as a Hebrew numeral (gematria): 1->א, 15->טו, 16->טז, 21->כא,
 *  119->קיט. Handles the special 15/16 (טו/טז, not יה/יו) and >100 (Psalms run
 *  to 176). Used for verse markers in both reader views. */
export function hebrewNumeral(n: number): string {
  const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת'];
  let out = '';
  let h = Math.floor(n / 100);
  const rem = n % 100;
  while (h > 4) {
    out += 'ת';
    h -= 4;
  }
  out += hundreds[h];
  const t = Math.floor(rem / 10);
  const u = rem % 10;
  if (t === 1 && (u === 5 || u === 6)) {
    out += u === 5 ? 'טו' : 'טז';
  } else {
    out += tens[t] + units[u];
  }
  return out;
}
