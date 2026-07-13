"use client";

export function getAdminToken(): string | null {
  return localStorage.getItem("admin_token");
}

/**
 * fetch autenticado del panel admin. Si el token venció o es inválido (401),
 * limpia la sesión y redirige a /login en vez de dejar que la página reciba
 * un cuerpo de error donde esperaba un array/objeto (causa de pantallas en
 * blanco al expirar el JWT de 24h).
 */
export async function adminFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = getAdminToken();
  const res = await fetch(input, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    localStorage.removeItem("admin_token");
    window.location.href = "/login";
    // La navegación desmonta la página; se lanza para cortar la cadena .then().
    throw new Error("Sesión expirada");
  }

  return res;
}
