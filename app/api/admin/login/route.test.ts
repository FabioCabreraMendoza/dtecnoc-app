import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "test-jwt-secret";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const comparePassword = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, comparePassword: (...args: unknown[]) => comparePassword(...args) };
});

const { POST } = await import("./route");

const BASE_ADMIN = {
  id: "admin-1",
  email: "admin@dtecnoc.com",
  password: "hashed-irrelevant",
  name: "Admin Test",
  failed_login_attempts: 0,
  locked_until: null as Date | null,
};

function loginReq(email: string, password: string) {
  return new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("POST /api/admin/login — rate limiting", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    comparePassword.mockReset();
  });

  it("incrementa failed_login_attempts en cada intento fallido, sin bloquear todavía", async () => {
    findUnique.mockResolvedValue({ ...BASE_ADMIN, failed_login_attempts: 2 });
    comparePassword.mockResolvedValue(false);

    const res = await POST(loginReq("admin@dtecnoc.com", "mal"));

    expect(res.status).toBe(401);
    expect(update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { failed_login_attempts: 3, locked_until: null },
    });
  });

  // Regresión: bug real — el login no tenía ningún límite de intentos, así
  // que era vulnerable a fuerza bruta sin restricción alguna.
  it("regresión: bloquea la cuenta al llegar al 5to intento fallido", async () => {
    findUnique.mockResolvedValue({ ...BASE_ADMIN, failed_login_attempts: 4 });
    comparePassword.mockResolvedValue(false);

    const res = await POST(loginReq("admin@dtecnoc.com", "mal"));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toMatch(/demasiados intentos/i);
    const updateArgs = update.mock.calls[0][0];
    expect(updateArgs.data.failed_login_attempts).toBe(0);
    expect(updateArgs.data.locked_until).toBeInstanceOf(Date);
  });

  it("rechaza con 429 si la cuenta ya está bloqueada, sin siquiera comparar la contraseña", async () => {
    findUnique.mockResolvedValue({
      ...BASE_ADMIN,
      locked_until: new Date(Date.now() + 5 * 60_000),
    });

    const res = await POST(loginReq("admin@dtecnoc.com", "cualquiera"));

    expect(res.status).toBe(429);
    expect(comparePassword).not.toHaveBeenCalled();
  });

  it("permite login normal una vez que el bloqueo ya expiró", async () => {
    findUnique.mockResolvedValue({
      ...BASE_ADMIN,
      failed_login_attempts: 0,
      locked_until: new Date(Date.now() - 60_000), // expiró hace 1 minuto
    });
    comparePassword.mockResolvedValue(true);

    const res = await POST(loginReq("admin@dtecnoc.com", "correcta"));

    expect(res.status).toBe(200);
  });

  it("resetea failed_login_attempts/locked_until en un login correcto tras intentos fallidos previos", async () => {
    findUnique.mockResolvedValue({ ...BASE_ADMIN, failed_login_attempts: 3 });
    comparePassword.mockResolvedValue(true);

    const res = await POST(loginReq("admin@dtecnoc.com", "correcta"));

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { failed_login_attempts: 0, locked_until: null },
    });
  });

  it("un login correcto sin intentos fallidos previos no llama a update de más", async () => {
    findUnique.mockResolvedValue({ ...BASE_ADMIN });
    comparePassword.mockResolvedValue(true);

    const res = await POST(loginReq("admin@dtecnoc.com", "correcta"));

    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("el JWT ya no viaja en el body de la respuesta (solo en la cookie httpOnly)", async () => {
    findUnique.mockResolvedValue({ ...BASE_ADMIN });
    comparePassword.mockResolvedValue(true);

    const res = await POST(loginReq("admin@dtecnoc.com", "correcta"));
    const data = await res.json();

    expect(data.token).toBeUndefined();
    expect(res.headers.get("set-cookie")).toContain("admin_token=");
  });
});
