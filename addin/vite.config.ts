import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devCerts from "office-addin-dev-certs";

export default defineConfig(async () => {
  const httpsOptions = await devCerts.getHttpsServerOptions();

  return {
    plugins: [react()],
    server: {
      host: "localhost",
      port: 3000,
      https: httpsOptions,
      proxy: {
        "/aw-proxy": {
          target: "http://127.0.0.1:5201",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/aw-proxy/, ""),
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
