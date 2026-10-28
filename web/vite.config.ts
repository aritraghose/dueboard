import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  // Resolve the `@/*` alias from tsconfig.json (used by shadcn/ui components).
  resolve: { tsconfigPaths: true },
});
