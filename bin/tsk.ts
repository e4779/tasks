#!/usr/bin/env node
import { dirname } from "node:path";
import { check, type Finding } from "../src/check.ts";
import { loadConfig, terminalsOf } from "../src/config.ts";
import { discover } from "../src/discover.ts";
import { buildGraph } from "../src/graph.ts";
import { nextUp } from "../src/next.ts";
import { parseFile } from "../src/parse.ts";
import { startServer } from "../src/serve.ts";

const [cmd, ...args] = process.argv.slice(2);

const corpus = async () => {
  const files = await discover(args.length > 0 ? args : ["."]);
  return files.flatMap((f) => {
    const r = parseFile(f, args);
    return r.ok ? [r.v] : [];
  });
};

switch (cmd) {
  case "list":
    for (const t of await corpus()) {
      console.log(`${t.path}(${t.status ?? "none"})\t${t.title}\t${t.path}`);
    }
    break;
  case "next": // terminals ride the .tsk.conf cascade — the one source for next
    for (const t of nextUp(
      buildGraph(await corpus()),
      terminalsOf(loadConfig(args.length > 0 ? args : ["."])),
    )) {
      console.log(`${t.title}\t${t.path}`);
    }
    break;
  case "graph":
    console.log(JSON.stringify(buildGraph(await corpus()), null, 2));
    break;
  case "parse": {
    const file = args[0] ?? "";
    const r = parseFile(file, [dirname(file)]);
    if (r.ok) console.log(JSON.stringify(r.v, null, 2));
    else {
      console.error(r.e);
      process.exit(1);
    }
    break;
  }
  case "serve": {
    const i = args.indexOf("--port");
    const hi = args.indexOf("--host");
    const port =
      (i >= 0
        ? Number(args[i + 1])
        : Number(args.find((a) => a.startsWith("--port="))?.slice(7))) || 8931;
    const host =
      (hi >= 0 ? args[hi + 1] : args.find((a) => a.startsWith("--host="))?.slice(7)) || "127.0.0.1";
    const roots = args.filter(
      (a, idx) =>
        a !== "--port" &&
        a !== "--host" &&
        !a.startsWith("--port=") &&
        !a.startsWith("--host=") &&
        (i < 0 || idx !== i + 1) &&
        (hi < 0 || idx !== hi + 1),
    );
    startServer(roots, port, host);
    break;
  }
  case "check": {
    const findings = await check(args.length > 0 ? args : ["."]);
    for (const f of findings) console.log(`${f.level}\t${f.path}\t${f.detail}`);
    const count = (lvl: Finding["level"]) => findings.filter((f) => f.level === lvl).length;
    console.log(
      `${findings.length} findings: ${count("ERROR")} errors, ${count("WARN")} warnings, ${count("INFO")} info`,
    );
    if (findings.some((f) => f.level === "ERROR")) process.exit(1);
    break;
  }
  default:
    console.error(
      "usage: tsk <list|next|graph|parse|serve|check> [roots...|file] [--port=N] [--host=<addr>]",
    );
    process.exit(1);
}
