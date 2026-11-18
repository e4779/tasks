#!/usr/bin/env bun
// Regenerates the 80-card zero-edge corpus (rectPacking probe target):
// no md-links, no [[refs]], no blocked-by — only then is the corpus edgeless.
// bun test/fixtures-edgeless/gen.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "tasks");
mkdirSync(dir, { recursive: true });
for (let i = 0; i < 80; i++) {
  const id = String(i).padStart(2, "0");
  const filler = "filler ".repeat(i % 7); // width variety → real packing, not a grid
  writeFileSync(
    join(dir, `edgeless-${id}.md`),
    `---\nstatus: pending\n---\n\n# Edgeless ${id} ${filler}\n`,
  );
}
