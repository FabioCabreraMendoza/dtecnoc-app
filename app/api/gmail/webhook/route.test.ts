import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { embeddingDocument: { findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

const { POST } = await import("./route");

function req(url: string) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify({}), // sin message.data -> corta temprano como "ignored"
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/gmail/webhook — secreto compartido", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  // Regresión: bug real — el webhook no tenía ninguna autenticación, cualquiera
  // que descubriera la URL podía dispararlo y gastar cuota real de Gmail API.
  it("regresión: rechaza (sin procesar) si GMAIL_WEBHOOK_SECRET está configurado y no coincide", async () => {
    process.env.GMAIL_WEBHOOK_SECRET = "topsecret";
    const res = await POST(req("http://localhost/api/gmail/webhook?secret=incorrecto"));
    const data = await res.json();
    expect(data.status).toBe("unauthorized");
  });

  it("regresión: rechaza si no se manda ningún secreto en la URL", async () => {
    process.env.GMAIL_WEBHOOK_SECRET = "topsecret";
    const res = await POST(req("http://localhost/api/gmail/webhook"));
    const data = await res.json();
    expect(data.status).toBe("unauthorized");
  });

  it("acepta (sigue procesando) si el secreto coincide", async () => {
    process.env.GMAIL_WEBHOOK_SECRET = "topsecret";
    const res = await POST(req("http://localhost/api/gmail/webhook?secret=topsecret"));
    const data = await res.json();
    // Body vacío -> pasa el guard de auth y cae en "ignored" (sin message.data),
    // NO en "unauthorized".
    expect(data.status).toBe("ignored");
  });

  it("si GMAIL_WEBHOOK_SECRET no está configurado, no bloquea (compatibilidad local)", async () => {
    delete process.env.GMAIL_WEBHOOK_SECRET;
    const res = await POST(req("http://localhost/api/gmail/webhook"));
    const data = await res.json();
    expect(data.status).toBe("ignored");
  });
});
