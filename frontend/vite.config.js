import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app calls the API directly via VITE_API_URL (see src/App.jsx), so no dev proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1500 }, // three.js is large; this only silences the warning
});
