import { HumanMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Convierte un turno de historial (BD) a un mensaje de LangChain. */
export function toLcMessage(m: ChatTurn): BaseMessage {
  return m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content);
}
