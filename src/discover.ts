import { glob } from "tinyglobby";
import { DEFAULT_DISCOVER, loadConfig, splitList } from "./config.ts";

// Path = identity: a task is any md file matching the discover patterns.
// A .tsk.conf discover list (micromatch `!` negations included, applied by
// glob itself) replaces the default; an explicit pattern argument wins over both.
export const discover = async (roots: string[], pattern?: string): Promise<string[]> =>
  [
    ...new Set(
      (
        await Promise.all(
          roots.map((cwd) =>
            glob(pattern ? [pattern] : splitList(loadConfig([cwd]).discover ?? DEFAULT_DISCOVER), {
              cwd,
              absolute: true,
            }),
          ),
        )
      ).flat(),
    ),
  ].sort();
