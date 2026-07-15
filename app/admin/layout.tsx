"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "📦" },
  { href: "/admin/productos", label: "Catálogo", icon: "🛒" },
  { href: "/admin/proveedores", label: "Proveedores B2B", icon: "💬" },
  { href: "/admin/documentos", label: "Base Conocimiento", icon: "📄" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // Comprimir el sidebar a solo íconos en pantallas md+ (tablet/escritorio) para
  // maximizar el espacio del contenido. En móvil el sidebar es un cajón
  // superpuesto (menuOpen) y siempre muestra las etiquetas completas cuando
  // está abierto, así que "collapsed" no aplica ahí.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // La sesión vive en la cookie httpOnly (no hay token en localStorage que
    // se pueda chequear directamente); se valida con una llamada liviana.
    // adminFetch ya redirige a /login por su cuenta si la cookie no es válida.
    adminFetch("/api/admin/me").catch(() => {});
    const saved = localStorage.getItem("admin_sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
  }, [router]);

  // Cierra el menú móvil al cambiar de página.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("admin_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  async function handleLogout() {
    // La cookie httpOnly no se puede borrar con JS; se lo pide al servidor.
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  const currentLabel = NAV_ITEMS.find((i) => i.href === pathname)?.label ?? "Panel";

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Overlay para cerrar el menú al tocar fuera (solo móvil) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 ${
          collapsed ? "md:w-16" : "md:w-64"
        } bg-blue-900 text-white flex flex-col transform transition-all duration-200 md:static md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div
          className={`p-5 border-b border-blue-800 flex items-center ${
            collapsed ? "md:justify-center md:px-2" : "justify-between"
          }`}
        >
          <div className={collapsed ? "md:hidden" : ""}>
            <div className="text-xl font-bold whitespace-nowrap">📡 DTECNOC</div>
            <div className="text-xs text-blue-300 mt-1 whitespace-nowrap">Panel de Gestión</div>
          </div>
          {/* Toggle de compresión: solo visible en md+ (el móvil usa el cajón) */}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Comprimir menú"}
            title={collapsed ? "Expandir menú" : "Comprimir menú"}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-blue-200 hover:bg-blue-800 hover:text-white flex-shrink-0"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav
          className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden ${
            collapsed ? "p-4 md:p-2" : "p-4"
          }`}
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                collapsed ? "px-3 py-2.5 md:justify-center md:px-2" : "px-3 py-2.5"
              } ${
                pathname === item.href
                  ? "bg-blue-700 text-white"
                  : "text-blue-200 hover:bg-blue-800 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className={`border-t border-blue-800 ${collapsed ? "p-4 md:p-2" : "p-4"}`}>
          <button
            onClick={handleLogout}
            title={collapsed ? "Cerrar sesión" : undefined}
            className={`w-full flex items-center gap-2 text-blue-200 hover:text-white text-sm rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap ${
              collapsed ? "px-3 py-2 md:justify-center md:px-2" : "px-3 py-2"
            }`}
          >
            🚪 <span className={collapsed ? "md:hidden" : ""}>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra superior solo en móvil: botón de menú + título de la página actual */}
        <div className="md:hidden flex items-center gap-3 bg-blue-900 text-white px-4 py-3">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="text-2xl leading-none px-1"
          >
            ☰
          </button>
          <div className="font-semibold text-sm">📡 {currentLabel}</div>
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
