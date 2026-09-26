import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  type StagesFile,
  StageConfigError,
  createStorageAdapter,
  getActiveStage,
  resolveAllowedOrigins,
  resolveDatabaseUrl,
} from "./stage";
import stagesConfig from "./stages.json";
import { LocalFsStorageAdapter } from "../storage/local-fs-adapter";

function makeFixture(): StagesFile {
  return {
    dev: {
      db: {
        provider: "postgres",
        connectionEnv: "DATABASE_URL",
        defaultUrl: "postgres://fixture:fixture@localhost:5432/fixture_dev",
      },
      storage: { provider: "local-fs", dirEnv: "STORAGE_DIR", defaultDir: "./storage" },
      cors: {
        allowedOriginsEnv: "CORS_ALLOWED_ORIGINS",
        defaultOrigins: ["http://fixture.test:4200"],
      },
    },
    staging: {
      db: { provider: "postgres", connectionEnv: "DATABASE_URL" },
      storage: { provider: "local-fs", dirEnv: "STORAGE_DIR", defaultDir: "./storage" },
      cors: { allowedOriginsEnv: "CORS_ALLOWED_ORIGINS" },
    },
    main: {
      db: { provider: "postgres", connectionEnv: "DATABASE_URL" },
      storage: { provider: "local-fs", dirEnv: "STORAGE_DIR", defaultDir: "./storage" },
      cors: { allowedOriginsEnv: "CORS_ALLOWED_ORIGINS" },
    },
  };
}

describe("getActiveStage", () => {
  test("returns dev when APP_STAGE is unset", () => {
    expect(getActiveStage({})).toBe("dev");
  });

  test("returns dev when APP_STAGE is empty", () => {
    expect(getActiveStage({ APP_STAGE: "" })).toBe("dev");
  });

  test("returns staging when APP_STAGE='staging'", () => {
    expect(getActiveStage({ APP_STAGE: "staging" })).toBe("staging");
  });

  test("returns main when APP_STAGE='main'", () => {
    expect(getActiveStage({ APP_STAGE: "main" })).toBe("main");
  });

  test("throws StageConfigError naming the bogus value when APP_STAGE is unknown", () => {
    expect(() => getActiveStage({ APP_STAGE: "bogus" })).toThrow(StageConfigError);
    expect(() => getActiveStage({ APP_STAGE: "bogus" })).toThrow(/bogus/);
  });
});

describe("resolveDatabaseUrl", () => {
  test("returns the env var value when set, for every stage", () => {
    const config = makeFixture();
    const env = { DATABASE_URL: "postgres://from-env:5432/db" };
    expect(resolveDatabaseUrl("dev", config, env)).toBe("postgres://from-env:5432/db");
    expect(resolveDatabaseUrl("staging", config, env)).toBe("postgres://from-env:5432/db");
    expect(resolveDatabaseUrl("main", config, env)).toBe("postgres://from-env:5432/db");
  });

  test("falls back to dev.db.defaultUrl when DATABASE_URL is unset for stage dev", () => {
    const config = makeFixture();
    expect(resolveDatabaseUrl("dev", config, {})).toBe(
      "postgres://fixture:fixture@localhost:5432/fixture_dev",
    );
  });

  test("throws StageConfigError naming the stage and DATABASE_URL when staging has no env value and no defaultUrl", () => {
    const config = makeFixture();
    expect(() => resolveDatabaseUrl("staging", config, {})).toThrow(StageConfigError);
    expect(() => resolveDatabaseUrl("staging", config, {})).toThrow(/staging/);
    expect(() => resolveDatabaseUrl("staging", config, {})).toThrow(/DATABASE_URL/);
  });

  test("throws StageConfigError naming the stage and DATABASE_URL when main has no env value and no defaultUrl", () => {
    const config = makeFixture();
    expect(() => resolveDatabaseUrl("main", config, {})).toThrow(StageConfigError);
    expect(() => resolveDatabaseUrl("main", config, {})).toThrow(/main/);
    expect(() => resolveDatabaseUrl("main", config, {})).toThrow(/DATABASE_URL/);
  });
});

