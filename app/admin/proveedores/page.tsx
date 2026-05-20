"use client";
import { useEffect, useState } from "react";

interface SupplierThread {
  id: string;
  order_id: string;
  order_status: string;
  client_name: string;
  product: string;
  supplier_email: string | null;
  gmail_thread_id: string | null;
  is_resolved: boolean;
  message_count: number;
  updated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  CONSULTANDO: "Consultando",
  ESPERANDO_PROVEEDOR: "Esperando proveedor",
  COTIZADO: "Cotizado",
  PAGO_PENDIENTE: "Pago pendiente",
  PAGO_CONFIRMADO: "Pago confirmado",
  EN_RUTA: "En ruta",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export default function ProveedoresPage() {
  const [threads, setThreads] = useState<SupplierThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchStatus, setWatchStatus] = useState<string | null>(null);
  const [activatingWatch, setActivatingWatch] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<string | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [checkingReply, setCheckingReply] = useState<string | null>(null);
  const [replyStatus, setReplyStatus] = useState<Record<string, string>>({});

  function getToken() {
    return localStorage.getItem("admin_token");
  }

  useEffect(() => {
    fetch("/api/admin/threads", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then(setThreads)
      .finally(() => setLoading(false));
  }, []);

  async function checkSupplierReply(order_id: string) {
    setCheckingReply(order_id);
    try {
      const res = await fetch("/api/admin/check-supplier-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ order_id }),
      });
      const data = await res.json();
      if (data.status === "cotizado") {
        setReplyStatus((prev) => ({ ...prev, [order_id]: "✅ Cotización registrada — pedido actualizado a COTIZADO" }));
        // Reload threads
        fetch("/api/admin/threads", { headers: { Authorization: `Bearer ${getToken()}` } })
          .then((r) => r.json()).then(setThreads);
      } else if (data.status === "no_reply") {
        setReplyStatus((prev) => ({ ...prev, [order_id]: "⏳ El proveedor aún no ha respondido" }));
      } else if (data.status === "already_resolved") {
        setReplyStatus((prev) => ({ ...prev, [order_id]: "✅ Ya procesado anteriormente" }));
      } else {
        setReplyStatus((prev) => ({ ...prev, [order_id]: `ℹ️ ${data.message ?? "Procesado"}` }));
      }
    } catch {
      setReplyStatus((prev) => ({ ...prev, [order_id]: "❌ Error de conexión" }));
    } finally {
      setCheckingReply(null);
    }
  }

  async function testEmail() {
    setTestingEmail(true);
    setTestEmailStatus(null);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setTestEmailStatus(data.success ? `✅ Correo enviado a ${data.to}` : `❌ Error: ${data.error}`);
    } catch {
      setTestEmailStatus("❌ Error de conexión");
    } finally {
      setTestingEmail(false);
    }
  }

  async function activateGmailWatch() {
    setActivatingWatch(true);
    try {
      const res = await fetch("/api/gmail/watch", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setWatchStatus(data.message ?? data.error ?? "Procesado");
    } catch {
      setWatchStatus("Error de conexión");
    } finally {
      setActivatingWatch(false);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Monitor de Negociaciones B2B
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Hilos de cotización entre el sistema y proveedores. Haz clic en el chat para intervenir.
          </p>
        </div>
        <div className="text-right">
          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-2">
              <button
                onClick={testEmail}
                disabled={testingEmail}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {testingEmail ? "Enviando..." : "📧 Probar Email"}
              </button>
              <button
                onClick={activateGmailWatch}
                disabled={activatingWatch}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {activatingWatch ? "Activando..." : "🔔 Activar Gmail Watch"}
              </button>
            </div>
            {testEmailStatus && <p className="text-xs text-right max-w-xs">{testEmailStatus}</p>}
            {watchStatus && <p className="text-xs text-gray-500 max-w-xs text-right">{watchStatus}</p>}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        <strong>Flujo automático:</strong> Cuando un cliente pide un producto sin stock, el sistema envía
        un correo al proveedor solicitando cotización. El proveedor <strong>responde directamente al email</strong>,
        el agente procesa la respuesta y notifica al cliente con el precio final.
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : threads.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          No hay cotizaciones activas. Se crearán cuando un cliente solicite un producto sin stock.
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="font-semibold text-gray-800 truncate">{t.product}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        t.is_resolved
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {t.is_resolved ? "✅ Resuelto" : "⏳ " + (STATUS_LABEL[t.order_status] ?? t.order_status)}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 space-y-1">
                    <div>
                      <span className="text-gray-400">Cliente:</span>{" "}
                      <span className="font-medium">{t.client_name}</span>
                    </div>
                    {t.supplier_email && (
                      <div>
                        <span className="text-gray-400">Proveedor (email):</span>{" "}
                        <a
                          href={`mailto:${t.supplier_email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {t.supplier_email}
                        </a>
                      </div>
                    )}
                    {t.gmail_thread_id && (
                      <div className="text-xs text-gray-400">
                        Gmail Thread ID: <code className="bg-gray-100 px-1 rounded">{t.gmail_thread_id.slice(0, 20)}...</code>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="text-xs text-gray-400 text-right">
                    <div>{new Date(t.updated_at).toLocaleString("es-PE")}</div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                      t.is_resolved
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {t.is_resolved ? "✅ Cotización recibida" : "⏳ Esperando respuesta"}
                  </span>
                  {!t.is_resolved && (
                    <button
                      onClick={() => checkSupplierReply(t.order_id)}
                      disabled={checkingReply === t.order_id}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
                    >
                      {checkingReply === t.order_id ? "Verificando..." : "🔍 Verificar respuesta"}
                    </button>
                  )}
                  {replyStatus[t.order_id] && (
                    <p className="text-xs text-right max-w-xs">{replyStatus[t.order_id]}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
