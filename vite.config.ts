import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Exposes the IEEE OUI registry (from the `oui-data` package) as a compact
 * virtual module: a de-duplicated list of vendor names plus an OUI -> index map.
 * The MAC tool imports it lazily, so it lands in its own chunk.
 */
function ouiPlugin(): Plugin {
  const publicId = 'virtual:oui';
  const resolvedId = '\0' + publicId;
  return {
    name: 'net-tools:oui',
    resolveId(id) {
      return id === publicId ? resolvedId : undefined;
    },
    load(id) {
      if (id !== resolvedId) return;
      const file = createRequire(import.meta.url).resolve('oui-data');
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
      const names: string[] = [];
      const nameIndex = new Map<string, number>();
      const index: Record<string, number> = {};
      for (const [oui, entry] of Object.entries(raw)) {
        const vendor = entry.split('\n')[0].trim();
        let i = nameIndex.get(vendor);
        if (i === undefined) {
          i = names.length;
          names.push(vendor);
          nameIndex.set(vendor, i);
        }
        index[oui.toUpperCase()] = i;
      }
      const data = JSON.stringify({ names, index });
      return `const data = JSON.parse(${JSON.stringify(data)});\nexport const names = data.names;\nexport const index = data.index;\n`;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), ouiPlugin()],
  build: {
    // The OUI registry is one large chunk (~570 kB gzipped), loaded only by the MAC tool.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
