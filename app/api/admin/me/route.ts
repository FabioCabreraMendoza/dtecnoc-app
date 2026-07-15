import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware-auth";

// Chequeo liviano de sesión: el layout del admin lo llama al montar para
// saber si la cookie admin_token sigue siendo válida (ya no hay token en
// localStorage que se pueda leer directamente en el cliente).
async function handler(_req: NextRequest) {
  return NextResponse.json({ ok: true });
}

export const GET = requireAdmin(handler);
