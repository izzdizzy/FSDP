import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        doc: 'src/pages/doc-page.html',
        chatbot: 'src/pages/chatbot.html',
      },
    },
  },
  server: {
    port: 3000,
  },
});