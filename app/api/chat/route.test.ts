import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const convFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { clientConversation: { findUnique: (...a: unknown[]) => convFindUnique(...a) } },
}));
vi.mock("@/lib/agents/sales", () => ({ salesAgent: vi.fn() }));
vi.mock("@/lib/agents/inventory", () => ({ inventoryAgent: vi.fn() }));
vi.mock("@/lib/agents/logistics", () => ({ logisticsAgent: vi.fn() }));

const { GET, POST } = await import("./route");

const SID = "3f2b8c1e-7a4d-4e9b-8c1a-2d5f6a7b8c9d";
let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

function get(sid: string | null, ip = nextIp()) {
  const url = `http://localhost/api/chat${sid === null ? "" : `?session_id=${sid}`}`;
  return GET(new NextRequest(url, { headers: { "x-forwarded-for": ip } }));
}

function post(body: unknown, ip = nextIp()) {
  return POST(
    new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    })
  );
}

describe("/api/chat — acceso y límites", () => {
  beforeEach(() => {
    convFindUnique.mockReset();
    convFindUnique.mockResolvedValue(null);
  });

  it("regresión: GET rechaza un session_id adivinable (no UUID)", async () => {
    for (const sid of ["1", "juan", "admin", "web_1", null]) {
      expect((await get(sid)).status).toBe(400);
    }
    expect(convFindUnique).not.toHaveBeenCalled();
  });

  it("GET acepta un UUID y consulta la conversación", async () => {
    const res = await get(SID);
    expect(res.status).toBe(200);
    expect(convFindUnique).toHaveBeenCalledTimes(1);
  });

  it("POST rechaza session_id inválido, message no-string o vacío", async () => {
    expect((await post({ session_id: "1", message: "hola" })).status).toBe(400);
    expect((await post({ session_id: SID, message: { a: 1 } })).status).toBe(400);
    expect((await post({ session_id: SID, message: "   " })).status).toBe(400);
    expect(convFindUnique).not.toHaveBeenCalled();
  });

  it("POST rechaza mensajes de más de 1000 caracteres", async () => {
    const res = await post({ session_id: SID, message: "a".repeat(1001) });
    expect(res.status).toBe(400);
    expect(convFindUnique).not.toHaveBeenCalled();
  });

  it("POST limita a 20 mensajes por minuto y por IP (429)", async () => {
    const ip = nextIp();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await post({ session_id: "x", message: "hola" }, ip)).status;
    expect(last).toBe(429);
  });

  it("POST corta conversaciones con 200 mensajes o más", async () => {
    convFindUnique.mockResolvedValue({ messages_json: new Array(200).fill({}) });
    const res = await post({ session_id: SID, message: "hola" });
    expect(res.status).toBe(429);
  });
});
