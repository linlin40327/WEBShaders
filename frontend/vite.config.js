import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.VITE_PORT || '3000';

  return {
    server: {
      port: 5173,
      watch: {
        usePolling: true,
        interval: 300,
      },
      proxy: {
        '/api': `http://localhost:${backendPort}`,
        '/shaders': `http://localhost:${backendPort}`,
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': `http://localhost:${backendPort}`,
        '/shaders': `http://localhost:${backendPort}`,
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
