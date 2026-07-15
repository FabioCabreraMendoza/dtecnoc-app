import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "test-jwt-secret";

const { GET } = await import("./route");
const { signToken } = await import("@/lib/auth");

const ADMIN_TOKEN = signToken({
  id: "admin-1",
  email: "admin@dtecnoc.com",
  name: "Admin Test",
  role: "ADMIN",
});

describe("GET /api/admin/me", () => {
  it("responde 401 sin cookie de sesión", async () => {
    const req = new NextRequest("http://localhost/api/admin/me");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("responde { ok: true } con una cookie admin_token válida", async () => {
    const req = new NextRequest("http://localhost/api/admin/me", {
      headers: { cookie: `admin_token=${ADMIN_TOKEN}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
