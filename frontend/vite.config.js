import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // "" prefix loads all vars (not just VITE_*) for use in this config only
  const env = loadEnv(mode, process.cwd(), "");
  const isProd = mode === "production";
  const port = Number(env.VITE_PORT) || 5173;

  return {
    plugins: [react()],

    resolve: {
      alias: {
        // ESM-safe replacement for __dirname
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },

    server: {
      port,
      strictPort: false,
      host: true, // reachable on your LAN, handy for testing on a phone
      // Only proxy when a backend URL is configured
      proxy: env.VITE_API_URL
        ? {
            "/api": {
              target: env.VITE_API_URL,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ""),
            },
          }
        : undefined,
    },

    preview: { port: 4173, host: true },

    build: {
      target: "es2020",
      sourcemap: !isProd,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          // Put third-party code in a separate, long-cached chunk
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
                return "react";
              }
              return "vendor";
            }
          },
        },
      },
    },

    // Strip console/debugger from production bundles
    esbuild: {
      drop: isProd ? ["console", "debugger"] : [],
    },

    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
    },
  };
});
