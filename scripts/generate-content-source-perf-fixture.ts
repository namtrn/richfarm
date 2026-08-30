import fs from "node:fs";
import path from "node:path";

interface CliArgs {
  outDir: string;
  directories: number;
  locales: string[];
}

function parseArgs(argv: readonly string[]): CliArgs {
  let outDir = path.resolve("artifacts/perf/content-source-50k");
  let directories = 25_000;
  let locales = ["en", "vi"];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out" && argv[index + 1]) {
      outDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--dirs" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--dirs must be a positive integer");
      }
      directories = parsed;
      index += 1;
    } else if (arg === "--locales" && argv[index + 1]) {
      locales = argv[index + 1].split(",").map((locale) => locale.trim()).filter(Boolean);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (locales.length === 0) {
    throw new Error("--locales must contain at least one locale");
  }
  return { outDir, directories, locales };
}

function markdownBody(index: number, locale: string): string {
  const paragraph = [
    `# Perf fixture ${index} (${locale})`,
    "",
    "Deterministic generated content for the excluded 50,000-file",
    "content-source performance fixture. Bytes are stable across runs so",
    "hash comparisons are reproducible.",
    "",
  ].join("\n");
  return `${paragraph}${"filler line for realistic byte size\n".repeat(24)}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const plantsRoot = path.join(args.outDir, "content", "plants");
  const pestsDiseasesRoot = path.join(args.outDir, "content", "pests-diseases");
  fs.rmSync(args.outDir, { recursive: true, force: true });
  fs.mkdirSync(plantsRoot, { recursive: true });
  fs.mkdirSync(pestsDiseasesRoot, { recursive: true });

  let files = 0;
  for (let index = 0; index < args.directories; index += 1) {
    const directory = path.join(plantsRoot, `perf-${String(index).padStart(6, "0")}`);
    fs.mkdirSync(directory, { recursive: true });
    for (const locale of args.locales) {
      fs.writeFileSync(path.join(directory, `${locale}.md`), markdownBody(index, locale), "utf8");
      files += 1;
    }
  }

  process.stdout.write(
    `Generated ${args.directories} directories / ${files} Markdown files under ${args.outDir}\n` +
    `This tree is excluded from source control via .gitignore (artifacts/perf/).\n`,
  );
}

main();
