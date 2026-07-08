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
    // ── Smartphones ──────────────────────────────────────────────
    {
      name: "Xiaomi Redmi Note 13",
      category: "SMARTPHONE" as const,
      selling_price: 899,
      stock_quantity: 4,
      min_threshold: 2,
    },
    {
      name: "Motorola Moto G54",
      category: "SMARTPHONE" as const,
      selling_price: 720,
      stock_quantity: 5,
      min_threshold: 2,
    },
    {
      name: "iPhone 13 128GB",
      category: "SMARTPHONE" as const,
      selling_price: null,
      stock_quantity: 0,
      min_threshold: 0,
      description: "Precio bajo pedido - Just In Time",
    },
    // ── Tablets ──────────────────────────────────────────────────
    {
      name: "Samsung Galaxy Tab A9",
      category: "TABLET" as const,
      selling_price: 750,
      stock_quantity: 3,
      min_threshold: 1,
    },
    {
      name: "Lenovo Tab M11",
      category: "TABLET" as const,
      selling_price: 620,
      stock_quantity: 2,
      min_threshold: 1,
    },
    // ── Accesorios ───────────────────────────────────────────────
    {
      name: "Audífonos Bluetooth TWS",
      category: "ACCESORIO" as const,
      selling_price: 90,
      stock_quantity: 12,
      min_threshold: 4,
    },
    {
      name: "Power Bank 20000mAh",
      category: "ACCESORIO" as const,
      selling_price: 75,
      stock_quantity: 8,
      min_threshold: 3,
    },
    {
      name: "Memoria microSD 128GB",
      category: "ACCESORIO" as const,
      selling_price: 55,
      stock_quantity: 15,
      min_threshold: 5,
    },
    {
      name: "Mica de vidrio templado",
      category: "ACCESORIO" as const,
      selling_price: 20,
      stock_quantity: 30,
      min_threshold: 8,
    },
    // ── Cámaras de seguridad ─────────────────────────────────────
    {
      name: "Cámara IP WiFi Exterior",
      category: "CAMARA" as const,
      selling_price: 160,
      stock_quantity: 6,
      min_threshold: 2,
    },
    {
      name: "Kit DVR 4 canales + 2 cámaras",
      category: "CAMARA" as const,
      selling_price: 480,
      stock_quantity: 2,
      min_threshold: 1,
    },
    // ── Kits ─────────────────────────────────────────────────────
    {
      name: "Antena Satelital DirecTV HD",
      category: "KIT_DIRECTV" as const,
      selling_price: 210,
      stock_quantity: 3,
      min_threshold: 1,
    },
    {
      name: "Kit Starlink Mini",
      category: "KIT_STARLINK" as const,
      selling_price: null,
      stock_quantity: 0,
      min_threshold: 0,
      description: "Precio bajo pedido - Just In Time",
    },
    // ── Paneles solares ──────────────────────────────────────────
    {
      name: "Panel Solar 550W",
      category: "PANEL_SOLAR" as const,
      selling_price: null,
      stock_quantity: 0,
      min_threshold: 0,
      description: "Precio bajo pedido - Just In Time",
    },
    // ── Impresoras ───────────────────────────────────────────────
    {
      name: "Impresora Epson L3250",
      category: "IMPRESORA" as const,
      selling_price: 890,
      stock_quantity: 3,
      min_threshold: 1,
    },
    {
      name: "Impresora Térmica de Tickets 58mm",
      category: "IMPRESORA" as const,
      selling_price: 320,
      stock_quantity: 4,
      min_threshold: 2,
    },
    // ── Servicios de instalación ─────────────────────────────────
    {
      name: "Instalación Kit Starlink",
      category: "INSTALACION" as const,
      selling_price: 150,
      stock_quantity: 99,
      min_threshold: 0,
      description: "Servicio de instalación de antena Starlink",
    },
    {
      name: "Instalación Panel Solar",
      category: "INSTALACION" as const,
      selling_price: 250,
      stock_quantity: 99,
      min_threshold: 0,
      description: "Servicio de instalación de paneles solares",
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
