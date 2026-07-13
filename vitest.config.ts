import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Vite trata ".prisma/client" como ruta relativa (los specifiers ESM que
      // empiezan con "." no pasan por resolución de node_modules); Node sí lo
      // resuelve porque tolera carpetas con punto bajo node_modules. Se apunta
      // directo al cliente generado por `prisma generate`.
      ".prisma/client": path.resolve(__dirname, "node_modules/.prisma/client"),
    },
  },
});
