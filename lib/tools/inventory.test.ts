import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "@prisma/client";

const findUnique = vi.fn();
const update = vi.fn();
const productFindUnique = vi.fn();
const orderItemFindFirst = vi.fn();
const orderItemCreate = vi.fn();
const queryRawUnsafe = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
    product: {
      findUnique: (...args: unknown[]) => productFindUnique(...args),
    },
    orderItem: {
      findFirst: (...args: unknown[]) => orderItemFindFirst(...args),
      create: (...args: unknown[]) => orderItemCreate(...args),
    },
    $queryRawUnsafe: (...args: unknown[]) => queryRawUnsafe(...args),
  },
}));

// Import después del mock para que use la versión mockeada de "@/lib/prisma".
const { update_order_status, find_and_add_product, save_customer_details } =
  await import("./inventory");

describe("update_order_status (STATUS_RANK)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it("avanza el estado cuando el nuevo rango es mayor (CONSULTANDO → PAGO_PENDIENTE)", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.CONSULTANDO });
    update.mockResolvedValue({ id: "order-1", status: OrderStatus.PAGO_PENDIENTE });

    const result = await update_order_status("order-1", OrderStatus.PAGO_PENDIENTE);

    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      order_id: "order-1",
      new_status: OrderStatus.PAGO_PENDIENTE,
    });
  });

  it("NO retrocede el estado si el pedido ya avanzó más (PAGO_CONFIRMADO → ESPERANDO_PROVEEDOR)", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.PAGO_CONFIRMADO });

    const result = await update_order_status(
      "order-1",
      OrderStatus.ESPERANDO_PROVEEDOR
    );

    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, skipped: true });
  });

  it("permite quedarse en el mismo estado (no es un retroceso)", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.COTIZADO });
    update.mockResolvedValue({ id: "order-1", status: OrderStatus.COTIZADO });

    const result = await update_order_status("order-1", OrderStatus.COTIZADO);

    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it("adjunta la nota del producto solicitado cuando se pasa requested_product", async () => {
    findUnique.mockResolvedValue({ status: OrderStatus.CONSULTANDO });
    update.mockResolvedValue({ id: "order-1", status: OrderStatus.ESPERANDO_PROVEEDOR });

    await update_order_status(
      "order-1",
      OrderStatus.ESPERANDO_PROVEEDOR,
      "Kit Starlink"
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: "Cliente solicita: Kit Starlink",
        }),
      })
    );
  });
});

