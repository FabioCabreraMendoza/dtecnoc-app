import "dotenv/config";
import { PrismaClient } from ".prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🧹 Limpiando datos transaccionales...\n");

  const items = await prisma.orderItem.deleteMany({});
  console.log(`✓ OrderItems eliminados: ${items.count}`);

  const supplierChats = await prisma.supplierChat.deleteMany({});
  console.log(`✓ SupplierChats eliminados: ${supplierChats.count}`);

  const conversations = await prisma.clientConversation.deleteMany({});
  console.log(`✓ ClientConversations eliminadas: ${conversations.count}`);

  const orders = await prisma.order.deleteMany({});
  console.log(`✓ Orders eliminados: ${orders.count}`);

  const clients = await prisma.user.deleteMany({ where: { role: "CLIENTE" } });
  console.log(`✓ Usuarios CLIENTE eliminados: ${clients.count}`);

  // Reset Gmail history ID so webhook starts fresh
  const gmailHistory = await prisma.embeddingDocument.deleteMany({
    where: { metadata_json: { path: ["type"], equals: "gmail_history_id" } },
  });
  console.log(`✓ Gmail history ID reseteado: ${gmailHistory.count}`);

  console.log("\n✅ Base de datos limpia. Productos y admin intactos.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
