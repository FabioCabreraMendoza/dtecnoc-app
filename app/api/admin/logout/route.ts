import { NextResponse } from "next/server";

// La cookie admin_token es httpOnly a propósito (no se puede leer ni borrar
// con JS desde el cliente); cerrar sesión requiere que el servidor la expire.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });
  return response;
}
