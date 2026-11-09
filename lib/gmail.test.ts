import { describe, it, expect } from "vitest";
import {
  stripQuotedReply,
  extractBodyFromPayload,
  buildRawEmail,
  isSupplierReply,
} from "./gmail";
import { buildSupplierEmailHtml } from "./tools/gmail-tools";

describe("isSupplierReply (remitente del proveedor)", () => {
  it("acepta la dirección exacta del proveedor, con o sin nombre", () => {
    expect(isSupplierReply("Juan <Prov@X.com>", "prov@x.com")).toBe(true);
    expect(isSupplierReply("prov@x.com", "prov@x.com")).toBe(true);
  });

  it("rechaza a un tercero, un dominio parecido y el caso sin supplier_email", () => {
    expect(isSupplierReply("Atacante <evil@x.com>", "prov@x.com")).toBe(false);
    expect(isSupplierReply("prov@x.com.evil.io", "prov@x.com")).toBe(false);
    expect(isSupplierReply("prov@x.com", null)).toBe(false);
  });

  it("rechaza los correos propios aunque coincidan con el proveedor", () => {
    process.env.GMAIL_USER = "dtecnoc@gmail.com";
    expect(isSupplierReply("DTECNOC <dtecnoc@gmail.com>", "dtecnoc@gmail.com")).toBe(false);
    delete process.env.GMAIL_USER;
  });
});

describe("buildRawEmail (inyeccion de cabeceras)", () => {
  it("no deja que un asunto con CRLF cree cabeceras nuevas", () => {
    const raw = Buffer.from(
      buildRawEmail({
        to: "proveedor@x.com",
        subject: "Cotizacion: iPhone\r\nBcc: victima@evil.com",
        html: "<p>hola</p>",
      }),
      "base64url"
    ).toString("utf-8");
    const headers = raw.split("\r\n\r\n")[0].split("\r\n");
    expect(headers.some((h) => h.toLowerCase().startsWith("bcc:"))).toBe(false);
  });
});

describe("buildSupplierEmailHtml (escape de HTML)", () => {
  it("escapa el nombre de producto controlado por el cliente", () => {
    const html = buildSupplierEmailHtml({
      product_name: '<a href="https://evil.example">ver</a>',
      quantity: 1,
      order_id: "abc",
      category: "SMARTPHONE",
    });
    expect(html).not.toContain("<a href=");
    expect(html).toContain("&#60;a href=");
  });
});

describe("stripQuotedReply", () => {
  it("devuelve el texto completo si no hay cita", () => {
    expect(stripQuotedReply("Tenemos 5 unidades, precio S/ 1250.")).toBe(
      "Tenemos 5 unidades, precio S/ 1250."
    );
  });

  it("corta en la primera línea citada con '>'", () => {
    const body = [
      "Tenemos 5 unidades, precio S/ 1250.",
      "",
      "El mar 09 jul 2026, Juan Proveedor <juan@proveedor.com> escribió:",
      "> Hola, ¿tienen el Kit Starlink disponible?",
      "> Saludos",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe(
      "Tenemos 5 unidades, precio S/ 1250."
    );
  });

  it("quita la línea de atribución final aunque no haya '>'", () => {
    const body = [
      "Confirmado, va el envío.",
      "El 09/07/2026, DTECNOC escribió:",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("Confirmado, va el envío.");
  });

  it("reconoce la atribución en inglés ('wrote:')", () => {
    const body = ["Sure, price is $10.", "On Jul 9, 2026, DTECNOC wrote:"].join(
      "\n"
    );
    expect(stripQuotedReply(body)).toBe("Sure, price is $10.");
  });

  it("recorta líneas en blanco finales", () => {
    expect(stripQuotedReply("Precio confirmado.\n\n\n")).toBe(
      "Precio confirmado."
    );
  });

  it("devuelve string vacío si todo el cuerpo es una cita", () => {
    expect(stripQuotedReply("> todo citado\n> nada propio")).toBe("");
  });
});

describe("extractBodyFromPayload", () => {
  function b64(text: string) {
    return Buffer.from(text, "utf-8").toString("base64");
  }

  it("extrae el body directo de un payload text/plain simple", () => {
    const payload = { mimeType: "text/plain", body: { data: b64("Hola mundo") } };
    expect(extractBodyFromPayload(payload)).toBe("Hola mundo");
  });

  it("recorre partes anidadas hasta encontrar text/plain (cuando va primero)", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("Texto plano") } },
        { mimeType: "text/html", body: { data: b64("<p>Hola</p>") } },
      ],
    };
    expect(extractBodyFromPayload(payload)).toBe("Texto plano");
  });

  // Documenta el comportamiento actual: extractBodyFromPayload NO prioriza
  // text/plain al recorrer — devuelve el body.data de la primera parte que
  // tenga contenido (aunque sea text/html), por el fallback genérico al
  // final de la función. Si algún día se necesita preferir siempre texto
  // plano, este test debe actualizarse junto con el fix.
  it("si text/html va primero, el fallback genérico devuelve ese HTML", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>Hola</p>") } },
        { mimeType: "text/plain", body: { data: b64("Texto plano") } },
      ],
    };
    expect(extractBodyFromPayload(payload)).toBe("<p>Hola</p>");
  });

  it("cae al body vacío si no hay data en ningún lado", () => {
    const payload = { mimeType: "multipart/mixed", parts: [] };
    expect(extractBodyFromPayload(payload)).toBe("");
  });
});
