import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

export async function read_db_stock(product_id: string) {
  const product = await prisma.product.findUnique({
    where: { id: product_id },
    select: {
      id: true,
      name: true,
      stock_quantity: true,
      min_threshold: true,
      selling_price: true,
      cost_price: true,
      category: true,
    },
  });
  if (!product) return { error: "Producto no encontrado" };
  return {
    product_id: product.id,
    name: product.name,
    stock_quantity: product.stock_quantity,
    min_threshold: product.min_threshold,
    needs_restock: product.stock_quantity <= product.min_threshold,
    is_just_in_time: product.stock_quantity === 0,
    selling_price: product.selling_price?.toString() ?? null,
    category: product.category,
  };
}

export async function check_product_availability(product_id: string) {
  return read_db_stock(product_id);
}

// Brand names whose SYNONYMS entry maps them to a generic category.
// When the query contains one of these, the top search result MUST contain
// that brand name in its product name — otherwise it's a different brand.
const BRAND_WORDS = new Set([
  "iphone", "samsung", "xiaomi", "huawei", "motorola", "nokia", "lg",
  "oppo", "vivo", "realme", "pixel", "oneplus", "asus", "lenovo",
  "directv", "starlink",
]);

export async function find_and_add_product(order_id: string, query: string, quantity = 1) {
  const searchResult = await search_products(query);
  if (!("results" in searchResult) || searchResult.results.length === 0) {
    return { error: "Producto no encontrado en el catálogo.", query };
  }

  const best = searchResult.results[0];

  // Relevance check: if the query contains a specific brand word (e.g. "iphone")
  // verify the best result's name actually contains that brand.
  // Without this, "iphone 15" would match Samsung via the "smartphone" synonym.
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, "");
  const queryWords = norm(query).split(/\s+/).filter(w => w.length >= 3);
  const brandWordsInQuery = queryWords.filter(w => BRAND_WORDS.has(w));
  if (brandWordsInQuery.length > 0) {
    const bestNorm = norm(best.name);
    const hasMatch = brandWordsInQuery.some(w => bestNorm.includes(w));
    if (!hasMatch) {
      return { error: "Producto no encontrado en el catálogo.", query };
    }
  }
  const stock = await read_db_stock(best.id);
  if ("error" in stock) return { error: stock.error };

  const addResult = await add_order_item(order_id, best.id, quantity);
  const alreadyAdded = "already_added" in addResult && addResult.already_added === true;

  return {
    product_id: best.id,
    name: stock.name,
    category: stock.category,
    stock_quantity: stock.stock_quantity,
    selling_price: stock.selling_price,
    is_just_in_time: stock.is_just_in_time,
    needs_restock: stock.needs_restock,
    added_to_order: "success" in addResult ? addResult.success : false,
    already_added: alreadyAdded,
    other_results: searchResult.results.slice(1).map(r => r.name),
  };
}

const SYNONYMS: Record<string, string> = {
  // smartphones
  telefono: "smartphone", telefonos: "smartphone",
  celular: "smartphone",  celulares: "smartphone",
  movil: "smartphone",    moviles: "smartphone",
  iphone: "smartphone",   samsung: "smartphone",
  // tablets
  tablet: "tablet", tablets: "tablet",
  // solar
  panel: "solar", paneles: "solar",
  solar: "solar", solares: "solar",
  // cameras
  camara: "camara", camaras: "camara", camara_seguridad: "camara",
  // starlink
  starlink: "starlink", antena: "starlink", antenas: "starlink", internet: "starlink",
  // directv
  directv: "directv", kit: "directv",
  // accessories
  accesorio: "accesorio", accesorios: "accesorio",
  cable: "cable", cables: "cable",
  cargador: "cargador", cargadores: "cargador",
  // other
  impresora: "impresora", impresoras: "impresora",
};

export async function search_products(query: string) {
  const normalized = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/gi, "");

  const words = normalized
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .flatMap(w => {
      const synonym = SYNONYMS[w];
      if (synonym) return [synonym];
      // Fallback: try stripping Spanish plural suffixes to get singular
      const singular = w.endsWith("es") ? w.slice(0, -2) : w.endsWith("s") ? w.slice(0, -1) : w;
      const singularSynonym = singular !== w ? SYNONYMS[singular] : undefined;
      return singularSynonym ? [singularSynonym] : [w];
    })
    .map(w => w.replace(/'/g, "''"));

  const uniqueWords = [...new Set(words)];
  if (uniqueWords.length === 0) return { results: [], message: "Término de búsqueda muy corto." };

  const conditions = uniqueWords
    .map(w => `(name ILIKE '%${w}%' OR category::text ILIKE '%${w}%')`)
    .join(" OR ");

  const products = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; category: string; selling_price: number | null; stock_quantity: number }>
  >(
    `SELECT id, name, category, selling_price, stock_quantity FROM "Product" WHERE ${conditions} LIMIT 5`
  );

  if (products.length === 0) return { results: [], message: "No se encontraron productos. Intenta con otro término." };
  return {
    results: products.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.selling_price?.toString() ?? "bajo pedido",
      stock: p.stock_quantity,
    })),
  };
}

export async function get_order_status(order_id: string) {
  const order = await prisma.order.findUnique({
    where: { id: order_id },
    include: {
      client: true,
      items: { include: { product: true } },
      chat_thread: true,
    },
  });
  if (!order) return { error: "Pedido no encontrado" };
  return {
    order_id: order.id,
    status: order.status,
    client_name: order.client.name,
    client_platform_id: order.client.platform_id,
    total_price: order.total_price?.toString() ?? null,
    notes: order.notes ?? null,
    items: order.items.map((i) => ({
      product_name: i.product.name,
      quantity: i.quantity,
      category: i.product.category,
    })),
    has_chat_thread: !!order.chat_thread,
  };
}

export async function add_order_item(
  order_id: string,
  product_id: string,
  quantity: number = 1
) {
  const product = await prisma.product.findUnique({ where: { id: product_id } });
  if (!product) return { error: "Producto no encontrado" };

  const existing = await prisma.orderItem.findFirst({ where: { order_id, product_id } });
  if (existing) {
    return { success: true, already_added: true, product_name: product.name };
  }

  await prisma.orderItem.create({
    data: { order_id, product_id, quantity, unit_price: product.selling_price ?? 0 },
  });

  return { success: true, product_name: product.name, quantity };
}

const STATUS_RANK: Record<string, number> = {
  CONSULTANDO: 0,
  ESPERANDO_PROVEEDOR: 1,
  COTIZADO: 2,
  PAGO_PENDIENTE: 3,
  PAGO_CONFIRMADO: 4,
  EN_RUTA: 5,
  COMPLETADO: 6,
  CANCELADO: 7,
};

export async function update_order_status(
  order_id: string,
  status: OrderStatus,
  requested_product?: string
) {
  const current = await prisma.order.findUnique({ where: { id: order_id }, select: { status: true } });
  if (current && (STATUS_RANK[status] ?? 0) < (STATUS_RANK[current.status] ?? 0)) {
    return { success: false, skipped: true, reason: `Estado actual ${current.status} es más avanzado que ${status}. No se retrocede.` };
  }
  const data: Parameters<typeof prisma.order.update>[0]["data"] = { status, updated_at: new Date() };
  if (requested_product) {
    data.notes = `Cliente solicita: ${requested_product}`;
  }
  const order = await prisma.order.update({ where: { id: order_id }, data });
  return { success: true, order_id: order.id, new_status: order.status };
}
