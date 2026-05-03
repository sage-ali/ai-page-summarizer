import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import type { ManifestV3Export } from '@crxjs/vite-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifestJson from './manifest.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// JSON imports widen `manifest_version` to `number`; cast narrows it to the
// literal `3` that ManifestV3Export requires. Safe — the JSON is statically correct.
const manifest = manifestJson as ManifestV3Export;

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
