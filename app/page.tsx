import Link from "next/link";

const PRODUCTS = [
  { icon: "📱", name: "Smartphones y Tablets" },
  { icon: "📡", name: "Starlink y DirecTV" },
  { icon: "🔒", name: "Cámaras de Seguridad" },
  { icon: "☀️", name: "Paneles Solares" },
  { icon: "🖨️", name: "Impresoras y Accesorios" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-blue-900 px-8 py-6 text-white text-center">
          <div className="text-5xl mb-3">📡</div>
          <h1 className="text-3xl font-bold">DTECNOC</h1>
          <p className="text-blue-200 text-sm mt-1">Tecnología e Instalaciones</p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-2 mb-6">
            {PRODUCTS.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-800"
              >
                <span>{p.icon}</span>
                <span className="font-medium">{p.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-800">
              <span>🔧</span>
              <span className="font-medium">Instalaciones</span>
            </div>
          </div>

          <Link
            href="/chat"
            className="block w-full bg-blue-600 text-white text-center py-3.5 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors shadow-md mb-3"
          >
            💬 Chatear con Ventas
          </Link>

          <Link
            href="/login"
            className="block w-full text-center py-2.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
          >
            Panel Administrador →
          </Link>
        </div>
      </div>

      <p className="text-blue-200 text-xs mt-4 opacity-60">
        Atención en línea · Respuesta inmediata
      </p>
    </div>
  );
}
