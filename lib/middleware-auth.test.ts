import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

process.env.JWT_SECRET = "test-jwt-secret";

const { requireAdmin } = await import("./middleware-auth");
const { signToken } = await import("./auth");

const VALID_TOKEN = signToken({
  id: "admin-1",
  email: "admin@dtecnoc.com",
  name: "Admin Test",
  role: "ADMIN",
});

function makeHandler() {
  return vi.fn(async () => NextResponse.json({ ok: true }));
}

describe("requireAdmin", () => {
  it("responde 401 'No autorizado' si no hay token (ni cookie ni header)", async () => {
    const handler = makeHandler();
    const req = new NextRequest("http://localhost/api/admin/orders");

    const res = await requireAdmin(handler)(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No autorizado" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("responde 401 'Token inválido' si el token no verifica (expirado/manipulado/otro secreto)", async () => {
    const handler = makeHandler();
    const req = new NextRequest("http://localhost/api/admin/orders", {
      headers: { authorization: "Bearer token-basura-invalido" },
    });

    const res = await requireAdmin(handler)(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Token inválido" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("llama al handler cuando el token del header Authorization es válido", async () => {
    const handler = makeHandler();
    const req = new NextRequest("http://localhost/api/admin/orders", {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    const res = await requireAdmin(handler)(req);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("llama al handler cuando el token viene en la cookie admin_token", async () => {
    const handler = makeHandler();
    const req = new NextRequest("http://localhost/api/admin/orders", {
      headers: { cookie: `admin_token=${VALID_TOKEN}` },
    });

    const res = await requireAdmin(handler)(req);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("la cookie tiene prioridad sobre el header si ambos están presentes", async () => {
    const handler = makeHandler();
    const req = new NextRequest("http://localhost/api/admin/orders", {
      headers: {
        cookie: `admin_token=${VALID_TOKEN}`,
        authorization: "Bearer token-basura-invalido",
      },
    });

    const res = await requireAdmin(handler)(req);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });
});
