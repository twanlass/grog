import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The 3D build imports Grog's simulation straight out of the 2D game (`@grog` → ../game/src), so
// both builds play by the same rules and a gameplay fix lands in both. Vite refuses to serve files
// outside its root unless told, hence `fs.allow`. The sounds are the 2D game's too (`publicDir`).
export default defineConfig({
  resolve: {
    alias: { '@grog': fileURLToPath(new URL('../game/src', import.meta.url)) },
  },
  publicDir: '../game/public',
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html', gallery: 'gallery.html' } },
  },
});
