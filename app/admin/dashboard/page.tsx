"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";

interface DashboardData {
  kpis: {
    total_orders: number;
    waiting_supplier: number;
    cotizados: number;
    completed: number;
    conversion_rate: number;
  };
  recent_orders: Array<{
    id: string;
    client_name: string;
    status: string;
    total_price: string | null;
    product: string;
    updated_at: string;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  CONSULTANDO: { label: "Consultando", color: "bg-gray-100 text-gray-700" },
  ESPERANDO_PROVEEDOR: { label: "Esp. Proveedor", color: "bg-yellow-100 text-yellow-700" },
  COTIZADO: { label: "Cotizado", color: "bg-blue-100 text-blue-700" },
  PAGO_PENDIENTE: { label: "Pago Pendiente", color: "bg-orange-100 text-orange-700" },
  PAGO_CONFIRMADO: { label: "Pago Confirmado", color: "bg-green-100 text-green-700" },
  EN_RUTA: { label: "En Ruta", color: "bg-purple-100 text-purple-700" },
  COMPLETADO: { label: "Completado", color: "bg-emerald-100 text-emerald-700" },
  CANCELADO: { label: "Cancelado", color: "bg-red-100 text-red-700" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin text-4xl">⚙️</div>
      </div>
    );

  if (!data) return <div className="p-8 text-red-500">Error cargando datos</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total Pedidos", value: data.kpis.total_orders, icon: "📦", color: "bg-blue-50 border-blue-200" },
          { label: "Esp. Proveedor", value: data.kpis.waiting_supplier, icon: "⏳", color: "bg-yellow-50 border-yellow-200" },
          { label: "Cotizados", value: data.kpis.cotizados, icon: "💰", color: "bg-indigo-50 border-indigo-200" },
          { label: "Completados", value: data.kpis.completed, icon: "✅", color: "bg-green-50 border-green-200" },
          { label: "Conversión", value: `${data.kpis.conversion_rate}%`, icon: "📈", color: "bg-emerald-50 border-emerald-200" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`${kpi.color} border rounded-xl p-4`}
          >
            <div className="text-2xl mb-1">{kpi.icon}</div>
            <div className="text-2xl font-bold text-gray-800">{kpi.value}</div>
            <div className="text-xs text-gray-500">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-700">Pedidos Recientes</h2>
        </div>
        <div className="divide-y">
          {data.recent_orders.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] ?? {
              label: order.status,
              color: "bg-gray-100 text-gray-600",
            };
            return (
              <div
                key={order.id}
                className="px-6 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium text-sm text-gray-800">
                    {order.client_name}
                  </div>
                  <div className="text-xs text-gray-400">{order.product}</div>
                </div>
                <div className="flex items-center gap-3">
                  {order.total_price && (
                    <span className="text-sm font-medium text-green-600">
                      S/ {order.total_price}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>
              </div>
            );
          })}
          {data.recent_orders.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-400">
              No hay pedidos aún
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
