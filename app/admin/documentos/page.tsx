"use client";
import { useEffect, useState } from "react";

interface Doc {
  id: string;
  content: string;
  metadata_json: { title?: string; category?: string };
  created_at: string;
}

const CATEGORIES = ["general", "starlink", "directv", "camara", "panel_solar", "smartphone", "instalacion"];

export default function DocumentosPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", category: "general", content: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function getToken() {
    return localStorage.getItem("admin_token");
  }

  function loadDocs() {
    setLoading(true);
    fetch("/api/admin/documents", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then(setDocs)
      .finally(() => setLoading(false));
  }

  useEffect(loadDocs, []);

  async function handleSave() {
    if (!form.content.trim()) return;
    setSaving(true);
    await fetch("/api/admin/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ title: "", category: "general", content: "" });
    loadDocs();
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    setDeleting(id);
    await fetch(`/api/admin/documents?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setDeleting(null);
    loadDocs();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Base de Conocimiento</h1>
          <p className="text-sm text-gray-500 mt-1">
            Documentos técnicos que el agente de ventas consulta para responder preguntas de clientes.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Agregar Documento
        </button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-xl p-6 mb-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Nuevo Documento Técnico</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ej: Manual Starlink V2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contenido técnico *
              </label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                rows={8}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Describa el producto, sus especificaciones, proceso de instalación, preguntas frecuentes, etc. El agente usará este texto para responder preguntas de clientes."
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || !form.content.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="text-4xl mb-3">📄</div>
          <p className="text-gray-500 font-medium">No hay documentos técnicos</p>
          <p className="text-gray-400 text-sm mt-1">
            Agrega fichas técnicas, manuales o FAQs para que el agente responda mejor a los clientes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800">
                      {doc.metadata_json.title ?? "Sin título"}
                    </span>
                    {doc.metadata_json.category && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {doc.metadata_json.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-3 mt-1">
                    {doc.content}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Creado: {new Date(doc.created_at).toLocaleString("es-PE")}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deleting === doc.id}
                  className="text-red-400 hover:text-red-600 text-sm flex-shrink-0 disabled:opacity-50"
                >
                  {deleting === doc.id ? "..." : "Eliminar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
