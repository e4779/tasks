#!/usr/bin/env bun
import { dirname } from "node:path";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { nextUp } from "../src/next";
import { parseFile } from "../src/parse";
import { startServer } from "../src/serve";

const [cmd, ...args] = Bun.argv.slice(2);

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
  case "next":
    for (const t of nextUp(buildGraph(await corpus()))) {
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
  default:
    console.error(
      "usage: tsk <list|next|graph|parse|serve> [roots...|file] [--port=N] [--host=<addr>]",
    );
    process.exit(1);
}
