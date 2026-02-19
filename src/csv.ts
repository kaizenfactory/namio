export const parseCsvFirstColumn = (content: string): readonly string[] => {
  const rows = content
    .split("\n")
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
};

const DQUOTE = '"';

const escapeCsvCell = (value: string): string =>
  value.includes(",") || value.includes(DQUOTE) || value.includes("\n")
    ? DQUOTE + value.replaceAll(DQUOTE, DQUOTE + DQUOTE) + DQUOTE
    : value;

export const toCsv = (lines: readonly (readonly string[])[]): string =>
  lines.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