describe("createStorageAdapter", () => {
  test("returns a LocalFsStorageAdapter that round-trips under the STORAGE_DIR env value", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gp5-stage-"));
    try {
      const config = makeFixture();
      const adapter = createStorageAdapter(
        "dev",
        config,
        { STORAGE_DIR: dir },
      );
      expect(adapter).toBeInstanceOf(LocalFsStorageAdapter);

      const key = `songs/song-x/preset-${crypto.randomUUID()}.syx`;
      const bytes = new Uint8Array([10, 20, 30]);
      await adapter.put(key, bytes);
      const got = await adapter.get(key);
      expect(got).toEqual(bytes);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("falls back to defaultDir when STORAGE_DIR is unset", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gp5-stage-default-"));
    try {
      const config: StagesFile = {
        ...makeFixture(),
        dev: {
          db: { provider: "postgres", connectionEnv: "DATABASE_URL" },
          storage: { provider: "local-fs", dirEnv: "STORAGE_DIR", defaultDir: dir },
        },
      };
      const adapter = createStorageAdapter("dev", config, {});
      expect(adapter).toBeInstanceOf(LocalFsStorageAdapter);

      const key = `default-dir-test/preset-${crypto.randomUUID()}.syx`;
      const bytes = new Uint8Array([7, 7, 7]);
      await adapter.put(key, bytes);
      const got = await adapter.get(key);
      expect(got).toEqual(bytes);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("falls back to defaultDir for staging when STORAGE_DIR is unset (storage defaults apply even where db does not)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gp5-stage-staging-"));
    try {
      const config: StagesFile = {
        ...makeFixture(),
        staging: {
          db: { provider: "postgres", connectionEnv: "DATABASE_URL" },
          storage: { provider: "local-fs", dirEnv: "STORAGE_DIR", defaultDir: dir },
        },
      };
      const adapter = createStorageAdapter("staging", config, {});
      expect(adapter).toBeInstanceOf(LocalFsStorageAdapter);

      const key = `staging-test/preset-${crypto.randomUUID()}.syx`;
      const bytes = new Uint8Array([4, 5, 6]);
      await adapter.put(key, bytes);
      const got = await adapter.get(key);
      expect(got).toEqual(bytes);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("throws StageConfigError naming the unrecognized provider", () => {
    const config: StagesFile = {
      dev: {
        db: { provider: "postgres", connectionEnv: "DATABASE_URL" },
        storage: { provider: "s3", dirEnv: "STORAGE_DIR" },
      },
      staging: makeFixture().staging,
      main: makeFixture().main,
    };
    expect(() => createStorageAdapter("dev", config, {})).toThrow(StageConfigError);
    expect(() => createStorageAdapter("dev", config, {})).toThrow(/s3/);
  });
});

describe("resolveAllowedOrigins", () => {
  test("trims whitespace and drops empty entries from a comma-separated env value (R2)", () => {
    const config = makeFixture();
    expect(resolveAllowedOrigins("dev", config, { CORS_ALLOWED_ORIGINS: " http://a.test , ,http://b.test " })).toEqual([
      "http://a.test",
      "http://b.test",
    ]);
  });

  test("a non-empty env value overrides dev.cors.defaultOrigins (R2)", () => {
    const config = makeFixture();
    expect(resolveAllowedOrigins("dev", config, { CORS_ALLOWED_ORIGINS: "https://prod.test" })).toEqual([
      "https://prod.test",
    ]);
  });

  test("returns dev.cors.defaultOrigins when CORS_ALLOWED_ORIGINS is unset (R3)", () => {
    const config = makeFixture();
    expect(resolveAllowedOrigins("dev", config, {})).toEqual(["http://fixture.test:4200"]);
  });

  test("returns dev.cors.defaultOrigins when CORS_ALLOWED_ORIGINS is the empty string (R3)", () => {
    const config = makeFixture();
    expect(resolveAllowedOrigins("dev", config, { CORS_ALLOWED_ORIGINS: "" })).toEqual([
      "http://fixture.test:4200",
    ]);
  });

  test("the real src/config/stages.json declares dev.cors.defaultOrigins as [http://localhost:4200] (R3)", () => {
    expect(stagesConfig.dev.cors.defaultOrigins).toEqual(["http://localhost:4200"]);
  });

  test("throws StageConfigError naming the stage and CORS_ALLOWED_ORIGINS when staging has no env value and no defaultOrigins (R4)", () => {
    const config = makeFixture();
    expect(() => resolveAllowedOrigins("staging", config, {})).toThrow(StageConfigError);
    expect(() => resolveAllowedOrigins("staging", config, {})).toThrow(/staging/);
    expect(() => resolveAllowedOrigins("staging", config, {})).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  test("throws StageConfigError naming the stage and CORS_ALLOWED_ORIGINS when main has no env value and no defaultOrigins (R4)", () => {
    const config = makeFixture();
    expect(() => resolveAllowedOrigins("main", config, {})).toThrow(StageConfigError);
    expect(() => resolveAllowedOrigins("main", config, {})).toThrow(/main/);
    expect(() => resolveAllowedOrigins("main", config, {})).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  test("throws StageConfigError naming '*' when the resolved list includes the wildcard (R5)", () => {
    const config = makeFixture();
    expect(() =>
      resolveAllowedOrigins("dev", config, { CORS_ALLOWED_ORIGINS: "http://a.test,*" }),
    ).toThrow(StageConfigError);
    expect(() =>
      resolveAllowedOrigins("dev", config, { CORS_ALLOWED_ORIGINS: "http://a.test,*" }),
    ).toThrow(/\*/);
  });
});