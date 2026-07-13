import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "test-jwt-secret";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { supplierChat: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { GET } = await import("./route");
const { signToken } = await import("@/lib/auth");

const ADMIN_TOKEN = signToken({
  id: "admin-1",
  email: "admin@dtecnoc.com",
  name: "Admin Test",
  role: "ADMIN",
});

describe("GET /api/cron/check-supplier-replies — autenticación dual", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("responde 401 sin ningún header de autenticación", async () => {
    const req = new NextRequest("http://localhost/api/cron/check-supplier-replies");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("responde 401 con un Bearer que no coincide con CRON_SECRET ni es un JWT válido", async () => {
    const req = new NextRequest("http://localhost/api/cron/check-supplier-replies", {
      headers: { authorization: "Bearer token-basura" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("responde 200 con el Bearer correcto de CRON_SECRET (invocación de Vercel Cron)", async () => {
    const req = new NextRequest("http://localhost/api/cron/check-supplier-replies", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  // Regresión: bug real — el botón "Verificar todo" del panel admin llamaba a
  // este endpoint sin ningún header, y el comentario decía que se permitía el
  // disparo manual desde el admin pero el código nunca lo implementaba. Con
  // CRON_SECRET configurado en Vercel, el botón fallaba en silencio con 401.
  it("regresión: responde 200 con un JWT de admin válido en el header Authorization", async () => {
    const req = new NextRequest("http://localhost/api/cron/check-supplier-replies", {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("responde 200 con un JWT de admin válido en la cookie admin_token", async () => {
    const req = new NextRequest("http://localhost/api/cron/check-supplier-replies", {
      headers: { cookie: `admin_token=${ADMIN_TOKEN}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("sin CRON_SECRET configurado, igual exige un JWT de admin válido", async () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest("http://localhost/api/cron/check-supplier-replies");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
