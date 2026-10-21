// Lets Excel read a UTF-8 CSV with accents correctly (written once, at the start of a file)
export const CSV_BOM = String.fromCharCode(0xfeff); // the invisible "byte order mark" character (U+FEFF)

// Spreadsheets run a cell as a formula when it starts with one of these characters
const FORMULA_START = /^[=+\-@\t\r]/;

// One cell. Text from users is untrusted, so a formula-looking start gets a leading quote (stored as plain text),
// and anything with a comma, quote or line break is wrapped in quotes with inner quotes doubled.
// Concept: CSV / formula injection (OWASP) and RFC 4180 quoting.
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Numbers are ours, never user text, so they are written as they are
  if (typeof value === "number") {
    return String(value);
  }

  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }

  return safe;
}

// One line of a CSV file, ending in CRLF as RFC 4180 says
export function csvRow(fields: (string | number | null | undefined)[]): string {
  return `${fields.map(csvField).join(",")}\r\n`;
}
