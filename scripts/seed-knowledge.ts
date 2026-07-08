/**
 * Siembra la base de conocimiento técnico de DTECNOC en el vector store (RAG).
 * Crea filas EmbeddingDocument (para el panel admin) e ingesta sus embeddings
 * (chunking + gemini-embedding-001) igual que la ruta /api/admin/documents. §3.3
 *
 * Uso: npx tsx scripts/seed-knowledge.ts
 * Requiere GOOGLE_API_KEY y DATABASE_URL con la extensión `vector`.
 */
import "dotenv/config";
import { validateSecrets } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { ingestDocument, deleteDocumentVectors } from "@/lib/tools/rag";

const DOCS: Array<{ title: string; category: string; content: string }> = [
  {
    title: "Instalación Starlink",
    category: "KIT_STARLINK",
    content:
      "El Kit Starlink incluye la antena (plato), el router Wi-Fi, el cable de conexión y la base. " +
      "La instalación requiere una vista despejada del cielo, sin árboles ni edificios que obstruyan. " +
      "La antena se orienta automáticamente; solo necesita energía eléctrica y unos minutos para alinearse. " +
      "Velocidades típicas: 50–200 Mbps de bajada. DTECNOC realiza la instalación en Trujillo y alrededores; " +
      "para otras ciudades se coordina con el técnico. La garantía del equipo es de 12 meses.",
  },
  {
    title: "Kit DirecTV — instalación y canales",
    category: "KIT_DIRECTV",
    content:
      "El Kit DirecTV prepago incluye antena satelital, decodificador, control remoto y tarjeta. " +
      "Requiere instalación con orientación de la antena hacia el satélite (sur, sin obstrucciones). " +
      "La recarga se hace por Yape, agentes o la app. DTECNOC instala en domicilio dentro de Trujillo. " +
      "El servicio de instalación de antena satelital requiere técnico certificado.",
  },
  {
    title: "Paneles solares — dimensionamiento",
    category: "PANEL_SOLAR",
    content:
      "Un panel solar de 550W genera aproximadamente 2.2 kWh/día en Trujillo (5 horas sol pico). " +
      "Para un hogar básico (focos LED, TV, cargas de celular) suelen bastar 2–4 paneles con batería e inversor. " +
      "La instalación incluye estructura, cableado, controlador de carga MPPT e inversor. " +
      "Requiere instalación con técnico. Garantía de paneles: 10 años; inversor: 2 años.",
  },
  {
    title: "Cámaras de seguridad — cobertura",
    category: "CAMARA",
    content:
      "Las cámaras de seguridad IP soportan visión nocturna, detección de movimiento y grabación en la nube o NVR. " +
      "La instalación incluye montaje, cableado y configuración de la app para ver en el celular. " +
      "Una cámara cubre un ángulo de ~90°; para un local se recomiendan 2–4 cámaras. " +
      "Requiere instalación con técnico. Se pueden ver de forma remota vía internet.",
  },
  {
    title: "Garantía y soporte",
    category: "general",
    content:
      "Todos los equipos DTECNOC tienen garantía de fábrica. Smartphones y tablets: 12 meses. " +
      "Kits Starlink/DirecTV: 12 meses. Paneles solares: 10 años. La garantía cubre defectos de fábrica, " +
      "no daños por mal uso. El soporte técnico se solicita al 044-123-456. Las instalaciones tienen " +
      "30 días de garantía de servicio.",
  },
];

async function main() {
  validateSecrets();
  console.log(`Sembrando ${DOCS.length} documentos de conocimiento...`);
  let totalChunks = 0;
  for (const d of DOCS) {
    // Evita duplicados por título (idempotente).
    const existing = await prisma.embeddingDocument.findFirst({
      where: { metadata_json: { path: ["title"], equals: d.title } },
    });
    if (existing) {
      await deleteDocumentVectors(existing.id);
      await prisma.embeddingDocument.delete({ where: { id: existing.id } });
    }
    const doc = await prisma.embeddingDocument.create({
      data: {
        content: d.content,
        metadata_json: { title: d.title, category: d.category },
      },
    });
    const { chunks } = await ingestDocument(doc.id, d.content, {
      title: d.title,
      category: d.category,
    });
    totalChunks += chunks;
    console.log(`  ✓ ${d.title} → ${chunks} chunk(s)`);
  }
  console.log(`Listo. ${DOCS.length} documentos, ${totalChunks} chunks indexados.`);
}

main()
  .then(() => process.exit(0)) // PGVectorStore deja un pool abierto; forzamos salida
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
