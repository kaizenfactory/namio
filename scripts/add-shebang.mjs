import { readFile, writeFile } from "node:fs/promises";

const filePath = process.argv[2];
if (!filePath) {
  throw new Error("Usage: node scripts/add-shebang.mjs <file>");
}

const content = await readFile(filePath, "utf8");
const desired = "#!/usr/bin/env node";

if (content.startsWith("#!/")) {
  const end = content.indexOf("\n");
  const firstLine = (end === -1 ? content : content.slice(0, end)).trim();
  if (firstLine === desired) {
    process.stdout.write(`Shebang ok: ${filePath}\n`);
    process.exit(0);
  }

  const rest = end === -1 ? "" : content.slice(end + 1);
  await writeFile(filePath, `${desired}\n${rest}`, "utf8");
  process.stdout.write(`Replaced shebang: ${filePath}\n`);
  process.exit(0);
}

await writeFile(filePath, `${desired}\n${content}`, "utf8");
process.stdout.write(`Added shebang: ${filePath}\n`);
