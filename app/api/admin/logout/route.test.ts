import { describe, it, expect } from "vitest";
import { POST } from "./route";

describe("POST /api/admin/logout", () => {
  it("responde ok y expira la cookie admin_token (Max-Age=0)", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("admin_token=");
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
