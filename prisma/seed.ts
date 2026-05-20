import "dotenv/config";
import { PrismaClient } from ".prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcrypt.hash("dtecnoc2024", 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: "admin@dtecnoc.com" },
    update: {},
    create: {
      email: "admin@dtecnoc.com",
      password: hashedPassword,
      name: "Administrador DTECNOC",
    },
  });
  console.log("Admin creado:", admin.email);

  const products = [
    {
      name: "Cable USB-C 1m",
      category: "ACCESORIO" as const,
      selling_price: 15,
      stock_quantity: 10,
      min_threshold: 3,
    },
    {
      name: "Cargador 65W USB-C",
      category: "ACCESORIO" as const,
      selling_price: 45,
      stock_quantity: 5,
      min_threshold: 3,
    },
    {
      name: "Samsung Galaxy A15",
      category: "SMARTPHONE" as const,
      selling_price: 650,
      stock_quantity: 2,
      min_threshold: 1,
    },
    {
      name: "iPhone 15 128GB",
      category: "SMARTPHONE" as const,
      selling_price: null,
      stock_quantity: 0,
      min_threshold: 0,
      description: "Precio bajo pedido - Just In Time",
    },
    {
      name: "Kit DirecTV Prepago",
      category: "KIT_DIRECTV" as const,
      selling_price: 180,
      stock_quantity: 4,
      min_threshold: 2,
    },
    {
      name: "Kit Starlink V2",
      category: "KIT_STARLINK" as const,
      selling_price: null,
      stock_quantity: 0,
      min_threshold: 0,
      description: "Precio bajo pedido - Just In Time",
    },
    {
      name: "Panel Solar 400W",
      category: "PANEL_SOLAR" as const,
      selling_price: null,
      stock_quantity: 0,
      min_threshold: 0,
      description: "Precio bajo pedido - Just In Time",
    },
    {
      name: "Instalación Cámara IP",
      category: "CAMARA" as const,
      selling_price: 120,
      stock_quantity: 99,
      min_threshold: 0,
      description: "Servicio de instalación de cámaras de seguridad",
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: "seed-" + p.name.toLowerCase().replace(/\s+/g, "-") },
      update: {},
      create: {
        id: "seed-" + p.name.toLowerCase().replace(/\s+/g, "-"),
        ...p,
      },
    });
  }
  console.log(`${products.length} productos creados`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
