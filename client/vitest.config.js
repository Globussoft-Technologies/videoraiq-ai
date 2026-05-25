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
        // Round 27: GoogledriveForm — the Google Drive OAuth sub-form
        // used by AddStorageModal. Pure controlled component (clientId /
        // clientSecret / redirectUri) with isEditMode placeholder swap.
        "src/page/user/Settings/StorageSetting/components/GoogledriveForm.jsx",
        // Round 30: Dashboard/RecentAlerts — static "Walmart Store" alert
        // card that wraps two heavy children (AlertGauge + ActivityChart).
        // The new spec mocks both children and pins the fixed header copy /
        // image / four-chip grid.
        "src/page/user/Dashboard/RecentAlerts.jsx",
        // Round 31: EmployeeLogs/LogsFilterPopover — presentational
        // filters popover (NVR / Camera / Department multi-selects +
        // optional Location, Time Range pair, Authorized switch).
        // Stubs popover / switch / multiselect / TimePickerComponents
        // and pins option-mapping + handler wiring.
        "src/page/user/EmployeeLogs/components/LogsFilterPopover.jsx",
        // Round 32: RolePermissions/PermissionTable — TanStack-table wrapper
        // with three branches (loading skeleton / empty "No data available" /
        // normal headers+rows). Tested under tests/unit/page/user/
        // RolePermissions/PermissionTable.test.jsx.
        "src/page/user/RolePermissions/PermissionTable.jsx",
        // Round 33: EmployeeLogs/components/BreakLogsDialog — Radix Dialog
        // that fetches per-employee attendance break logs (loading / empty /
        // populated) and offers PDF / Excel export. Tested under tests/unit/
        // page/user/EmployeeLogs/components/BreakLogsDialog.test.jsx.
        "src/page/user/EmployeeLogs/components/BreakLogsDialog.jsx",
        // Round 34: RolePermissions/AddRoleDialog — Formik + yup Radix
        // dialog for create vs edit role. Auto-opens in edit mode via
        // setOpen(true). Submits via createRole / updateRole and toasts.
        // Tested under tests/unit/page/user/RolePermissions/
        // AddRoleDialog.test.jsx.
        "src/page/user/RolePermissions/AddRoleDialog.jsx",
        // Round 35: Incidents/components/IncidentPagination — the
        // pagination footer used by the incidents grid (first/prev/next/
        // last chevrons, "Page X of Y" label, "Showing M To N Of T
        // Entries" summary, and the digit-filtered Go-to input that
        // clamps Number(value) into [1, totalPages] on Go / Enter).
        // Tested under tests/unit/page/user/Incidents/components/
        // IncidentPagination.test.jsx.
        "src/page/user/Incidents/components/IncidentPagination.jsx",
        // Round 36: Incidents/components/IncidentCard — the single
        // incident tile rendered by the grid. Composes CameraCanvas with
        // optional zone chip / Mark-as-resolved checkbox (canEdit), an
        // uppercased title, a Report button whose label flips to
        // "Reported" when item.report.status is truthy, an optional Alert
        // chip, and a footer that runs alertText through
        // formatFromToTimestamps. The card itself is click-to-open;
        // interactive children stopPropagation. Tested under
        // tests/unit/page/user/Incidents/components/IncidentCard.test.jsx.
        "src/page/user/Incidents/components/IncidentCard.jsx",
        // Round 37: Incidents/components/ReportIncidentModal — the small
        // Dialog used to file, view, or edit an incident report. Two
        // visual modes driven by incidentData.report (view vs create/edit);
        // submit calls updateIncidentReportStatus, toasts success/error,
        // and invokes onClose + onSuccess. Tested under tests/unit/page/
        // user/Incidents/components/ReportIncidentModal.test.jsx.
        "src/page/user/Incidents/components/ReportIncidentModal.jsx",
        // Round 38: Dashboard/Alertwidgets/NoDataCard — purely
        // presentational empty-state card with a tiny incidentName->title
        // switch (seven explicit cases + default fall-back) and the
        // static "Inactive" badge + "No Data Available" copy. Tested
        // under tests/unit/page/user/Dashboard/Alertwidgets/
        // NoDataCard.test.jsx.
        "src/page/user/Dashboard/Alertwidgets/NoDataCard.jsx",
        // Round 39: Locations/LocationForm — the Yup-validated Formik
        // Radix dialog used for both create and edit location flows.
        // Mirrors DepartmentForm structure: locationName required + max
        // 100, empLocationId optional. Submits via createLocation /
        // updateLocation and toasts success/error. Tested under
        // tests/unit/page/user/Locations/LocationForm.test.jsx.
        "src/page/user/Locations/LocationForm.jsx",
        // Round 40: Users/ForgotPassword — Formik + Yup forgot-password
        // page. Two visual states (form / "Check Your Email" success pane)
        // gated by local `emailSent`. Submits via forgotPassword
        // ({email}), toasts server message or fallback on success,
        // toasts server / fallback on failure, and the back-button +
        // success-pane Back to Login navigate to /user-login. Tested
        // under tests/unit/page/user/Users/ForgotPassword.test.jsx.
        "src/page/user/Users/ForgotPassword.jsx",
        // Round 42: Playback/components/MediaControls — pure presentational
        // playback control bar (skip / rewind / play-pause / fast-forward /
        // skip-next + speed indicator + fullscreen toggle). The +/- 30 and
        // +/- 60 second buttons call setPosition with a function that
        // clamps to [0, 86400] and offsets by currentTime; play button is
        // disabled while isBuffering; transport buttons get a
        // cursor-not-allowed class when availableSegments is empty. Tested
        // under tests/unit/page/user/Playback/components/MediaControls.test.jsx.
        "src/page/user/Playback/components/MediaControls.jsx",
        // Round 43: Streams/NvrLocalsettings — presentational NVR list
        // card with empty/populated branches, the StreamHeader Add NVR CTA
        // wiring to AddNVRForm, and gear/eye action navigates to
        // /streams/camera-settings and /cameraview. Tested under
        // tests/unit/page/user/Streams/NvrLocalsettings.test.jsx.
        "src/page/user/Streams/NvrLocalsettings.jsx",
        // Round 45: Detection/components/AddNewConfiguration — collapsible
        // "Add New / Edit Configurations Settings" panel used by the legacy
        // DetectionSetting page. Fetches detectionTypes from
        // getAllDetectionTypes() on mount, renders a react-select for type
        // pick, and lazily mounts DetectionSettingsForm (ManageSettings)
        // with the chosen type + the addedDetection setter. Tested under
        // tests/unit/page/user/Detection/components/AddNewConfiguration.test.jsx.
        "src/page/user/Detection/components/AddNewConfiguration.jsx",
        // Round 47: Streams/CameraCanvas — the small video-thumbnail tile
        // shared by Incidents / Streams / Playback. Renders <video> when src
        // is present (auto-swaps to thumbnail <img> on video onError or when
        // src is missing) and the <img> swaps to a bundled fallback SVG on
        // its first onError. Maximize button has two modes: in-modal uses
        // the Fullscreen API on the wrapping div; non-modal pushes src into
        // UserContext (setStreamModalContentSrc + setStreamModalShow). Tested
        // under tests/unit/page/user/Streams/CameraCanvas.test.jsx.
        "src/page/user/Streams/CameraCanvas.jsx",
        // Round 44: Departments/Departments — paginated departments page.
        // fetchDepartments(skip,limit,search) on mount + on search-debounce
        // dependency change; TanStack PermissionTable with edit/delete per
        // row gated by permissions.departments.{edit,delete}; "Add New
        // Department" CTA gated by canCreate; DeleteConfirmation flow that
        // only calls deleteDepartment on confirm + toasts and refetches;
        // permissionsLoading -> PageLoader; !canView -> AccessDenied.
        // Tested under tests/unit/page/user/Departments/Departments.test.jsx.
        "src/page/user/Departments/Departments.jsx",
        // Round 52: Streams/CameraStreamsModal/ZoneSelector — the small
        // floating, draggable zone-picker overlay rendered on top of the
        // stream modal. Toggles a panel listing detection zone_names,
        // calls setSelectedZone on pick, and supports mouse-drag inside
        // the .stream-modal container. Tested under
        // tests/unit/page/user/Streams/CameraStreamsModal/ZoneSelector.test.jsx.
        "src/page/user/Streams/CameraStreamsModal/ZoneSelector.jsx",
        // Round 56: Streams/CameraStreamsModal/UserProfileDialog — the
        // modal popped up from the AttendanceCheckLog list when a row
        // is clicked. Gated on isOpen + userData; switches between
        // known/unknown variant + access-log/attendance-log modes;
        // also includes an avatar carousel (next/prev wrap-around,
        // initials-fallback src when avatars list is empty). Tested
        // under tests/unit/page/user/Streams/CameraStreamsModal/
        // UserProfileDialog.test.jsx.
        "src/page/user/Streams/CameraStreamsModal/UserProfileDialog.jsx",
        // Round 57: Streams/CameraStreamsModal/CameraCanvasModal — the
        // zoom/pan-capable canvas the StreamModal embeds when a tile is
        // maximised. The new spec mocks useHlsPlayer + the
        // CameraStreamWithDetection child, and pins the loading->onCanPlay
        // transition, the hook-driven onError pane, the wheel-zoom +
        // Reset round-trip (scale 1 -> 1.15 -> 1), the close button +
        // onClose wiring (gated on !isInModal), and the 3-second
        // disappearance of the zoom hint via fake timers. Tested under
        // tests/unit/page/user/Streams/CameraStreamsModal/
        // CameraCanvasModal.test.jsx.
        "src/page/user/Streams/CameraStreamsModal/CameraCanvasModal.jsx",
        // Round 55: Streams/CameraStreamsModal/AttendanceCheckLog — the
        // floating top-left log panel rendered over the stream modal.
        // Two collapsible sections (Attendance Log / Access Log), each
        // sliced to the first five entries; both empty -> component
        // returns null. Click on an entry routes to onProfileClick with
        // an `isAccess` boolean differentiating attendance vs access
        // sources. Tested under tests/unit/page/user/Streams/
        // CameraStreamsModal/AttendanceCheckLog.test.jsx.
        "src/page/user/Streams/CameraStreamsModal/AttendanceCheckLog.jsx",
        // Round 54: Streams/CameraPlay/CameraStream — the JSMpeg-based stream
        // tile used by the various Streams pages. Polls window.JSMpeg every
        // 100ms until available then constructs a Player against
        // `${VITE_SOCKET_URL}/${RtspChannel}`. Maximize button hands the
        // config to setSelectedVideo and opens the modal via
        // UserContext.setStreamModalShow. Unmount destroys the player and
        // opens a control WebSocket to send 'stop'. Tested under
        // tests/unit/page/user/Streams/CameraPlay/CameraStream.test.jsx.
        "src/page/user/Streams/CameraPlay/CameraStream.jsx",
        // Round 58: Streams/CameraStreamsModal/CameraStreamWithDetection —
        // the absolute-positioned <canvas> overlay layered on the
        // CameraCanvasModal video. Reads polygon referencePoints keyed by
        // cameraId from each detection's detectionSetting.settings and
        // re-draws scaled polygons via a 2D context; observes the
        // underlying <video> via ResizeObserver and re-draws on video
        // 'playing' (which dispatches a window resize). Tested under
        // tests/unit/page/user/Streams/CameraStreamsModal/
        // CameraStreamWithDetection.test.jsx.
        "src/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx",
        // Round 59: Streams/CameraStreamsModal/StreamModal — the last
        // untested sibling in the CameraStreamsModal subdir. Orchestrates
        // the maximised camera view: requests element fullscreen on mount,
        // wires the document fullscreenchange handler that calls onClose
        // when the user exits fullscreen, filters detections /
        // accessAllDetections / attendanceLogs to the active camera, and
        // composes the close button, ZoneSelector, CameraCanvasModal,
        // AttendanceCheckLog, and UserProfileDialog children. The new spec
        // pins the isOpen=false null-render path, the maximised mount path
        // (requestFullscreen call, multi-channel chevron rendering, fresh
        // countPersons + countVehicles counter cards, "People Detected"
        // strip stat, per-camera detection filtering), and the close-via-
        // fullscreenchange-exit path. Tested under tests/unit/page/user/
        // Streams/CameraStreamsModal/StreamModal.test.jsx.
        "src/page/user/Streams/CameraStreamsModal/StreamModal.jsx",
        // Round 60: Streams/LiveViewModal — the side-overlay live-feed
        // modal (distinct from the fullscreen StreamModal in
        // CameraStreamsModal/). Owns memoised HLS URL (raw vs
        // VITE_STREAM_URL-prefixed via VITE_LOCAL_SETUP), the
        // useHlsPlayer lifecycle, an Edit overlay (gated on
        // permissions.channels.edit) that fetches departments once on
        // open and saves via createCameraAliasName with toasts and a
        // local activeCamera update, prev/next navigation with wrap-
        // around through cameraList, and the isOpen=false null guard.
        // Tested under tests/unit/page/user/Streams/LiveViewModal.test.jsx.
        "src/page/user/Streams/LiveViewModal.jsx",
        // Round 49: layout/Sidebar/AdminSidebar — the admin-side rail
        // (User Details parent + child routes, Role & Permission,
        // Locations, Departments). Tests pin all four labels + the
        // auto-expanded User Details children on mount, leaf-click
        // navigates to its route, parent-click toggles expansion
        // without navigating, active-class on the matching pathname,
        // isChildActive lifts the active class to the parent when a
        // child route matches, and child-click navigates to the child
        // route. Mocks the giant Streams/Nvrform import so its
        // Formik + Yup + Streams Api chain doesn't enter the test
        // graph. Tested under tests/unit/layout/Sidebar/
        // AdminSidebar.test.jsx.
        "src/layout/Sidebar/AdminSidebar.jsx",
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
