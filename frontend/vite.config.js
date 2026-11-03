import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Backend chạy ở cổng 3000; đặt VITE_API_PROXY để trỏ sang cổng khác khi cần
const target = process.env.VITE_API_PROXY || 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
});
