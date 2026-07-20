import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The label maker is a Svelte SPA whose source lives in `src/`. Hand-authored
// static pages (index, forklift, fonts, img, …) live in `static/` and are
// copied verbatim. Everything builds into `public/`, which is what GitLab Pages
// deploys — so `public/` is a generated artifact (gitignored), not source.
export default defineConfig({
  root: 'src',
  base: './',
  publicDir: '../static',
  plugins: [svelte()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        labels: 'src/labels.html',
      },
    },
  },
});
