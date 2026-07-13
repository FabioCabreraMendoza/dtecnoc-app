import { describe, it, expect } from "vitest";
import { detectAlternativeProductLine } from "./supplier";

describe("detectAlternativeProductLine", () => {
  // Regresión: bug real encontrado en pruebas — una respuesta de una sola
  // oración corrida (disponibilidad + precio + entrega mezclados) no debe
  // citarse como si fuera el nombre de un producto alternativo.
  it("regresión: no trata una oración corrida con precio como nombre de producto", () => {
    const noteLines = [
      "Tenemos 3 unidades disponibles, precio S/ 4200, llega en 3 días",
    ];
    expect(
      detectAlternativeProductLine(noteLines, "iPhone 15 128GB")
    ).toBeNull();
  });

  it("detecta un modelo alternativo real cuando viene en su propia línea", () => {
    // Marca/modelo claramente distintos (no comparten las 2 primeras palabras
    // normalizadas con el producto pedido, así que no colisiona con la regla
    // de "mismo modelo base" — ver el siguiente test para ese caso).
    const noteLines = [
      "Samsung Galaxy A25 128GB",
      "Disponible, llega en 2 días",
    ];
    expect(detectAlternativeProductLine(noteLines, "iPhone 15 128GB")).toBe(
      "Samsung Galaxy A25 128GB"
    );
  });

  it("devuelve null si la única línea de producto es igual al solicitado", () => {
    const noteLines = ["iPhone 15 128GB", "Disponible, llega en 2 días"];
    expect(
      detectAlternativeProductLine(noteLines, "iPhone 15 128GB")
    ).toBeNull();
  });

  it("devuelve null si la línea coincide en las 2 primeras palabras del producto pedido", () => {
    // "iPhone 15" (128GB vs 256GB) se considera el mismo modelo base, no alternativo.
    const noteLines = ["iPhone 15 256GB Azul", "Disponible, llega en 2 días"];
    expect(
      detectAlternativeProductLine(noteLines, "iPhone 15 128GB")
    ).toBeNull();
  });

  it("devuelve null si todas las líneas son de logística", () => {
    const noteLines = ["Disponible en 5 días", "Llega por Shalom"];
    expect(
      detectAlternativeProductLine(noteLines, "iPhone 15 128GB")
    ).toBeNull();
  });

  it("devuelve null si no hay líneas", () => {
    expect(detectAlternativeProductLine([], "iPhone 15 128GB")).toBeNull();
  });

  it("ignora una línea corta (<=5 caracteres) como candidato a nombre de producto", () => {
    const noteLines = ["Sí", "Disponible en 2 días"];
    expect(
      detectAlternativeProductLine(noteLines, "iPhone 15 128GB")
    ).toBeNull();
  });
});
