"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";

const STATUSES = [
  "CONSULTANDO",
  "ESPERANDO_PROVEEDOR",
  "COTIZADO",
  "PAGO_PENDIENTE",
  "PAGO_CONFIRMADO",
  "EN_RUTA",
  "COMPLETADO",
  "CANCELADO",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CONSULTANDO: { label: "Consultando", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
  ESPERANDO_PROVEEDOR: { label: "Esp. Proveedor", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  COTIZADO: { label: "Cotizado", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  PAGO_PENDIENTE: { label: "Pago Pendiente", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  PAGO_CONFIRMADO: { label: "Pago Confirmado", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  EN_RUTA: { label: "En Ruta", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  COMPLETADO: { label: "Completado", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  CANCELADO: { label: "Cancelado", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

const STATUS_ACTIONS: Record<string, { label: string; next: string; style: string }[]> = {
  PAGO_PENDIENTE: [
    { label: "✅ Confirmar Pago", next: "PAGO_CONFIRMADO", style: "bg-green-500 hover:bg-green-600 text-white" },
    { label: "✕ Cancelar", next: "CANCELADO", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  COTIZADO: [
    { label: "✕ Cancelar", next: "CANCELADO", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  PAGO_CONFIRMADO: [
    { label: "🚚 Marcar En Ruta", next: "EN_RUTA", style: "bg-purple-500 hover:bg-purple-600 text-white" },
  ],
  EN_RUTA: [
    { label: "🎉 Completar", next: "COMPLETADO", style: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  ],
};

interface Order {
  id: string;
  client: { name: string; platform_id: string };
  status: string;
  total_price: string | null;
  notes: string | null;
  items: Array<{ product: { name: string; category: string; selling_price: string | null } }>;
  chat_thread: { id: string } | null;
  updated_at: string;
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [quotingOrder, setQuotingOrder] = useState<string | null>(null);
  const [quotePrice, setQuotePrice] = useState("");

  function loadOrders() {
    setLoading(true);
    adminFetch("/api/admin/orders")
      .then((r) => r.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(loadOrders, []);

  async function updateStatus(order_id: string, next_status: string, extra?: Record<string, string>) {
    setUpdating(order_id);
    await adminFetch(`/api/admin/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next_status, ...extra }),
    }).catch(() => {});
    setUpdating(null);
    loadOrders();
  }

  async function submitQuote(order_id: string) {
    if (!quotePrice || isNaN(parseFloat(quotePrice))) return;
    await updateStatus(order_id, "COTIZADO", { total_price: quotePrice });
    setQuotingOrder(null);
    setQuotePrice("");
  }

  const grouped = STATUSES.reduce<Record<string, Order[]>>((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s);
    return acc;
  }, {});

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin text-4xl">⚙️</div>
      </div>
    );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Kanban de Pedidos</h1>
        <button
          onClick={loadOrders}
          className="text-sm text-blue-600 hover:underline"
        >
          ↻ Actualizar
        </button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const cols = grouped[status] ?? [];
          return (
            <div key={status} className="flex-shrink-0 w-64">
              <div className={`rounded-t-lg border-b-2 px-3 py-2 ${cfg.bg} border`}>
                <div className={`font-semibold text-sm ${cfg.color}`}>
                  {cfg.label}
                </div>
                <div className="text-xs text-gray-400">{cols.length} pedidos</div>
              </div>
              <div className="space-y-2 mt-2 min-h-16">
                {cols.map((order) => {
                  const actions = STATUS_ACTIONS[order.status] ?? [];
                  const requestedProduct = order.notes?.match(/Cliente solicita:\s*([^|]+)/)?.[1]?.trim();
                  const displayProduct = requestedProduct ?? order.items[0]?.product.name ?? "Sin producto";
                  const displayNotes = order.notes?.replace(/Cliente solicita:[^|]*\|?\s*/g, "").trim() || null;
                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm"
                    >
                      <div className="font-medium text-sm text-gray-800 truncate">
                        {order.client.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {displayProduct}
                      </div>
                      {order.status === "ESPERANDO_PROVEEDOR" && (
                        <div className="mt-1 space-y-0.5">
                          {requestedProduct ? (
                            <div className="text-xs text-yellow-600">📦 Producto bajo pedido</div>
                          ) : order.items[0] && (
                            <>
                              <div className="text-xs text-gray-400">
                                📦 {order.items[0].product.category}
                              </div>
                              {order.items[0].product.selling_price && (
                                <div className="text-xs text-blue-500">
                                  Precio ref.: S/ {order.items[0].product.selling_price}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {order.total_price && (
                        <div className="text-xs font-semibold text-green-600 mt-1">
                          S/ {order.total_price}
                        </div>
                      )}
                      {displayNotes && (
                        <div className="flex items-start gap-1 mt-1">
                          <div className="text-xs text-gray-400 truncate flex-1" title={displayNotes}>
                            📝 {displayNotes}
                          </div>
                          <button
                            onClick={async () => {
                              await adminFetch(`/api/admin/orders/${order.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ notes: "" }),
                              }).catch(() => {});
                              loadOrders();
                            }}
                            className="text-gray-300 hover:text-red-400 flex-shrink-0 text-xs"
                            title="Borrar nota"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      {order.status === "ESPERANDO_PROVEEDOR" && !order.total_price && (!!requestedProduct || order.items.length > 0) && (
                        <div className="mt-2">
                          {quotingOrder === order.id ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Precio en S/"
                                value={quotePrice}
                                onChange={(e) => setQuotePrice(e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => submitQuote(order.id)}
                                  disabled={updating === order.id || !quotePrice}
                                  className="flex-1 text-xs py-1.5 px-2 rounded-md font-medium bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
                                >
                                  {updating === order.id ? "..." : "✓ Confirmar"}
                                </button>
                                <button
                                  onClick={() => { setQuotingOrder(null); setQuotePrice(""); }}
                                  className="text-xs py-1.5 px-2 rounded-md font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setQuotingOrder(order.id)}
                              className="w-full text-xs py-1.5 px-2 rounded-md font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                            >
                              💰 Registrar Cotización
                            </button>
                          )}
                        </div>
                      )}
                      {actions.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          {actions.map((action) => (
                            <button
                              key={action.next}
                              onClick={() => updateStatus(order.id, action.next)}
                              disabled={updating === order.id}
                              className={`w-full text-xs py-1.5 px-2 rounded-md font-medium transition-colors disabled:opacity-50 ${action.style}`}
                            >
                              {updating === order.id ? "..." : action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