describe("find_and_add_product", () => {
  const XIAOMI = {
    id: "prod-xiaomi",
    name: "Xiaomi Redmi Note 13",
    category: "SMARTPHONE",
    selling_price: 899,
    stock_quantity: 4,
    min_threshold: 2,
  };
  const SAMSUNG = {
    id: "prod-samsung",
    name: "Samsung Galaxy A15",
    category: "SMARTPHONE",
    selling_price: 799,
    stock_quantity: 3,
    min_threshold: 2,
  };

  function mockSearchRows(rows: typeof XIAOMI[]) {
    queryRawUnsafe.mockResolvedValue(rows);
  }

  beforeEach(() => {
    productFindUnique.mockReset();
    orderItemFindFirst.mockReset();
    orderItemCreate.mockReset();
    queryRawUnsafe.mockReset();
  });

  it("devuelve error si no hay resultados en el catálogo", async () => {
    mockSearchRows([]);

    const result = await find_and_add_product("order-1", "producto inexistente xyz");

    expect(result).toEqual({
      error: "Producto no encontrado en el catálogo.",
      query: "producto inexistente xyz",
    });
    expect(productFindUnique).not.toHaveBeenCalled();
  });

  it("rechaza un resultado de otra marca (iphone → mejor match es Samsung por sinónimo 'smartphone')", async () => {
    // "iphone" se traduce al sinónimo "smartphone" para la búsqueda SQL, así que
    // puede matchear cualquier smartphone — pero el nombre del producto no
    // contiene "iphone", así que debe rechazarse como marca distinta.
    mockSearchRows([SAMSUNG]);

    const result = await find_and_add_product("order-1", "iphone 15");

    expect(result).toEqual({
      error: "Producto no encontrado en el catálogo.",
      query: "iphone 15",
    });
  });

  it("acepta el resultado cuando la marca sí coincide (samsung → Samsung Galaxy A15)", async () => {
    mockSearchRows([SAMSUNG]);
    productFindUnique.mockResolvedValue(SAMSUNG);
    orderItemFindFirst.mockResolvedValue(null);
    orderItemCreate.mockResolvedValue({});

    const result = await find_and_add_product("order-1", "samsung");

    expect(result).toMatchObject({ name: "Samsung Galaxy A15", added_to_order: true });
  });

  it("marca is_just_in_time cuando el producto tiene stock 0", async () => {
    const outOfStock = { ...XIAOMI, stock_quantity: 0 };
    mockSearchRows([outOfStock]);
    productFindUnique.mockResolvedValue(outOfStock);
    orderItemFindFirst.mockResolvedValue(null);
    orderItemCreate.mockResolvedValue({});

    const result = await find_and_add_product("order-1", "xiaomi redmi note 13");

    expect(result).toMatchObject({ is_just_in_time: true, stock_quantity: 0 });
  });

  it("marca already_added cuando el producto ya está en el pedido", async () => {
    mockSearchRows([XIAOMI]);
    productFindUnique.mockResolvedValue(XIAOMI);
    orderItemFindFirst.mockResolvedValue({ id: "item-1" }); // ya existe

    const result = await find_and_add_product("order-1", "xiaomi redmi note 13");

    expect(result).toMatchObject({ already_added: true });
    expect(orderItemCreate).not.toHaveBeenCalled();
  });

  it("agrega el producto normalmente cuando hay stock y no estaba en el pedido", async () => {
    mockSearchRows([XIAOMI]);
    productFindUnique.mockResolvedValue(XIAOMI);
    orderItemFindFirst.mockResolvedValue(null);
    orderItemCreate.mockResolvedValue({});

    const result = await find_and_add_product("order-1", "xiaomi redmi note 13");

    expect(result).toMatchObject({
      name: "Xiaomi Redmi Note 13",
      selling_price: "899",
      already_added: false,
      added_to_order: true,
    });
    expect(orderItemCreate).toHaveBeenCalledTimes(1);
  });

  it("incluye other_results con los demás matches de la búsqueda", async () => {
    mockSearchRows([XIAOMI, SAMSUNG]);
    productFindUnique.mockResolvedValue(XIAOMI);
    orderItemFindFirst.mockResolvedValue(null);
    orderItemCreate.mockResolvedValue({});

    const result = await find_and_add_product("order-1", "smartphone");

    expect(result).toMatchObject({ other_results: ["Samsung Galaxy A15"] });
  });

  it("normaliza caracteres especiales antes de interpolar en el SQL crudo (defensa contra inyección)", async () => {
    // search_products() interpola palabras normalizadas en $queryRawUnsafe. La
    // normalización quita todo lo que no sea alfanumérico/espacio ANTES de
    // interpolar, así que un intento de inyección no debería sobrevivir como
    // ';' o '--' en el SQL final (las únicas comillas legítimas son las del
    // template ILIKE '%palabra%').
    mockSearchRows([]);

    await find_and_add_product("order-1", "iphone'; DROP TABLE \"Product\";--");

    // El template en sí usa comillas dobles legítimas para el identificador de
    // tabla (FROM "Product") — lo que importa es que no sobreviva un ';' ni un
    // '--' (los caracteres que permitirían cerrar la sentencia o comentar el
    // resto de la query).
    const sqlArg = queryRawUnsafe.mock.calls[0][0] as string;
    expect(sqlArg).not.toContain(";");
    expect(sqlArg).not.toContain("--");
    expect(sqlArg).toContain("'%drop%'");
    expect(sqlArg).toContain("'%table%'");
  });

  // Regresión: bug real detectado en pruebas — "kit" estaba mapeado al
  // sinónimo "directv" en SYNONYMS, así que CUALQUIER búsqueda con "kit"
  // (Kit DVR, Kit Starlink, etc.) se ampliaba a buscar por categoría DirecTV.
  // Sin ORDER BY además, el "mejor" resultado terminaba siendo un producto de
  // otra categoría (se agregó "Kit DirecTV Prepago" al pedir "Kit DVR 4
  // canales + 2 cámaras").
  it("regresión: 'kit' ya no se mapea a la categoría directv", async () => {
    mockSearchRows([]);

    await find_and_add_product("order-1", "Kit DVR 4 canales + 2 camaras");

    const sqlArg = queryRawUnsafe.mock.calls[0][0] as string;
    expect(sqlArg).toContain("'%kit%'");
    expect(sqlArg).not.toContain("'%directv%'");
  });

  it("el SQL ordena por relevancia (más coincidencias primero) en vez de orden arbitrario", async () => {
    mockSearchRows([]);

    await find_and_add_product("order-1", "camara seguridad");

    const sqlArg = queryRawUnsafe.mock.calls[0][0] as string;
    expect(sqlArg).toMatch(/ORDER BY relevance DESC/);
  });
});

describe("save_customer_details", () => {
  beforeEach(() => {
    update.mockReset();
  });

  it("guarda nombre, teléfono, dirección y referencia", async () => {
    update.mockResolvedValue({ id: "order-1" });

    const result = await save_customer_details(
      "order-1",
      "Pepe Cortizona",
      "123456789",
      "Calle UPAO",
      "Frente a UPAO"
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        customer_full_name: "Pepe Cortizona",
        phone: "123456789",
        address: "Calle UPAO",
        address_reference: "Frente a UPAO",
      }),
    });
    expect(result).toEqual({ success: true, order_id: "order-1" });
  });

  it("no incluye address_reference en el update si no se pasó", async () => {
    update.mockResolvedValue({ id: "order-1" });

    await save_customer_details("order-1", "Pepe Cortizona", "123456789", "Calle UPAO");

    const callArgs = update.mock.calls[0][0];
    expect(callArgs.data).not.toHaveProperty("address_reference");
  });
});
