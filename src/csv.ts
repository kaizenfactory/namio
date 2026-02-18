export type CsvRow = Record<string, string>;

export function parseCsvFirstColumn(content: string): string[] {
  const lines = content.split("\n");
  const rows = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("#"));

  if (rows.length === 0) return [];

  const firstCell = (rows[0]?.split(",")[0] ?? "").trim().toLowerCase();
  const startIndex = firstCell === "name" ? 1 : 0;

  return rows
    .slice(startIndex)
    .map((l) => (l.split(",")[0] ?? "").trim())
    .filter(Boolean);
}

export function toCsv(lines: string[][]): string {
  return lines.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}
