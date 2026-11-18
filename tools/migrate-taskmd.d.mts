// Declarations for tools/migrate-taskmd.mjs (the tool is plain ESM per the
// house rule for tools/; the .d.mts exists only so test/*.ts type-checks clean)
export type Result<T> = Readonly<{ ok: true; v: T } | { ok: false; e: string }>;
export type IdTable = ReadonlyMap<string, string>;
export type CardInput = Readonly<{ path: string; data: Record<string, unknown> }>;
export type ConvertInput = Readonly<{
  path: string;
  text: string;
  data: Record<string, unknown>;
  table: IdTable;
}>;
export type ConvertStats = Readonly<{
  deps: number;
  parent: boolean;
  titleDropped: boolean;
  h1Materialized: boolean;
  statusFrom: string | null;
  statusTo: string | null;
}>;
export type Plan = Readonly<{
  writes: ReadonlyArray<Readonly<{ path: string; text: string; stats: ConvertStats }>>;
  skipped: Readonly<{ noId: number; stemMismatch: number }>;
}>;
export type MigrationSummary = Readonly<{
  root: string;
  discovered: number;
  rewritten: number;
  noId: number;
  stemMismatch: number;
  edges: number;
  titlesDropped: number;
  blockedStripped: number;
  completedToDone: number;
  parentsRewritten: number;
  h1Materialized: number;
}>;

export declare const mapStatus: (status: string) => string;
export declare const buildIdTable: (cards: ReadonlyArray<CardInput>) => Result<IdTable>;
export declare const resolveRef: (ref: string, ownId: string, table: IdTable) => Result<string>;
export declare const convertCard: (
  input: ConvertInput,
) => Result<Readonly<{ text: string; stats: ConvertStats }>>;
export declare const planCorpus: (
  entries: ReadonlyArray<Readonly<{ path: string; text: string }>>,
) => Result<Plan>;
export declare const migrateCorpus: (root: string) => Promise<Result<MigrationSummary>>;
