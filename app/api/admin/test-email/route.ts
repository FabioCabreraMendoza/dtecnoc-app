import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware-auth";
import { sendGmail } from "@/lib/gmail";

async function handler(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const to: string = body.to ?? process.env.DEFAULT_SUPPLIER_EMAIL ?? "";

  if (!to) {
    return NextResponse.json({ error: "No hay destinatario. Agrega DEFAULT_SUPPLIER_EMAIL en .env" }, { status: 400 });
  }

  try {
    const result = await sendGmail({
      to,
      subject: "DTECNOC — Test de conexión Gmail",
      html: `<p>Este es un correo de prueba enviado desde el sistema DTECNOC el ${new Date().toLocaleString("es-PE")}.</p>`,
    });
    return NextResponse.json({ success: true, messageId: result.messageId, threadId: result.threadId, to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = requireAdmin(handler);
