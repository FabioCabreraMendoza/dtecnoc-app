"use client";
import { useEffect, useState } from "react";

const CATEGORIES = [
  "ACCESORIO", "SMARTPHONE", "KIT_DIRECTV", "KIT_STARLINK",
  "INSTALACION", "TABLET", "IMPRESORA", "PANEL_SOLAR", "CAMARA",
];

interface Product {
  id: string;
  name: string;
  description?: string;
  category: string;
  selling_price: string | null;
  cost_price: string | null;
  stock_quantity: number;
  min_threshold: number;
  is_active: boolean;
}

const EMPTY: Omit<Product, "id" | "is_active"> = {
  name: "",
  description: "",
  category: "ACCESORIO",
  selling_price: "",
  cost_price: "",
  stock_quantity: 0,
  min_threshold: 2,
};

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function getToken() {
    return localStorage.getItem("admin_token");
  }

  function loadProducts() {
    setLoading(true);
    fetch("/api/admin/products?active=false", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then(setProducts)
      .finally(() => setLoading(false));
  }

  useEffect(loadProducts, []);

  async function handleSave() {
    setSaving(true);
    const url = editId
      ? `/api/admin/products/${editId}`
      : "/api/admin/products";
    const method = editId ? "PATCH" : "POST";
    await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setEditId(null);
    setForm({ ...EMPTY });
    loadProducts();
  }

  async function handleToggle(id: string, is_active: boolean) {
    await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ is_active: !is_active }),
    });
    loadProducts();
  }

  function startEdit(p: Product) {
    setForm({
      name: p.name,
      description: p.description ?? "",
      category: p.category,
      selling_price: p.selling_price ?? "",
      cost_price: p.cost_price ?? "",
      stock_quantity: p.stock_quantity,
      min_threshold: p.min_threshold,
    });
    setEditId(p.id);
    setShowForm(true);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Catálogo de Productos</h1>
        <button
          onClick={() => {
            setForm({ ...EMPTY });
            setEditId(null);
            setShowForm(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Nuevo Producto
        </button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-xl p-6 mb-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">
            {editId ? "Editar Producto" : "Nuevo Producto"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría *</label>
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio Venta (S/)</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.selling_price ?? ""}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                placeholder="Dejar vacío para precio dinámico"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Umbral Mínimo</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.min_threshold}
                onChange={(e) => setForm({ ...form, min_threshold: parseInt(e.target.value) || 2 })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditId(null); }}
              className="border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Precio Venta</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.is_active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{p.name}</div>
                    {p.description && <div className="text-xs text-gray-400 truncate max-w-xs">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.category}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${p.stock_quantity <= p.min_threshold ? "text-red-500" : "text-gray-700"}`}>
                      {p.stock_quantity}
                    </span>
                    <span className="text-gray-400 text-xs"> / mín {p.min_threshold}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">
                    {p.selling_price ? `S/ ${p.selling_price}` : <span className="text-gray-400 font-normal">Dinámico</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggle(p.id, p.is_active)}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        {p.is_active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              No hay productos. Agrega el primero.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
