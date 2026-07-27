import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native module — must stay a runtime require, not be bundled.
      external: ['node-pty'],
    },
  },
});
