import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [{ tag: 'meta', attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; form-action 'self'; upgrade-insecure-requests"
        }, injectTo: 'head' }];
      }
    }
  }],
  base: process.env.BASE_PATH || '/',
});
