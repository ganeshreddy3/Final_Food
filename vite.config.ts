import { defineConfig, loadEnv } from "vite";
import dns from "node:dns";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Prefer IPv4 when the dev server/proxy resolves hostnames (helps some Windows / DNS setups).
dns.setDefaultResultOrder("ipv4first");

function normalizeSupabaseTarget(raw: string | undefined): string {
  if (!raw) return "";
  let u = raw.trim();
  if ((u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) {
    u = u.slice(1, -1).trim();
  }
  u = u.replace(/\/+$/, "");
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return u;
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  // Load .env* so the proxy target matches what the app uses (same as import.meta.env in client).
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseTarget = normalizeSupabaseTarget(env.VITE_SUPABASE_URL);

  return {
    server: {
      host: true,
      port: 8080,
      hmr: {
        overlay: false,
      },
      /**
       * Browser cannot resolve *.supabase.co on some networks (ERR_NAME_NOT_RESOLVED).
       * The dev server (Node) resolves the host and forwards; the browser only calls same-origin /supabase-api.
       */
      proxy: supabaseTarget
        ? {
            "/supabase-api": {
              target: supabaseTarget,
              changeOrigin: true,
              // Dev-only: avoid proxy TLS verify failures on locked-down PCs.
              secure: false,
              ws: true,
              rewrite: (pathStr) => {
                const stripped = pathStr.replace(/^\/supabase-api/, "");
                return stripped.length > 0 ? stripped : "/";
              },
            },
          }
        : {},
    },
    plugins: [react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
