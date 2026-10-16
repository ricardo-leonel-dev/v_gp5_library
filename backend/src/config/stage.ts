import type { StorageAdapter } from "../storage/adapter";
import { LocalFsStorageAdapter } from "../storage/local-fs-adapter";
import stagesConfig from "./stages.json";

export type Stage = "dev" | "staging" | "main";
const KNOWN_STAGES: readonly Stage[] = ["dev", "staging", "main"];

export interface DbProviderConfig {
  provider: string;
  connectionEnv: string;
  defaultUrl?: string;
}
export interface StorageProviderConfig {
  provider: string;
  dirEnv: string;
  defaultDir?: string;
}
export interface CorsProviderConfig {
  allowedOriginsEnv: string;
  defaultOrigins?: string[];
}
export interface StageConfig {
  db: DbProviderConfig;
  storage: StorageProviderConfig;
  cors: CorsProviderConfig;
}
export type StagesFile = Record<Stage, StageConfig>;

export class StageConfigError extends Error {}

export function getActiveStage(env: NodeJS.ProcessEnv = process.env): Stage {
  const raw = env.APP_STAGE;
  if (raw === undefined || raw === "") return "dev";
  if ((KNOWN_STAGES as readonly string[]).includes(raw)) return raw as Stage;
  throw new StageConfigError(
    `invalid APP_STAGE "${raw}" (expected one of ${KNOWN_STAGES.join(", ")})`,
  );
}

export function resolveDatabaseUrl(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { connectionEnv, defaultUrl } = config[stage].db;
  const fromEnv = env[connectionEnv];
  if (fromEnv) return fromEnv;
  if (defaultUrl !== undefined) return defaultUrl;
  throw new StageConfigError(
    `stage "${stage}" requires "${connectionEnv}" to be set (no default configured)`,
  );
}

export function resolveStorageDir(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { dirEnv, defaultDir } = config[stage].storage;
  const fromEnv = env[dirEnv];
  if (fromEnv) return fromEnv;
  if (defaultDir !== undefined) return defaultDir;
  throw new StageConfigError(
    `stage "${stage}" requires "${dirEnv}" to be set (no default configured)`,
  );
}

export function createStorageAdapter(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): StorageAdapter {
  const { provider } = config[stage].storage;
  switch (provider) {
    case "local-fs":
      return new LocalFsStorageAdapter(resolveStorageDir(stage, config, env));
    default:
      throw new StageConfigError(`unrecognized storage provider "${provider}" for stage "${stage}"`);
  }
}

export function resolveAllowedOrigins(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const { allowedOriginsEnv, defaultOrigins } = config[stage].cors;
  const raw = env[allowedOriginsEnv];
  let resolved: string[];
  if (raw !== undefined && raw !== "") {
    resolved = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } else if (defaultOrigins !== undefined) {
    resolved = [...defaultOrigins];
  } else {
    throw new StageConfigError(
      `stage "${stage}" requires "${allowedOriginsEnv}" to be set (no default configured)`,
    );
  }
  if (resolved.includes("*")) {
    throw new StageConfigError(
      `wildcard origin "*" is not allowed in "${allowedOriginsEnv}" for stage "${stage}" (requests carry Authorization)`,
    );
  }
  return resolved;
}