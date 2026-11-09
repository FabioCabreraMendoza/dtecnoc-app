// ponytail: contador en memoria por instancia serverless (no se comparte entre
// instancias ni sobrevive a un arranque en frío). Frena ráfagas desde una IP; si
// hace falta un límite global, sustituir por Redis/Upstash sin cambiar la firma.
const hits = new Map<string, number[]>();

/** true si la petición cabe en `limit` por ventana de `windowMs`; false si hay que rechazarla. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  hits.set(key, recent);

  // Evita que el mapa crezca sin límite con IPs que no vuelven.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return allowed;
}

/** IP del cliente. En Vercel x-forwarded-for lo fija la plataforma (no el cliente). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
