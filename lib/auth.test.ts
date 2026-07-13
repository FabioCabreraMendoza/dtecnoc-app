import { describe, it, expect } from "vitest";
import type { AdminPayload } from "./auth";

// JWT_SECRET se lee a nivel de módulo (const de nivel superior) en lib/auth.ts,
// así que hay que fijarlo ANTES del import — un beforeAll no sirve porque los
// imports estáticos/dinámicos de nivel de módulo se evalúan en la fase de
// "collect", antes de que corra cualquier hook.
process.env.JWT_SECRET = "test-jwt-secret";

const { signToken, verifyToken, hashPassword, comparePassword } = await import(
  "./auth"
);

const PAYLOAD: AdminPayload = {
  id: "admin-1",
  email: "admin@dtecnoc.com",
  name: "Admin Test",
  role: "ADMIN",
};

describe("signToken / verifyToken", () => {
  it("un token firmado se verifica y devuelve el mismo payload", () => {
    const token = signToken(PAYLOAD);
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject(PAYLOAD);
  });

  it("rechaza un token con firma inválida", () => {
    const token = signToken(PAYLOAD);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifyToken(tampered)).toBeNull();
  });

  it("rechaza un string que no es un JWT", () => {
    expect(verifyToken("no-es-un-token")).toBeNull();
  });

  it("rechaza un token vacío", () => {
    expect(verifyToken("")).toBeNull();
  });

  it("rechaza un token firmado con otro secreto", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const foreignToken = jwt.sign(PAYLOAD, "otro-secreto-distinto");
    expect(verifyToken(foreignToken)).toBeNull();
  });
});

describe("hashPassword / comparePassword", () => {
  it("una contraseña hasheada se compara correctamente contra el original", async () => {
    const hash = await hashPassword("SuperSecreta123");
    expect(await comparePassword("SuperSecreta123", hash)).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await hashPassword("SuperSecreta123");
    expect(await comparePassword("OtraCosa", hash)).toBe(false);
  });

  it("el hash nunca es igual al texto plano", async () => {
    const hash = await hashPassword("SuperSecreta123");
    expect(hash).not.toBe("SuperSecreta123");
  });
});
