import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
export default defineConfig(({ command }) => ({
  define: {
    'process.env.GOOSE_TUNNEL': JSON.stringify(
      process.env.GOOSE_TUNNEL !== 'no' && process.env.GOOSE_TUNNEL !== 'none'
    ),
  },

  plugins: [
    react(),
    tailwindcss(),
    command === 'serve' && {
      name: 'goose-development-csp',
      transformIndexHtml(html) {
        return html.replace(
          "script-src 'self' 'unsafe-inline'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        );
      },
    },
  ],

  build: {
    target: 'esnext',
  },
}));
