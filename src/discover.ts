import { glob } from "tinyglobby";

// Path = identity: a task is any md file under a tasks/ or todos/ dir.
export const discover = async (
  roots: string[],
  pattern = "**/{tasks,todos}/**/*.md",
): Promise<string[]> =>
  [
    ...new Set(
      (await Promise.all(roots.map((cwd) => glob([pattern], { cwd, absolute: true })))).flat(),
    ),
  ].sort();
