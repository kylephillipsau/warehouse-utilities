import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// The label maker is a Svelte SPA whose source lives in `src/`. Hand-authored
// static pages (index, forklift, fonts, img, …) live in `static/` and are
// copied verbatim. Everything builds into `public/`, which is what GitLab Pages
// deploys — so `public/` is a generated artifact (gitignored), not source.
export default defineConfig({
  root: 'src',
  // Absolute base: the site is served at the domain root, so assets must
  // resolve to /assets/... regardless of the page URL (e.g. /labels vs
  // /labels/). A relative base breaks on clean/trailing-slash URLs.
  base: '/',
  publicDir: '../static',
  plugins: [tailwindcss(), svelte()],
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
