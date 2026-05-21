import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the `@` alias from vite.config.js so source imports resolve.
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.{test,spec}.{js,jsx}"],
    exclude: ["node_modules", "dist"],
    css: false,
    // Vite exposes import.meta.env.* — provide defaults the source modules
    // read at import time (getAccessToken reads VITE_ENV, decriptNvr reads
    // VITE_ENCRYPTION_KEY / VITE_IV).
    env: {
      VITE_ENV: "dev",
      VITE_ENCRYPTION_KEY: "0".repeat(64),
      VITE_IV: "0".repeat(32),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      // Widened in Round 3 to count the component / context / data tests
      // added since the original narrow scope. `.jsx` files now count.
      // Round 6: pulled a handful of small leaf modules out of `src/page/`
      // into the include list (the page tree is still otherwise excluded).
      // Each listed file has a dedicated tests/unit/page/** test.
      include: [
        "src/utils/**",
        "src/helpers/**",
        "src/hooks/**",
        "src/lib/**",
        "src/schema/**",
        "src/components/**",
        "src/context/**",
        "src/data/**",
        "src/page/admin/Api/post/index.jsx",
        // Round 7: AdminLoginForm — Formik admin login orchestrator,
        // tested in tests/unit/page/admin/AdminLoginForm.test.jsx.
        "src/page/admin/Login/AdminLoginForm.jsx",
        "src/page/user/Dashboard/validation.jsx",
        "src/page/user/Users/Schema/UserLoginSchema.jsx",
        "src/page/user/Playback/components/PlayBackTime.jsx",
        "src/page/user/Detection/components/InnerSettingsContext.jsx",
        "src/page/user/Detection/components/EvidenceSeverity.jsx",
        "src/page/user/Detection/components/Header.jsx",
        "src/page/user/Detection/components/DeviceDetail.jsx",
        "src/page/user/Detection/Api/post/index.jsx",
        "src/page/user/Streams/Api/delete/index.jsx",
        // Round 8: more leaf API files + the StorageSetting yup schema.
        // Each entry has a dedicated test file under tests/unit/page/**.
        "src/page/user/Detection/Api/delete/index.jsx",
        "src/page/user/Detection/Api/get/index.jsx",
        "src/page/user/Detection/Api/patch/index.jsx",
        "src/page/user/Streams/Api/get/index.jsx",
        "src/page/user/Streams/Api/post/index.jsx",
        "src/page/user/Streams/Api/pacth/index.jsx",
        "src/page/user/Settings/StorageSetting/Api/get/index.jsx",
        "src/page/user/Settings/StorageSetting/Api/post/index.jsx",
        "src/page/user/Settings/StorageSetting/Api/put/index.jsx",
        "src/page/user/Settings/StorageSetting/Api/delete/index.jsx",
        "src/page/user/Settings/StorageSetting/schema/Storage.jsx",
        // Round 9: parent Settings/Api/* (fetch-based recipients) and
        // Incidents/Api/* (axios). Each entry has a dedicated test under
        // tests/unit/page/user/Settings/Api/** or Incidents/Api/**.
        "src/page/user/Settings/Api/delete/index.jsx",
        "src/page/user/Settings/Api/get/index.jsx",
        "src/page/user/Settings/Api/post/index.jsx",
        "src/page/user/Settings/Api/put/index.jsx",
        "src/page/user/Incidents/Api/get/index.js",
        "src/page/user/Incidents/Api/post/index.jsx",
        "src/page/user/Streams/Cameraview/CameraviewSkeleton.jsx",
      ],
      exclude: [
        "tests/**",
        // Asset-only paths and the rest of the giant page tree (Round-4
        // territory) are still excluded so the % reflects what we actively
        // test against. Specific page files we now test are listed in the
        // include array above.
        "src/assets/**",
        "src/layout/**",
        "src/routes/**",
        "src/main.jsx",
        "src/App.jsx",
      ],
    },
  },
});
