import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// BASE_PATH is set by GitHub Actions for GitHub Pages project sites.
// A CSP is injected only in builds: Vite's local HMR needs permissive dev hooks.
const productionCsp = {
  name: 'production-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler() {
      return [{
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; form-action 'self'; upgrade-insecure-requests"
        },
        injectTo: 'head',
      }];
    }
  }
};

export default defineConfig({
  plugins: [tailwindcss(), productionCsp],
  base: process.env.BASE_PATH || '/',
});
