import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// The academic-supervisor portal runs on port 5177
// (student 5173, main 5174, training provider 5175, admin 5176, backend 4000).
export default defineConfig({
  server: { port: 5177, strictPort: true },
  plugins: [react(), tailwindcss()],
});
