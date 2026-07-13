import { describe, it, expect } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { toLcMessage } from "./message-utils";

describe("toLcMessage", () => {
  it("convierte un turno 'user' a HumanMessage", () => {
    const msg = toLcMessage({ role: "user", content: "Hola" });
    expect(msg).toBeInstanceOf(HumanMessage);
    expect(msg.content).toBe("Hola");
  });

  it("convierte un turno 'assistant' a AIMessage", () => {
    const msg = toLcMessage({ role: "assistant", content: "¿En qué te ayudo?" });
    expect(msg).toBeInstanceOf(AIMessage);
    expect(msg.content).toBe("¿En qué te ayudo?");
  });
});
