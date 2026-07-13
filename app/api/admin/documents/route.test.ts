import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "test-jwt-secret";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { embeddingDocument: { findMany: (...args: unknown[]) => findMany(...args) } },
}));
vi.mock("@/lib/tools/rag", () => ({
  ingestDocument: vi.fn(),
  deleteDocumentVectors: vi.fn(),
}));

const { GET } = await import("./route");
const { signToken } = await import("@/lib/auth");

const ADMIN_TOKEN = signToken({
  id: "admin-1",
  email: "admin@dtecnoc.com",
  name: "Admin Test",
  role: "ADMIN",
});

function authedRequest() {
  return new NextRequest("http://localhost/api/admin/documents", {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

describe("GET /api/admin/documents", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  // Regresión: bug real — el filtro Prisma NOT: { metadata_json: { path: ["type"],
  // equals: "gmail_history_id" } } excluía TODOS los documentos reales (los que no
  // tienen la clave "type" en metadata_json evalúan a NULL, y NOT NULL también es
  // NULL, así que la fila se excluye por la lógica de 3 valores de SQL). El admin
  // veía "sin documentos" pese a tener documentos reales funcionando en el RAG.
  it("regresión: incluye documentos reales que NO tienen la clave 'type' en metadata_json", async () => {
    findMany.mockResolvedValue([
      { id: "doc-1", content: "...", metadata_json: { title: "Instalación Starlink", category: "KIT_STARLINK" } },
      { id: "doc-2", content: "...", metadata_json: { title: "Garantía y soporte", category: "general" } },
    ]);

    const res = await GET(authedRequest());
    const data = await res.json();

    expect(data).toHaveLength(2);
    expect(data.map((d: { id: string }) => d.id)).toEqual(["doc-1", "doc-2"]);
  });

  it("excluye el registro interno de tipo gmail_history_id", async () => {
    findMany.mockResolvedValue([
      { id: "doc-1", content: "...", metadata_json: { title: "Instalación Starlink", category: "KIT_STARLINK" } },
      { id: "internal-1", content: "12345", metadata_json: { type: "gmail_history_id" } },
    ]);

    const res = await GET(authedRequest());
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("doc-1");
  });

  it("no truena si metadata_json es null", async () => {
    findMany.mockResolvedValue([
      { id: "doc-1", content: "...", metadata_json: null },
    ]);

    const res = await GET(authedRequest());
    const data = await res.json();

    expect(data).toHaveLength(1);
  });
});
