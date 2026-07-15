"use client";

/**
 * fetch autenticado del panel admin. La sesión vive ÚNICAMENTE en la cookie
 * admin_token (httpOnly, secure, sameSite=lax — la pone el servidor en el
 * login) y el navegador la manda sola en peticiones same-origin; no se guarda
 * el JWT en localStorage ni se manda por header Authorization. Guardarlo en
 * localStorage anulaba la protección de httpOnly: cualquier XSS futuro en el
 * admin podría haber leído el token directamente con JS.
 *
 * Si el token venció o es inválido (401), limpia la sesión y redirige a
 * /login en vez de dejar que la página reciba un cuerpo de error donde
 * esperaba un array/objeto (causa de pantallas en blanco al expirar el JWT
 * de 24h).
 */
export async function adminFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    // La cookie httpOnly no se puede borrar con JS; se lo pide al servidor.
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
    // La navegación desmonta la página; se lanza para cortar la cadena .then().
    throw new Error("Sesión expirada");
  }

  return res;
}
