"use client";
import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  CONSULTANDO: "Consultando...",
  ESPERANDO_PROVEEDOR: "Verificando disponibilidad...",
  COTIZADO: "¡Precio disponible!",
  PAGO_PENDIENTE: "Pendiente de pago",
  PAGO_CONFIRMADO: "Pago confirmado",
  EN_RUTA: "En camino",
  COMPLETADO: "Completado",
};

function getSessionId(): string {
  const key = "dtecnoc_session";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function validateFullName(name: string): string | null {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/).filter((p) => p.length >= 2);
  if (parts.length < 2) return "Ingresa tu nombre y apellido (mínimo dos palabras).";
  return null;
}

export default function ClientChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [totalPrice, setTotalPrice] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderUpdatedAt, setOrderUpdatedAt] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<string[]>([]);
  const [clientName, setClientName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sid = getSessionId();
    setSessionId(sid);
    const savedName = localStorage.getItem("dtecnoc_name");
    if (savedName) {
      setClientName(savedName);
      setNameConfirmed(true);
      loadHistory(sid);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!nameConfirmed || !sessionId) return;
    pollRef.current = setInterval(() => pollUpdates(sessionId), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [nameConfirmed, sessionId]);

  function applyData(data: Record<string, unknown>) {
    if (data.order_status) setOrderStatus(data.order_status as string);
    if (data.total_price) setTotalPrice(data.total_price as string);
    if (data.order_id) setOrderId(data.order_id as string);
    if (data.order_updated_at) setOrderUpdatedAt(data.order_updated_at as string);
    if (Array.isArray(data.order_items) && data.order_items.length > 0)
      setOrderItems(data.order_items as string[]);
  }

  async function loadHistory(sid: string) {
    const res = await fetch(`/api/chat?session_id=${sid}`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      setMessages(data.messages as Message[]);
    }
    applyData(data);
  }

  function handleNewConversation() {
    if (!confirm("¿Iniciar una nueva conversación? El historial actual se cerrará.")) return;
    if (pollRef.current) clearInterval(pollRef.current);
    const newId = crypto.randomUUID();
    localStorage.setItem("dtecnoc_session", newId);
    setSessionId(newId);
    setMessages([]);
    setOrderStatus(null);
    setTotalPrice(null);
    setOrderId(null);
    setOrderUpdatedAt(null);
    setOrderItems([]);
  }

  function handleExit() {
    if (!confirm("¿Deseas salir del chat? Tu sesión se cerrará.")) return;
    if (pollRef.current) clearInterval(pollRef.current);
    localStorage.removeItem("dtecnoc_session");
    localStorage.removeItem("dtecnoc_name");
    setClientName("");
    setNameConfirmed(false);
    setMessages([]);
    setOrderStatus(null);
    setTotalPrice(null);
    setOrderId(null);
    setOrderUpdatedAt(null);
    setOrderItems([]);
    setSessionId(null);
  }

  async function pollUpdates(sid: string) {
    const res = await fetch(`/api/chat?session_id=${sid}`);
    if (!res.ok) return;
    const data = await res.json();
    const serverMessages = data.messages as Message[];
    setMessages((prev) => {
      if (serverMessages.length > prev.length) return serverMessages;
      return prev;
    });
    applyData(data);
  }

  function confirmName() {
    const error = validateFullName(clientName);
    if (error) {
      setNameError(error);
      return;
    }
    setNameError(null);
    const trimmed = clientName.trim();
    setClientName(trimmed);
    localStorage.setItem("dtecnoc_name", trimmed);
    const sid = getSessionId();
    setSessionId(sid);
    setNameConfirmed(true);
    loadHistory(sid);
  }

  async function handleSend() {
    if (!input.trim() || sending || !sessionId) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    const userMsg: Message = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text, client_name: clientName }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.response ?? "Un momento, estamos procesando tu consulta.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      applyData(data);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Hubo un problema de conexión. Por favor intenta nuevamente.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!nameConfirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
          <div className="text-5xl mb-4">📡</div>
          <h1 className="text-2xl font-bold text-blue-900 mb-1">DTECNOC</h1>
          <p className="text-gray-500 text-sm mb-6">Chat de Ventas</p>
          <p className="text-gray-600 mb-4">¿Con quién tenemos el gusto?</p>
          <input
            type="text"
            value={clientName}
            onChange={(e) => {
              setClientName(e.target.value);
              if (nameError) setNameError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && confirmName()}
            placeholder="Nombre y Apellido"
            className={`w-full border rounded-lg px-4 py-2.5 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center ${
              nameError ? "border-red-400" : "border-gray-300"
            }`}
            autoFocus
          />
          {nameError && (
            <p className="text-red-500 text-xs mb-3 text-left">{nameError}</p>
          )}
          {!nameError && <div className="mb-3" />}
          <button
            onClick={confirmName}
            disabled={!clientName.trim()}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            Iniciar Chat
          </button>
        </div>
      </div>
    );
  }

  // ── Receipt overlay ───────────────────────────────────────────────────────
  if (orderStatus === "COMPLETADO") {
    const dateStr = orderUpdatedAt
      ? new Date(orderUpdatedAt).toLocaleDateString("es-PE", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Receipt header */}
          <div className="bg-green-600 text-white px-6 py-5 text-center">
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-xl font-bold">Pedido Completado</h2>
            <p className="text-green-100 text-sm mt-1">¡Gracias por tu compra!</p>
          </div>

          {/* Receipt body */}
          <div className="px-6 py-5 space-y-4">
            <div className="border-b pb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Cliente</p>
              <p className="font-semibold text-gray-800">{clientName}</p>
            </div>

            <div className="border-b pb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Productos</p>
              {orderItems.length > 0 ? (
                <ul className="space-y-1">
                  {orderItems.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 italic">Sin detalle</p>
              )}
            </div>

            {totalPrice && (
              <div className="border-b pb-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total pagado</p>
                <p className="text-2xl font-bold text-green-700">S/ {totalPrice}</p>
              </div>
            )}

            <div className="border-b pb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Referencia</p>
              <p className="text-sm font-mono text-gray-600">{orderId ?? "—"}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Fecha</p>
              <p className="text-sm text-gray-700">{dateStr}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={() => window.print()}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm"
            >
              🖨️ Imprimir
            </button>
            <button
              onClick={handleExit}
              className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-sm"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat screen ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-900 text-white px-4 py-3 shadow flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center text-lg">
            📡
          </div>
          <div>
            <div className="font-semibold">DTECNOC</div>
            <div className="text-xs text-blue-300">Ventas y Tecnología</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {orderStatus && (
            <div
              className={`text-xs px-3 py-1 rounded-full font-medium ${
                orderStatus === "COTIZADO"
                  ? "bg-green-500 text-white"
                  : orderStatus === "ESPERANDO_PROVEEDOR"
                  ? "bg-yellow-400 text-yellow-900"
                  : "bg-blue-700 text-blue-100"
              }`}
            >
              {ORDER_STATUS_LABELS[orderStatus] ?? orderStatus}
              {totalPrice && orderStatus === "COTIZADO" ? ` — S/ ${totalPrice}` : ""}
            </div>
          )}
          {/* New conversation */}
          <button
            onClick={handleNewConversation}
            title="Nueva conversación"
            className="w-8 h-8 bg-blue-700 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.389zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
          </button>
          {/* Exit */}
          <button
            onClick={handleExit}
            title="Salir del chat"
            className="w-8 h-8 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-1.08a.75.75 0 10-1.004-1.116l-2.5 2.25a.75.75 0 000 1.116l2.5 2.25a.75.75 0 101.004-1.116l-1.048-1.08h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-2xl w-full mx-auto">
        {messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 bg-blue-900 rounded-full flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-1">
                  📡
                </div>
              )}
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white text-gray-800 rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <div
                  className={`text-xs mt-1 ${
                    msg.role === "user" ? "text-blue-200" : "text-gray-400"
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString("es-PE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))}
        {sending && (
          <div className="flex justify-start">
            <div className="w-8 h-8 bg-blue-900 rounded-full flex items-center justify-center text-sm mr-2">
              📡
            </div>
            <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-3 max-w-2xl w-full mx-auto">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Escribe tu consulta..."
            rows={1}
            className="flex-1 border border-gray-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.903 6.557H13.5a.75.75 0 010 1.5H4.182l-1.903 6.557a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 text-center">
          Hablando con {clientName} · DTECNOC
        </p>
      </div>
    </div>
  );
}
