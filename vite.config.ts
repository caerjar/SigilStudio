import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Client-side only; no backend. Bind to 0.0.0.0 inside Docker via --host.
export default defineConfig({
  // Relative asset URLs, so the same dist/ works unchanged at a domain root
  // (https://example.com/) and under a project subpath
  // (https://user.github.io/sigil-studio/) without a per-host build.
  //
  // This holds because there is no client-side routing: every page load is
  // index.html at the deploy root, so "./assets/..." always resolves. If routes
  // are ever added, nested URLs would resolve "./" against the wrong directory —
  // switch to an absolute base then (VITE_BASE below is the hook for it).
  base: process.env.VITE_BASE ?? "./",
  plugins: [react()],
  // 5180, not Vite's 5173: that port is a commons and this repo lost a morning
  // to sharing it. `PORT=… npm run dev` (or `PORT=… make dev`) moves it; the
  // same variable drives compose's host binding, so both halves stay in step.
  //
  // strictPort so a collision is an error, not a silent hop to 5181 — being on
  // a port you didn't ask for is the failure that costs the hour.
  server: { port: Number(process.env.PORT) || 5180, strictPort: true },
});
