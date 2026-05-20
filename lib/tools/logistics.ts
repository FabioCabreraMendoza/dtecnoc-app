import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

export async function get_technician_schedule(date: string) {
  const slots = [
    { time: "09:00", available: true },
    { time: "11:00", available: true },
    { time: "14:00", available: true },
    { time: "16:00", available: true },
  ];
  return {
    date,
    available_slots: slots.filter((s) => s.available),
    technician_id: "tech_001",
  };
}

export async function book_installation(
  order_id: string,
  technician_id: string,
  client_address: string,
  date: string
) {
  await prisma.order.update({
    where: { id: order_id },
    data: {
      status: OrderStatus.EN_RUTA,
      notes: `Instalación agendada: ${date} con técnico ${technician_id}. Dirección: ${client_address}`,
      updated_at: new Date(),
    },
  });
  return {
    success: true,
    order_id,
    technician_id,
    address: client_address,
    scheduled_date: date,
    status: "EN_RUTA",
    confirmation_message: `Instalación confirmada para el ${date}. Nuestro técnico llegará a ${client_address}. Te avisaremos 30 minutos antes.`,
  };
}
