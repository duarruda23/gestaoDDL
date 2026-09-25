import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, "/");

export default defineConfig({
  resolve: {
    alias: [
      // Mesmo atalho "@/" do tsconfig.
      { find: /^@\/(.*)$/, replacement: `${raiz}/$1` },
      // "server-only" quebra fora do servidor do Next; nos testes, vira um módulo vazio.
      { find: /^server-only$/, replacement: `${raiz}/testes/server-only-vazio.ts` },
    ],
  },
  test: {
    include: ["testes/**/*.test.ts"],
    environment: "node",
    // PGlite sobe um Postgres em memória por teste; dá tempo de migrar.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
