import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// APP_ENV se calcula una sola vez al cargar el módulo (const de nivel superior),
// así que para probar distintos valores hay que resetear el registro de módulos
// de Vitest y reimportar dinámicamente después de mutar process.env.
async function loadConfigWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  const prev = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
  }
  const mod = await import("./config");
  process.env = prev;
  return mod;
}

describe("resolveEnv / APP_ENV", () => {
  it("usa 'development' por defecto si no hay APP_ENV ni NODE_ENV", async () => {
    const { APP_ENV } = await loadConfigWith({ APP_ENV: undefined, NODE_ENV: undefined });
    expect(APP_ENV).toBe("development");
  });

  it("respeta APP_ENV='staging'", async () => {
    const { APP_ENV } = await loadConfigWith({ APP_ENV: "staging" });
    expect(APP_ENV).toBe("staging");
  });

  it("respeta APP_ENV='production'", async () => {
    const { APP_ENV } = await loadConfigWith({ APP_ENV: "production" });
    expect(APP_ENV).toBe("production");
  });

  it("es insensible a mayúsculas ('PRODUCTION' → production)", async () => {
    const { APP_ENV } = await loadConfigWith({ APP_ENV: "PRODUCTION" });
    expect(APP_ENV).toBe("production");
  });

  it("cae a 'development' ante un valor desconocido", async () => {
    const { APP_ENV } = await loadConfigWith({ APP_ENV: "qa" });
    expect(APP_ENV).toBe("development");
  });

  it("usa NODE_ENV como respaldo si APP_ENV no está definido", async () => {
    const { APP_ENV } = await loadConfigWith({ APP_ENV: undefined, NODE_ENV: "production" });
    expect(APP_ENV).toBe("production");
  });

  it("APP_ENV tiene prioridad sobre NODE_ENV", async () => {
    const { APP_ENV } = await loadConfigWith({ APP_ENV: "staging", NODE_ENV: "production" });
    expect(APP_ENV).toBe("staging");
  });
});

describe("config (matriz SETTINGS por entorno)", () => {
  it("development usa logLevel debug y proyecto dtecnoc-dev", async () => {
    const { config } = await loadConfigWith({ APP_ENV: "development" });
    expect(config.logLevel).toBe("debug");
    expect(config.langsmithProject).toBe("dtecnoc-dev");
  });

  it("production usa logLevel warn y proyecto dtecnoc-prod", async () => {
    const { config } = await loadConfigWith({ APP_ENV: "production" });
    expect(config.logLevel).toBe("warn");
    expect(config.langsmithProject).toBe("dtecnoc-prod");
  });

  it("todos los entornos comparten el mismo ragTopK", async () => {
    const dev = await loadConfigWith({ APP_ENV: "development" });
    const prod = await loadConfigWith({ APP_ENV: "production" });
    expect(dev.config.ragTopK).toBe(prod.config.ragTopK);
  });
});

describe("validateSecrets", () => {
  const REQUIRED = {
    DATABASE_URL: "postgresql://user:pass@host:5432/db",
    DEEPSEEK_API_KEY: "sk-test",
    GOOGLE_API_KEY: "google-test-key",
    JWT_SECRET: "jwt-test-secret",
    ADMIN_SECRET: "admin-test-secret",
  };
  let prevEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    prevEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = prevEnv;
  });

  it("retorna los secretos parseados cuando todos están presentes", async () => {
    Object.assign(process.env, REQUIRED);
    const { validateSecrets } = await import("./config");
    const result = validateSecrets();
    expect(result.DEEPSEEK_API_KEY).toBe("sk-test");
    expect(result.GOOGLE_API_KEY).toBe("google-test-key");
  });

  it("lanza con mensaje claro si falta DEEPSEEK_API_KEY", async () => {
    Object.assign(process.env, REQUIRED, { DEEPSEEK_API_KEY: "" });
    const { validateSecrets } = await import("./config");
    expect(() => validateSecrets()).toThrow(/DEEPSEEK_API_KEY requerido/);
  });

  it("lanza con mensaje claro si falta GOOGLE_API_KEY", async () => {
    Object.assign(process.env, REQUIRED, { GOOGLE_API_KEY: "" });
    const { validateSecrets } = await import("./config");
    expect(() => validateSecrets()).toThrow(/GOOGLE_API_KEY requerido/);
  });

  it("el mensaje de error incluye el APP_ENV actual", async () => {
    Object.assign(process.env, REQUIRED, { DATABASE_URL: "", APP_ENV: "staging" });
    vi.resetModules();
    const { validateSecrets } = await import("./config");
    expect(() => validateSecrets()).toThrow(/APP_ENV=staging/);
  });
});
