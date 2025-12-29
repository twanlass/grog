import { defineConfig } from "vite";

export default defineConfig({
    // index.html out file will start with a relative path for script
    base: "./",
    server: {
        port: 3001,
    },
    build: {
        // disable source maps in production for smaller bundle
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    kaplay: ["kaplay"],
                },
            },
        },
    },
});