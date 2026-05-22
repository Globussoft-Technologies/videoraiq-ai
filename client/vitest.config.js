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
        // Round 10: Profile/Api/{get,post,put,delete}, Dashboard/Api/{get,post,put},
        // Users/api/post. Each entry has a dedicated test file under
        // tests/unit/page/user/{Profile,Dashboard,Users}/...
        "src/page/user/Profile/Api/get/index.jsx",
        "src/page/user/Profile/Api/post/index.jsx",
        "src/page/user/Profile/Api/put/index.jsx",
        "src/page/user/Profile/Api/delete/index.jsx",
        "src/page/user/Dashboard/Api/get/index.jsx",
        "src/page/user/Dashboard/Api/post/index.jsx",
        "src/page/user/Dashboard/Api/put/index.jsx",
        "src/page/user/Users/api/post/Index.jsx",
        // Round 11: more page/Api wrappers — Departments, Locations,
        // RolePermissions {get,post,put,delete}, UserDetails {Post,delete},
        // EmployeeLogs {get,post}. Each entry has a dedicated test file
        // under tests/unit/page/user/{Departments,Locations,RolePermissions,
        // UserDetails,EmployeeLogs}/Api/**.
        "src/page/user/Departments/Api/index.jsx",
        "src/page/user/Locations/Api/index.jsx",
        "src/page/user/RolePermissions/Api/get/index.jsx",
        "src/page/user/RolePermissions/Api/post/index.jsx",
        "src/page/user/RolePermissions/Api/put/index.jsx",
        "src/page/user/RolePermissions/Api/delete/index.jsx",
        "src/page/user/UserDetails/Api/Post/index.jsx",
        "src/page/user/UserDetails/Api/delete/index.jsx",
        "src/page/user/EmployeeLogs/Api/get/index.jsx",
        "src/page/user/EmployeeLogs/Api/post/index.jsx",
        // Round 12: layout-level sidebar config API wrappers. Both are leaf
        // axios + waitForToken modules; tested under tests/unit/layout/Api/**.
        "src/layout/Api/get/index.jsx",
        "src/layout/Api/put/index.jsx",
        // Round 14: small leaf page-tree components + the AppliedProfile
        // detection card. Each has a dedicated test under tests/unit/page/**.
        "src/page/user/NotificationRecipients/VerificationModal.jsx",
        "src/page/user/Streams/DesktopTableView.jsx",
        "src/page/user/Streams/MobileTableView.jsx",
        "src/page/user/Streams/Operationselect.jsx",
        "src/page/user/Profile/ProfilesTable.jsx",
        "src/page/user/Detection/components/AppliedProfile.jsx",
        // Round 15: Settings/components leaves (NvrSettingscard, Reports,
        // AlertPreferences are pure presentation; Verify is the route-level
        // OTP confirmation wrapper) and the helpers/Userregister
        // VerifyUserDialog (multi-step face-verify dialog). Each has a
        // dedicated test under tests/unit/page/user/Settings/components/**
        // or tests/unit/helpers/Userregister/**.
        "src/page/user/Settings/components/NvrSettingscard.jsx",
        "src/page/user/Settings/components/Reports.jsx",
        "src/page/user/Settings/components/Verify.jsx",
        "src/page/user/Settings/components/AlertPreferences.jsx",
        "src/helpers/Userregister/VerifyUserDialog.jsx",
        // Round 16: ScheduleRow (the big day-timeline picker — previously
        // 0% / 545 lines), and three Settings/components: OtpVerification
        // (route-level 6-digit OTP modal), Nvralertsettingsform (read-only
        // current-NVR summary card with Edit -> AddNVRForm), NvrAlertsettings
        // (parent collapsible card). Each entry has a dedicated test under
        // tests/unit/components/Schedule/** or tests/unit/page/user/
        // Settings/components/**.
        "src/components/Schedule/ScheduleRow.jsx",
        "src/page/user/Settings/components/OtpVerification.jsx",
        "src/page/user/Settings/components/Nvralertsettingsform.jsx",
        "src/page/user/Settings/components/NvrAlertsettings.jsx",
        // Round 17: small page-tree leaves with self-contained renders or
        // straightforward child-component stubbing. Each entry has a
        // dedicated test under tests/unit/page/user/**.
        "src/page/user/NVR/NVRAuthLogin.jsx",
        "src/page/user/Detection/components/DetectionPreviewModal.jsx",
        "src/page/user/Detection/components/MiniCameraPreview.jsx",
        "src/page/user/Detection/components/NotificationSettings.jsx",
        "src/page/user/Settings/Settings.jsx",
        "src/page/user/Streams/Cameraview/CameraThree.jsx",
        "src/page/user/Streams/Cameraview/CameraFour.jsx",
        "src/page/user/Streams/Cameraview/CameraFive.jsx",
        // Round 18: the rest of the Cameraview/Camera{One,Two,Six,Seven,
        // Eight,Nine}.jsx fixed-size grid wrappers + the shared
        // CameraStreamDisplay tile + the pure timeUtils helpers used by
        // EmployeeLogs filter popover. Each entry has a dedicated test
        // under tests/unit/page/user/{Streams/Cameraview,EmployeeLogs}/**.
        "src/page/user/EmployeeLogs/components/timeUtils.js",
        "src/page/user/Streams/Cameraview/CameraOne.jsx",
        "src/page/user/Streams/Cameraview/CameraTwo.jsx",
        "src/page/user/Streams/Cameraview/CameraSix.jsx",
        "src/page/user/Streams/Cameraview/CameraSeven.jsx",
        "src/page/user/Streams/Cameraview/CameraEight.jsx",
        "src/page/user/Streams/Cameraview/CameraNine.jsx",
        "src/page/user/Streams/Cameraview/CameraStreamDisplay.jsx",
        // Round 19: more small leaves —
        //  - Detection: DeleteConfirmation (reusable portal modal),
        //    DetectionSettingsFormSkeleton (pure presentational skeleton),
        //    DeleteAddedRecipients (TanStack-table confirmation portal).
        //  - Playback: RecordedScreens (thumbnail strip list).
        //  - EmployeeLogs: LogEmployeeProfileDialog (Radix dialog showing
        //    profile + region-converted times), ProfilesTable (TanStack-
        //    table wrapper with skeleton mode).
        "src/page/user/Detection/components/DeleteConfirmation.jsx",
        "src/page/user/Detection/components/DetectionSettingsFormSkeleton.jsx",
        "src/page/user/Detection/components/DeleteAddedRecipients.jsx",
        "src/page/user/Playback/components/RecordedScreens.jsx",
        "src/page/user/EmployeeLogs/LogEmployeeProfileDialog.jsx",
        "src/page/user/EmployeeLogs/ProfilesTable.jsx",
        // Round 20: tiny leaves —
        //  - Detection/components/TimeSlotsPopover (popover that shows
        //    overflow time slots beyond the first two, supports strings /
        //    label objects / startTime+endTime objects).
        //  - Detection/components/EditDetectionSettingModal (dialog
        //    wrapper around ManageSettings).
        //  - Detection/components/olddetections (legacy DetectionSetting
        //    page wrapper composing AddNewConfiguration + SavedConfiguration).
        //  - Playback/components/VideoSection (thin PlaybackVideo wrapper
        //    with zoom-in/out wiring).
        "src/page/user/Detection/components/TimeSlotsPopover.jsx",
        "src/page/user/Detection/components/EditDetectionSettingModal.jsx",
        "src/page/user/Detection/components/olddetections.jsx",
        "src/page/user/Playback/components/VideoSection.jsx",
        // Detection/DetectionSettingsModal — Dialog wrapper that embeds
        // SavedConfiguration (Action='action') + AddNewConfiguration.
        "src/page/user/Detection/DetectionSettingsModal.jsx",
        // EmployeeLogs/ProductivityLog — static-data table page (hard-coded
        // 5 rows + 7 columns) with two NVR/Camera filter selects.
        "src/page/user/EmployeeLogs/ProductivityLog.jsx",
        // Round 21: six more small leaves —
        //  - Detection/components/BasicSettings (read-only basic block of
        //    the applied profile - timezone + day chips + per-day slots).
        //  - Playback/components/AutoHideWrapper (auto-fade pointer-idle
        //    wrapper with both local and targetRef listener modes).
        //  - Streams/components/EditCameraInfo (controlled popover for
        //    editing camera alias + department assignment).
        //  - EmployeeLogs/components/AutoRefreshComponent (manual + auto
        //    refresh button with +/- stepper, switch, preset buttons).
        //  - Profile/EvidenceSeverityStep (step 3 of multi-step profile
        //    form: Formik-driven Evidence/Time/Storage selects).
        //  - Departments/DepartmentForm (Yup-validated Formik dialog for
        //    create/edit department).
        "src/page/user/Detection/components/BasicSettings.jsx",
        "src/page/user/Playback/components/AutoHideWrapper.jsx",
        "src/page/user/Streams/components/EditCameraInfo.jsx",
        "src/page/user/EmployeeLogs/components/AutoRefreshComponent.jsx",
        "src/page/user/Profile/EvidenceSeverityStep.jsx",
        "src/page/user/Departments/DepartmentForm.jsx",
      ],
      exclude: [
        "tests/**",
        // Asset-only paths and the rest of the giant page tree (Round-4
        // territory) are still excluded so the % reflects what we actively
        // test against. Specific page files we now test are listed in the
        // include array above.
        "src/assets/**",
        "src/routes/**",
        "src/main.jsx",
        "src/App.jsx",
      ],
    },
  },
});
