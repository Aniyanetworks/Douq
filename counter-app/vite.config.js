import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API and date helpers are shared with ../bar-app, so the dev server may read one folder up.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
