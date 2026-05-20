import { prisma } from "@/lib/prisma";
import { OrderStatus, ProductCategory } from "@prisma/client";

const MARGIN_BY_CATEGORY: Record<string, number> = {
  ACCESORIO: 0.35,
  SMARTPHONE: 0.2,
  KIT_DIRECTV: 0.25,
  KIT_STARLINK: 0.18,
  INSTALACION: 0.3,
  TABLET: 0.22,
  IMPRESORA: 0.2,
  PANEL_SOLAR: 0.2,
  CAMARA: 0.28,
};

export async function update_cost_price_in_db(
  product_id: string,
  cost_price: number
) {
  const product = await prisma.product.update({
    where: { id: product_id },
    data: { cost_price: cost_price, updated_at: new Date() },
  });
  return {
    success: true,
    product_id: product.id,
    cost_price: product.cost_price?.toString(),
  };
}

export async function calculate_final_margin(
  cost_price: number,
  category: string,
  installation_cost: number = 0
) {
  const margin = MARGIN_BY_CATEGORY[category] ?? 0.25;
  const final_price =
    cost_price * (1 + margin) + installation_cost;
  const rounded = Math.ceil(final_price / 10) * 10;
  return {
    cost_price,
    margin_percentage: Math.round(margin * 100),
    installation_cost,
    final_price: rounded,
    breakdown: `S/ ${cost_price} + ${Math.round(margin * 100)}% margen${installation_cost > 0 ? ` + S/ ${installation_cost} instalación` : ""} = S/ ${rounded}`,
  };
}

export async function notify_client_price(
  order_id: string,
  final_price: number,
  product_name: string
) {
  await prisma.order.update({
    where: { id: order_id },
    data: {
      status: OrderStatus.COTIZADO,
      total_price: final_price,
      updated_at: new Date(),
    },
  });
  return {
    success: true,
    order_id,
    status: "COTIZADO",
    message_to_client: `¡Buenas noticias! Ya tenemos disponibilidad para ${product_name}. El precio es S/ ${final_price}. ¿Deseas proceder con la compra? 😊`,
  };
}
