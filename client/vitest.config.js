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
        // Round 61: Settings/StorageSetting/AddStorageModal — the
        // Formik + yup + Radix Dialog "Add Storage" / "Edit Storage"
        // modal. Lazily mounts SFTPForm / GoogledriveForm / S3Form per
        // picked type; submits via addStorage (create) or updateStorage
        // (edit) with Base64-encoded password / secretAccessKey;
        // google_drive_oauth opens response.data.body.data.url in a new
        // tab. Tests pin: initial picker render (Add mode), title +
        // pre-fill swap (Edit mode), sub-form lazy mount per type, the
        // disabled type-Select in edit mode, the closed-when-isOpen-
        // false null guard, the validation guard that blocks submit
        // when password is blank in edit mode (yup `when storageType`
        // clauses), and controlled Name-input keystroke forwarding.
        // Tested under tests/unit/page/user/Settings/StorageSetting/
        // AddStorageModal.test.jsx.
        "src/page/user/Settings/StorageSetting/AddStorageModal.jsx",
        // Round 63: Profile/Profile — the top-level Profile listing page.
        // The full page is heavy (search + column-toggle popover +
        // Pagination + ProfilesTable + MultiStepForm dialog + bulk
        // delete/export + four Api modules + usePermissions + useDebounce),
        // but the permission gates at the top short-circuit before any of
        // those run. The new spec pins the two early-return branches:
        // permissionsLoading -> <PageLoader />, and !canView ->
        // <AccessDenied message="…" />. Tested under tests/unit/page/user/
        // Profile/Profile.test.jsx.
        "src/page/user/Profile/Profile.jsx",
        // Round 62: Incidents/Incidents — the top-level Incidents page.
        // The full grid is heavy (StatCards + VideoModal + IncidentCard +
        // MultiSelect + DateRangePicker + AutoRefresh + four Api modules +
        // three contexts), but the permission gates at the top of the
        // component short-circuit before any of those run. The new spec
        // pins the two early-return branches: permissionsLoading ->
        // <PageLoader />, and !canView -> <AccessDenied message="…" />.
        // Tested under tests/unit/page/user/Incidents/Incidents.test.jsx.
        "src/page/user/Incidents/Incidents.jsx",
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
        // Round 64: two more top-level permission-gated pages —
        //  - RolePermissions/RolesandPermission: the full roles &
        //    permissions management screen (AddRoleDialog, PermissionStep,
        //    DeleteConfirmation, PermissionTable, Pagination, four Api
        //    modules). The gate at the top short-circuits before any of
        //    those hooks/queries fire.
        //  - Streams/Cameraview: the multi-camera grid live-view page
        //    (CameraTwo / CameraStreamDisplay tiles, GridViewModal,
        //    multi-select filters, axios + getAccessToken, two contexts,
        //    react-router useNavigate/useLocation). The gate also sits
        //    at the very top of the component, before any other hook
        //    runs.
        // Each entry has a dedicated test under tests/unit/page/user/
        // {RolePermissions/RolesandPermission,Streams/Cameraview}.test.jsx.
        "src/page/user/RolePermissions/RolesandPermission.jsx",
        "src/page/user/Streams/Cameraview.jsx",
        // Round 65: two more 0% surfaces —
        //  - Streams/Streams: the top-level NVR Settings listing page
        //    (AddNVRForm + Nvrsettings / NvrLocalsettings + getAllNvrDetails
        //    / deleteNVR Api modules + skeleton loader + sonner toasts).
        //    The permission gate at the top short-circuits before any of
        //    those run; the new spec pins the two early-return branches
        //    (permissionsLoading -> PageLoader, !canView -> AccessDenied).
        //  - Streams/Cameraview/GridViewModal: the fullscreen "Live
        //    Monitoring" multi-camera grid modal. Pure presentational
        //    with the dialog open/null guard, the channel-to-tile
        //    formatting (rtspChannels[1].id pulled into config,
        //    customName|name display), perPage slicing, ArrowLeft /
        //    ArrowRight window-key pagination, the Close button
        //    onOpenChange(false) wiring, and the default-grid fallback
        //    when selectedGrid does not match any gridOption.
        // Each entry has a dedicated test under tests/unit/page/user/
        // Streams/{Streams,Cameraview/GridViewModal}.test.jsx.
        "src/page/user/Streams/Streams.jsx",
        "src/page/user/Streams/Cameraview/GridViewModal.jsx",
        // Round 66: two more 0% top-level permission-gated pages —
        //  - Locations/Locations: the locations listing page (Pagination +
        //    PermissionTable + LocationForm + DeleteConfirmation +
        //    fetchLocations / deleteLocation Api). The gate at the top
        //    short-circuits before any of those hooks fire. Passes
        //    <AccessDenied /> with no message prop on the deny branch.
        //  - NotificationRecipients/NotificationRecipients: the
        //    notification recipients listing page (RecipientList +
        //    AddRecipientModal + getRecipients/getDetectionTypes/
        //    resendMailOrSMS Api + useDebounce + AuthContext +
        //    react-router useNavigate). The gate short-circuits with a
        //    Recipients-specific AccessDenied message.
        // Each entry has a dedicated test under tests/unit/page/user/
        // {Locations/Locations,NotificationRecipients/NotificationRecipients}.test.jsx.
        "src/page/user/Locations/Locations.jsx",
        "src/page/user/NotificationRecipients/NotificationRecipients.jsx",
        // Round 67: two more layout/Sidebar files —
        //  - Sidebar/SettingsSidebar: the Settings / Detection Settings
        //    side rail (4-item nav: Profile / Detection Settings / Alert
        //    Recipients / Storage Settings). Pure pathname-driven active
        //    state; AddNVRForm import is gated by an internal showNVRForm
        //    flag that no in-component trigger flips, so the form stays
        //    dormant on mount. The new spec stubs Nvrform + Button +
        //    react-router-dom.useNavigate, pins the four labels, the
        //    active background gate, the Detection Settings activePaths
        //    /settings/inner branch, leaf-click navigate routing, and the
        //    AddNVRForm-stays-dormant invariant.
        //  - Sidebar/Sidebar: the main dashboard side rail. Heavily
        //    branched on permissions.dashboard.view, isSettingsPage,
        //    isLoading, and the displayWidgets (pathname === '/dashboard')
        //    flag. The new spec stubs usePermissions + DetectionToggle +
        //    SidebarSkeleton + AccessDenied and uses a UserContext.Provider
        //    to feed the 6 consumed context fields. Pins: view gate
        //    returns null, isSettingsPage gate returns null on both
        //    /settings and /detection-settings, isLoading renders the
        //    skeleton, non-dashboard non-settings paths mount no inner
        //    tile, sidebarShow=true renders the DetectionToggle list, and
        //    sidebarShow=false renders the collapsed icon list (one icon
        //    per detectionItem).
        // Each entry has a dedicated test under tests/unit/layout/
        // Sidebar/{SettingsSidebar,Sidebar}.test.jsx.
        "src/layout/Sidebar/SettingsSidebar.jsx",
        "src/layout/Sidebar/Sidebar.jsx",
        // Round 68: layout/Header/ProfileDropdown — the avatar button +
        // dropdown panel in the top-right of the header. Pure
        // presentational: avatar img with dicebear seed built from
        // name_f + (name_l ?? user_email), parent-driven open state
        // (profileDrop / setProfileDrop), Profile NavLink suppressed
        // by user.memberId truthy, Logout button calls handleLogout
        // prop, click-outside (mousedown) closes via setProfileDrop(false),
        // mousedown inside the dropdown panel is guarded by contains().
        // Tested under tests/unit/layout/Header/ProfileDropdown.test.jsx.
        "src/layout/Header/ProfileDropdown.jsx",
        // Round 69: two more layout-level loading placeholders —
        //  - layout/Header/HeaderSkeleton: the static placeholder rendered
        //    by the Header while permissions / context are still loading.
        //    Pure presentational, mirrors the real header layout (logo,
        //    7-pill desktop nav, action button + welcome strip + avatar).
        //    The new spec pins the single <header> shell + documented
        //    layout classes, the seven nav-pill count, the desktop-only
        //    welcome-text strip, and the no-interactive-controls invariant.
        //  - layout/Sidebar/SidebarSkeleton: the placeholder rail rendered
        //    by Sidebar's isLoading arm. Pure presentational with a fixed
        //    card wrapper and a column of five circular tile skeletons via
        //    [...Array(5)]. The new spec pins the fixed/rounded outer
        //    card, the five-tile count, the per-row justify-center wrapper
        //    structure, and the no-interactive-controls invariant.
        // Each entry has a dedicated test under tests/unit/layout/
        // {Header/HeaderSkeleton,Sidebar/SidebarSkeleton}.test.jsx.
        "src/layout/Header/HeaderSkeleton.jsx",
        "src/layout/Sidebar/SidebarSkeleton.jsx",
        // Round 70: layout/Header/HeaderActions — the top-right action
        // cluster shown next to the avatar. Pure presentational: branches
        // on UpgradeReqiore (Install button vs Upgrade pill + bell) and on
        // installerStatus (Install vs Installed, with the button disabled
        // in the Installed state). Both interactive controls build a
        // throwaway <a href="<bucket-url>"> and call .click() on it to
        // start the download. The new spec stubs @/components/ui/button to
        // a plain <button> and spies on document.createElement to observe
        // the anchor-click side-effect. Pins: default Install render
        // (no upgrade pill / bell), Install click triggers exactly one
        // anchor .click(), Installed-state disabled-button + label swap,
        // UpgradeReqiore=true hides Install + renders Upgrade pill + bell,
        // and the Upgrade pill triggers the same anchor-click install flow.
        // Tested under tests/unit/layout/Header/HeaderActions.test.jsx.
        "src/layout/Header/HeaderActions.jsx",
        // Round 71: Detection/components/DefaultDetectionSettings — the
        // read-only "Default Detection Setting" tile that sits inside
        // SettingsCard once a profile is applied. Renders a non-interactive
        // Switch (checked iff authorisedUsers.length > 0), a name strip
        // (first 3 inline, "+N more" overflow dropdown for the rest with
        // click-outside dismiss), and two permission-gated right-actions:
        // Edit mounts MultiStepForm with module='appliedProfile' +
        // selectedChannelIds derived from channelData.linkedCameras (gated
        // on permissions.detectionSettings.edit === true); Trash opens
        // DeleteConfirmation and on confirm calls
        // updateCameraSettingById(linkedCameras[0]._id, { profile: null })
        // + toasts success/error + re-fetches via fetchAppliedProfile.
        // Tested under tests/unit/page/user/Detection/components/
        // DefaultDetectionSettings.test.jsx.
        "src/page/user/Detection/components/DefaultDetectionSettings.jsx",
        // Round 72: Detection/components/ProfileSelectionDialog — the
        // Radix Dialog the AppliedProfile tile mounts when the user
        // attaches an existing camera-detection profile to the active
        // channel. Fetches via getProfileDetails on open + on
        // searchInput change; renders loading / error / empty /
        // populated branches; the populated branch is a RadioGroup of
        // profile rows with a 15-char truncate + ellipsis; Apply with
        // no selection toasts "Please select a profile", Apply with
        // selection routes through updateCameraSettingById(channelId,
        // { profile: _id }) and toasts success/error + refetches the
        // applied profile + onClose on 200; the "+ Add New Profile"
        // CTA next to the search input is gated on permissions.
        // detectionSettings.create. Tested under tests/unit/page/user/
        // Detection/components/ProfileSelectionDialog.test.jsx.
        "src/page/user/Detection/components/ProfileSelectionDialog.jsx",
        // Round 73: Playback/components/PlaybackHeader — the top filter
        // bar of the CCTV Playbacks page. Pure presentational: takes
        // {state, actions} and renders search input, four Selects
        // (Location/NVR/Camera/Department), a MultiSelect for camera
        // type, and a DatePicker. No internal API calls — all wiring
        // flows through the actions handler bag. Tested under tests/
        // unit/page/user/Playback/components/PlaybackHeader.test.jsx.
        "src/page/user/Playback/components/PlaybackHeader.jsx",
        // Round 74: EmployeeLogs/ActionCameraPreview — Radix Dialog
        // carousel-style preview popped up from the various log tables
        // when a row is clicked. Renders an image carousel with prev/
        // next chevrons + ArrowLeft / ArrowRight / Escape key handlers,
        // switches header copy + several detail rows on module=
        // 'attendancelogs' vs 'accesslogs', and accepts imageUrls
        // entries as either bare strings or {url,timestamp,cameraType}
        // objects (joined onto VITE_BACKEND + /api/v1/uploads). Tested
        // under tests/unit/page/user/EmployeeLogs/
        // ActionCameraPreview.test.jsx.
        "src/page/user/EmployeeLogs/ActionCameraPreview.jsx",
        // Round 76: Streams/CameraDiscoveryModal — the "Manage Cameras"
        // fixed overlay popped up by the Streams page. On mount fetches
        // ${VITE_BACKEND}/api/v1/nvr/edit/${nvrId} via axios + token header,
        // shows a Loader2 spinner while loading, "No cameras found" empty
        // line, or a list of camera checkboxes. Save computes toAdd /
        // toRemove diff sets against the initial isAdded+dbId map: empty
        // diff -> info toast + onClose, otherwise calls addSelectedCameras
        // once for additions and removeCamera(String(dbId)) per removal,
        // surfacing per-error toasts on partial failures. Tested under
        // tests/unit/page/user/Streams/CameraDiscoveryModal.test.jsx.
        "src/page/user/Streams/CameraDiscoveryModal.jsx",
        // Round 76: Streams/CameraPlay/PlaybackStreams — the JSMpeg-driven
        // playback tile (a canvas inside a forwardRef'd container). On
        // mount with window.JSMpeg + playbackChannel it constructs
        // `new window.JSMpeg.Player(${VITE_SOCKET_URL}/${playbackChannel},
        // { canvas, autoplay: isPlaying, audio: true, onSourceCompleted,
        // onPlay, onPause })`, fires onLoadedMetadata ~100ms later,
        // forwards Player.onPlay -> onPlaying / Player.onPause -> onEnded,
        // writes playbackRate through, drives a per-frame onTimeUpdate
        // loop while isPlaying, and destroys the player on unmount.
        // Tested under tests/unit/page/user/Streams/CameraPlay/
        // PlaybackStreams.test.jsx.
        "src/page/user/Streams/CameraPlay/PlaybackStreams.jsx",
        // Round 77: Detection/components/SettingsCard + ConfigSearchControl.
        //  - SettingsCard: the parent detection-settings card with two
        //    branches gated by import.meta.env.VITE_DESK_CLIENT. The
        //    desk-client branch is a self-contained verified-recipients
        //    Select with a click-outside-closes dropdown, +N overflow
        //    label, fetch-on-mount via getVerifiedRecipients, and a
        //    toggleRecipient flow that PATCHes the linked camera via
        //    updateCameraSettingById and toasts success / error. The
        //    browser branch composes AppliedProfile + four sub-section
        //    children only once appliedProfileData.profile is defined.
        //  - ConfigSearchControl: the search + NVR + multi-camera filter
        //    strip on SavedConfiguration. Fetches NVR names on mount,
        //    refetches cameras on nvrId change, mirrors searchTerm /
        //    nvrId / cameraId back through four setter props on every
        //    change, lowercases the search input, and disables the
        //    camera multi-select until an NVR is picked. Tested under
        //    tests/unit/page/user/Detection/components/
        //    {SettingsCard,ConfigSearchControl}.test.jsx.
        "src/page/user/Detection/components/SettingsCard.jsx",
        "src/page/user/Detection/components/ConfigSearchControl.jsx",
        // Round 75: Detection/components/AlertReceiversSection — the
        // "Alert Receivers Email Id/Phone No" dropdown panel rendered
        // inside the Detection settings card. Purely props-driven (no
        // API calls of its own): chip strip of already-selected
        // receivers with stop-propagation X close-buttons, click-to-
        // toggle dropdown via setIsReceiversDropdownOpen updater,
        // Escape-key-while-open closes the dropdown, Select-All /
        // Clear-All header row, a verified-only filter on
        // recipientsList, per-row Checkbox -> handleReceiverSelection
        // (_id, value, fullName), VerifiedBadge + Remove button on
        // verified rows, Verify/navigate('/notification-recipients')
        // + Remove buttons on unverified rows, and the scroll-to-
        // bottom pagination hook (skipRecipients += limitRecipients
        // when !loading && hasMore). Tested under tests/unit/page/
        // user/Detection/components/AlertReceiversSection.test.jsx.
        "src/page/user/Detection/components/AlertReceiversSection.jsx",
        // Round 78: two more Detection/components leaves —
        //  - Innersettings: the top-level Detection Settings page mounted
        //    from the camera-row detection link. Reads rowData / channelData
        //    / currentNvr off useLocation().state, orchestrates Header /
        //    LiveFeedSection / DeviceDetail / SettingsCard +
        //    ProfileSelectionDialog + ResetConfirmationDialog children, fires
        //    getAppliedProfile(channelId) on mount when channelId is truthy,
        //    and the reset-confirm flow either deletes a per-type detection
        //    setting (when one exists for selectedsettingType) or surfaces a
        //    no-detection-found toast. Spec captures the InnerSettingsProvider
        //    value bag, the no-channelId no-fetch arm, and both reset-confirm
        //    branches (delete-with-id vs no-detection-error).
        //  - StaticAreaMarking: the static-image fallback variant of the
        //    zone-marker. forwardRef'd component that mounts an <img> + a
        //    <canvas> overlay, exposes an imperative getPoints / setPoints /
        //    clearPoints / captureScreenshot / getResolution API via
        //    useImperativeHandle, drives draw via a points-effect that walks
        //    points[0..n-1] and closes the path at length 4, fans the
        //    useAreaMarking hook callbacks through AreaMarkingControls, and
        //    the Preview button pipes the canvas screenshot through
        //    callMarkPointsApi -> DetectionPreviewModal + MiniCameraPreview.
        //    Spec mounts the canvas with the documented 1280x720 internal
        //    resolution, asserts each AreaMarkingControls forwarded handler,
        //    the Preview round-trip, and the drawingMode-gated canvas onClick.
        // Each entry has a dedicated test under tests/unit/page/user/
        // Detection/components/{Innersettings,StaticAreaMarking}.test.jsx.
        "src/page/user/Detection/components/Innersettings.jsx",
        "src/page/user/Detection/components/StaticAreaMarking.jsx",
        // Round 79: Detection/components/SavedConfiguration — the "Saved
        // Configurations" expandable panel on the legacy DetectionSetting
        // page. Fetches on mount (and on addedDetection/filters dep change)
        // via getAllDetectionDetails(searchTerm,nvrName,cameraId), branches
        // through loading/error/empty/populated, mounts EditDetectionSettingModal
        // on per-card Edit, and on per-card Delete drives a DeleteConfirmation
        // flow → deleteDetectionSettings(_id) → toast + refetch (200) or
        // toast.error (non-200). Tested under tests/unit/page/user/Detection/
        // components/SavedConfiguration.test.jsx.
        "src/page/user/Detection/components/SavedConfiguration.jsx",
        // Round 80: two more Dashboard surfaces —
        //  - Dashboard/Alertwidgets/CameraViewSection: the presentational
        //    camera-view panel rendered on the right side of the dashboard.
        //    All values flow in through props (nvrList, selectedNvrId,
        //    cameraChannels, selectedCamera, selectedConfig, personCounts,
        //    objectDetections, emotionDetected, lineCrossing, etc.). Pins
        //    every render branch (nvrNameLoading skeleton, single-NVR
        //    disabled input, multi-NVR Select, populated/empty channel
        //    strip, selectedConfig CameraStream-or-Skeleton swap, chevron
        //    scroll handlers, line-crossing tile gate, and the four
        //    DetectionInfo sub-cards).
        //  - Dashboard/StatCards: the four-card incident summary strip
        //    (Critical / Total / Active Cameras / Resolved). On mount
        //    calls getAlertsData(nvrId, location, department) and stores
        //    the response body.data; the four cards then read from
        //    alertsData (dashboardTitles=true) or stats (false). Pins
        //    the API wiring, dashboardTitles vs stats fallback, the
        //    navigate routes with state-payload differences, the
        //    clickableFor() permission + requirePositive gates, and
        //    the non-200/rejection fall-back to 0.
        "src/page/user/Dashboard/Alertwidgets/CameraViewSection.jsx",
        "src/page/user/Dashboard/StatCards.jsx",
        // Round 81: two more Dashboard surfaces —
        //  - Dashboard/Linechart (ComparisonChart): the amCharts5-driven
        //    "Current week vs Previous week" line chart. Fires
        //    comparisonChart() on mount + on [nvrId, department, location]
        //    change, shape-transforms the API body into two parallel series
        //    keyed by the SAME current-week timestamps (the previousWeek
        //    series carries the real previousWeek date in
        //    `actualPreviousDate` for tooltip display), mounts an amCharts
        //    root + DateAxis + ValueAxis + two LineSeries, and disposes
        //    the root on unmount. The new spec deeply mocks @amcharts/
        //    amcharts5 + /xy + /themes/Animated (chainable shims with
        //    set/setAll/setThemes/push/get/appear/dispose), pins
        //    comparisonChart fan-out, both series .data.setAll payloads
        //    (including the actualPreviousDate alignment), the unmount
        //    disposal, and the rejection-swallow path.
        //  - Dashboard/AlertGauge: the alert gauge / carousel card. The
        //    component debounces 500ms then fires getCriticalityStats(
        //    skip, limit=5) + drives the gauge image / severity copy /
        //    Safe-Zone vs Notified-Manager badge off recentAlerts[idx],
        //    and the Mark-as-resolved checkbox calls markAlertResolved
        //    (id, { resolved: !resolved, incidentType }) + toasts +
        //    triggers useAuth().triggerUpdate() + refetches stats. The
        //    new spec pins the empty-state branch (No Current Alerts +
        //    Safe Zone footer), the high-severity populated branch
        //    (High-Alert header + Notified-Manager badge + last-alert
        //    timestamp + zone/camera/reason strip + Mark-as-resolved
        //    checkbox + the highalert.png image), and the resolve-click
        //    -> markAlertResolved + toast.success + triggerUpdate path.
        // Each entry has a dedicated test under tests/unit/page/user/
        // Dashboard/{Linechart,AlertGauge}.test.jsx.
        "src/page/user/Dashboard/Linechart.jsx",
        "src/page/user/Dashboard/AlertGauge.jsx",
        // Round 82: two more Dashboard surfaces —
        //  - Dashboard/VideoCanvasStream: the HLS-video tile rendered inside
        //    the dashboard's CameraView. useMemo computes the playable URL
        //    (VITE_LOCAL_SETUP=true passes raw hlsUrl[0] through; otherwise
        //    prefixes VITE_STREAM_URL), useHlsPlayer drives the <video>
        //    lifecycle (onStarted hides isWaiting, onError surfaces the
        //    "Unable to load stream" pane), the maximize button +
        //    double-click both call setSelectedVideo({cameraId,config}) +
        //    setStreamModalShow(true), and the StreamModal child only
        //    mounts when streamModalShow && selectedVideo.cameraId === cameraId.
        //    isMini=true suppresses the maximize button + label uses the
        //    small text class. onInteractionDisabledChange is fired with
        //    (isWaiting || isLoading || hasError) on each transition.
        //  - Dashboard/Alertcards/ActiveCamera: the "Cameras with Detections"
        //    full-page modal popped up from the dashboard StatCards. Fetches
        //    getIncidentData(ActiveChannels:true, today, today, ...) on mount
        //    and on [nvrId, cameraId, searchTerm, skip, limit] change;
        //    getNvrNames() on mount; getCamerasBasedOnNvr(nvrId) when nvrId
        //    flips. Renders a back button whose label + route swap on
        //    location.state.dashboard (Back to Dashboard / Back to Incidents),
        //    a four-column tanstack table with CameraName / Model /
        //    Firmware / NVR-name accessors that fall back to '---' on
        //    missing values, a Search input that lowercases, NVR + Camera
        //    Selects (camera disabled until NVR is picked), the FilterX
        //    "Clear Filters" button that resets all three filters, the
        //    skeleton loading state, the No-data-found copy, and the
        //    Pagination footer wired to handlePageChange (skip = (page-1)*limit).
        // Each entry has a dedicated test under tests/unit/page/user/
        // Dashboard/{VideoCanvasStream,Alertcards/ActiveCamera}.test.jsx.
        "src/page/user/Dashboard/VideoCanvasStream.jsx",
        "src/page/user/Dashboard/Alertcards/ActiveCamera.jsx",
        // Round 83: two more 0% surfaces —
        //  - EmployeeLogs/ReusableTablePage: the generic "search +
        //    date-range + view-mode toggle + ProfilesTable / gridCard +
        //    smart paginator + rows-per-page select" shell reused across
        //    almost every EmployeeLogs / AccessLog / Visibility / ANPR
        //    page. Pure presentational with controlled-or-internal state
        //    on viewMode, searchInput, limit, and dateRange. Server
        //    pagination is gated on a numeric attendanceLogsCount prop.
        //    The new spec stubs ProfilesTable + DateRangePickerComponent
        //    + Input + formatDateRange, and pins all the documented
        //    branches (table vs grid view, visibility-mode date-picker
        //    suppression, multi-key includes() search + currentPage
        //    reset side-effect, controlled vs internal search/viewMode/
        //    limit, server-pagination Total-logs strip, Prev/Next
        //    boundary disabling, onLimitChange-resets-page, the null
        //    payload no-op on the DateRangePicker, the loading + empty
        //    branches, and the children filter-row slot).
        //  - Dashboard/ActivityChart: the 2-slide dashboard carousel
        //    (slide 0 'activity' is a ReactApexChart bar/stacked chart
        //    driven by getDetectionData; slide 1 'comparison' mounts
        //    the ComparisonChart child). Default index is 1.
        //    handlePrevChart / handleNextChart / goToChart cycle slides;
        //    the Neutral series math is `max(0, 100 - totalPerDay[i])`
        //    per day. The new spec mocks Api/post + Linechart +
        //    react-apexcharts + react-loading-skeleton (5 mocks, well
        //    under cap) and pins: the default Comparison slide mount
        //    with forwarded props, Prev/Next arrow cycling, dot-click
        //    goToChart navigation, the bar chart populated branch
        //    (including verifying the Neutral series total math),
        //    the empty-state "No detection found" pane on slide 0 when
        //    series is empty, the non-200 status reset path, the catch
        //    branch on rejection, the re-fetch on [nvrId, department,
        //    location] dep change, and the loading-state Skeleton
        //    placeholders.
        // Each entry has a dedicated test under tests/unit/page/user/
        // {EmployeeLogs/ReusableTablePage,Dashboard/ActivityChart}.test.jsx.
        "src/page/user/EmployeeLogs/ReusableTablePage.jsx",
        "src/page/user/Dashboard/ActivityChart.jsx",
        // Round 84: two more 0% surfaces —
        //  - Detection/components/LiveFeedSection: the "Zone Marking"
        //    parent inside the Innersettings page. Fires
        //    getAllDetectionTypes() once on mount, refetches
        //    getAppliedProfile(channelId) whenever selectedsettingType
        //    flips, loads a per-type detection via
        //    getDetectionSettingType(type, channelId) when a type is
        //    picked, and mounts AreaSettingsPreview with a forwarded
        //    ref so the Edit button can call setChannelPoints with the
        //    normalised referencePoints. Spec pins the mount-time API
        //    fan-out, the read-only Detection Name + Zone Name inputs
        //    that only render when appliedDetection is non-null, the
        //    Edit click -> setChannelPoints round-trip + editable=true
        //    re-render, the derivedActiveCamera fallback chain
        //    (referencePoints keys -> defaultActiveCamera), the empty
        //    channelData.linkedCameras invariants (null defaultActive
        //    camera + no getAppliedProfile fire), and the
        //    selectedsettingType-change re-fetch.
        //  - Streams/Camerasettings: the Camera Settings page mounted
        //    from the NVR row "manage cameras" action. The page is heavy
        //    (TanStack-table cameras, AddNVRForm + DeleteConfirmation,
        //    alias popover with department multi-select, five Api
        //    modules, decrypt helper, LiveViewModal with the
        //    useHlsPlayer chain), but the permission gates at the top
        //    short-circuit before any of those run. The new spec pins
        //    the two early-return branches: permissionsLoading ->
        //    <PageLoader />, and !canViewNVR -> <AccessDenied
        //    message="…permission to view NVR's." />. Includes the
        //    "permissions object missing NVR entirely" arm so the
        //    canViewNVR=undefined fall-through is covered too.
        // Each entry has a dedicated test under tests/unit/page/user/
        // {Detection/components/LiveFeedSection,Streams/Camerasettings}.test.jsx.
        "src/page/user/Detection/components/LiveFeedSection.jsx",
        "src/page/user/Streams/Camerasettings.jsx",
        // Round 85: two more 0% surfaces —
        //  - UserDetails/UserDetails.jsx: the top-level Users listing page
        //    mounted under /user-details. The full page is heavy
        //    (PermissionTable + Pagination + NewPermissionForm dialog +
        //    DeleteConfirmation + getUserDetails / deleteUser /
        //    deleteBulkUser Api modules + Formik-driven role assignment +
        //    column-toggle popover + jwt-decode of the access token), but
        //    the permission gates at the very top short-circuit before any
        //    of those hooks fire. Spec pins the two early-return arms
        //    (permissionsLoading -> PageLoader, !canView -> AccessDenied)
        //    plus the "permissions object missing Users entirely" arm so
        //    the canView=undefined fall-through is covered too.
        //  - Users/UserForm.jsx (default export LoginForm): the user-side
        //    login screen at /user-login. Formik + Yup form with two
        //    fields, password eye-toggle, Remember-me checkbox, Forgot-
        //    password navigate, userLogin Api call, success branch that
        //    sets the dev/prod/local access-token cookie + toasts the
        //    server message + navigates to /dashboard, non-success and
        //    rejection branches that surface toast.error and skip the
        //    navigate. Spec pins each: initial render, forgot-password
        //    navigate, password type-toggle round-trip, empty-form Yup
        //    errors, success path (cookies.set + toast.success +
        //    navigate("/dashboard") + rememberMe=false -> cookies.remove),
        //    non-success path, rejection path.
        // Each entry has a dedicated test under tests/unit/page/user/
        // {UserDetails/UserDetails,Users/UserForm}.test.jsx.
        "src/page/user/UserDetails/UserDetails.jsx",
        "src/page/user/Users/UserForm.jsx",
        // Round 86: two more 0% surfaces —
        //  - Detection/components/zonemarking/AreaMarkingControls: the
        //    action-bar of buttons rendered beneath the zone-marking canvas
        //    inside Innersettings / AreaSettingsPreview. Pure props/ref-
        //    driven (no API of its own): validateDetectionType gates every
        //    handler with a "Please select Detection Type" toast,
        //    selectedType="lineCrossingSettings" branches to a Draw Line
        //    button (suppressing Max/Min/Start-Drawing), Max/Min Area write
        //    the documented full-screen / 100..300 rectangle through
        //    cameraStreamRef.setPoints + flip drawingMode off / moveMode on,
        //    Start Drawing toggles drawingMode + clears empty points via
        //    clearPoints, Save Area validates "draw an area" + the
        //    selectedsettingType-required guard before opening the save
        //    modal, the save modal Submit validates both names are non-
        //    blank and ≤ MAX_NAME_LENGTH, and Clear All opens
        //    DeleteConfirmation -> handleDeleteArea on confirm.
        //  - Users/EmployeeRegister: the public /employee-register screen
        //    that bootstraps departments + employee locations on mount,
        //    walks a two-step Formik flow (details -> photo upload via
        //    react-webcam or file input), the Continue button runs the Yup
        //    schema + checkEmail (fetch isEmailExist) before stepping, the
        //    Register button posts to createUserAPI with FormData when
        //    enough photos are uploaded (3, or 1 when VITE_ORGANISATION_ID
        //    === "dubai") and toasts success / setRegistered(true).
        // Each entry has a dedicated test under tests/unit/page/user/
        // {Detection/components/zonemarking/AreaMarkingControls,
        // Users/EmployeeRegister}.test.jsx.
        "src/page/user/Detection/components/zonemarking/AreaMarkingControls.jsx",
        "src/page/user/Users/EmployeeRegister.jsx",
        // Round 88: two more 0% surfaces —
        //  - Streams/Nvrsettings: the NVR list-card variant rendered on the
        //    top-level /streams Streams page (distinct from NvrLocalsettings
        //    in R43). Empty-state placeholder, populated card render with
        //    decrypt(ip) + truthy-gated IP/Username/RTSP-Port fields,
        //    StreamHeader Add-NVR CTA, Edit-row Nvrform pre-fill, Camera
        //    Settings + View CCTV Streams navigates, Manage Cameras opens
        //    CameraDiscoveryModal, Delete -> DeleteConfirmation -> onDeleteNvr,
        //    permission-gate hides Edit/Cameras/Delete when denied.
        //  - Dashboard/EmployeesOnDuty: the "Authorized Employees" search +
        //    scroll-paginated list card. On debounced search change calls
        //    authorizedUsers(skip,limit,term); selecting a row opens a
        //    Formik+Yup edit dialog that submits via updateAuthorizedUsers
        //    when at least one field differs from the original (warning
        //    toast on no-change). canEdit gates the inline SquarePen
        //    edit-toggles + the Save Profile submit; non-200 surfaces
        //    toast.error.
        "src/page/user/Streams/Nvrsettings.jsx",
        "src/page/user/Dashboard/EmployeesOnDuty.jsx",
        // Round 89: two more 0% surfaces —
        //  - EmployeeLogs/VisibilityLog: presence/absence-over-24h channel
        //    timeline page. Fires getDeskChannelGraph(searchQuery, skip,
        //    limit, { date }) on mount + on [currentPage, selectedDate,
        //    searchQuery] dep change, maps each channel's incidents into
        //    presence/absence segments via UTC->local minute math + a
        //    running personPresent state machine, and forwards data /
        //    columns / searchKeys / loading / attendanceLogsCount /
        //    setCurrentPage / onSearchChange to ReusableTablePage. The
        //    children slot renders a date <input> clamped to the current
        //    month boundary plus a presence/absence legend strip.
        //  - EmployeeLogs/TrackLog: two-tab Users/Vehicles tracking page
        //    rendered at /track. The active tab drives the list fetch
        //    (getTrackUsers vs getVehicleList), the per-row selection
        //    triggers the per-user/vehicle logs fetch (getTrackLogs vs
        //    getVehicleLogs), and the rendered events get formatted into
        //    {step, title, timestamp, images, cameraId, location} rows.
        //    Thumbnails differ per tab (user: 3-up face/person/frame
        //    thumbnails; vehicle: single vehicle thumb). handleTabChange
        //    resets selectedItem, trackData, activeFeed, search, and
        //    dropdown state. activeFeed picks the right image source per
        //    selectedImageType with face/person/frame fall-through.
        "src/page/user/EmployeeLogs/VisibilityLog.jsx",
        "src/page/user/EmployeeLogs/TrackLog.jsx",
        // Round 90: two more 0% EmployeeLogs pages —
        //  - EmployeeLogs/GuardLog: per-channel 24-hour presence/absence
        //    page (sibling of VisibilityLog covered in R89). Fires
        //    getGuardChannelGraph(searchQuery, skip, limit, { date }) on
        //    mount + on [currentPage, selectedDate, searchQuery] dep
        //    change, maps each channel's incidents into presence/absence
        //    segments via UTC->local minute math, and forwards data /
        //    columns (4: channelId / totalPresenceTime / totalAbsenceTime /
        //    segments) / searchKeys / loading / attendanceLogsCount /
        //    setCurrentPage / onSearchChange to ReusableTablePage. The
        //    children slot renders a date <input>, the Export-Logs Excel
        //    button (drives xlsx-js-style book_new -> json_to_sheet ->
        //    book_append_sheet -> writeFile with `camera_logs_<date>.xlsx`
        //    filename), and a presence/absence legend strip.
        //  - EmployeeLogs/VehicleCountLogs (PRIVATE-ONLY): per-NVR vehicle
        //    count time-series page. Fires axios GET to
        //    /api/v1/incidents/logs/vehicle-count on mount + on
        //    [skip, startDate, endDate] dep change, persists autoRefresh
        //    + refreshInterval to localStorage, drives a per-interval
        //    setInterval refetch, renders a ReactApexChart per record
        //    when seriesData is non-empty (empty -> "No time-series data"
        //    fallback), and the smart paginator clamps clicks to
        //    [1, totalPages] with first/prev/next/last + ellipsis pages.
        "src/page/user/EmployeeLogs/GuardLog.jsx",
        "src/page/user/EmployeeLogs/VehicleCountLogs.jsx",
        // Round 91: Dashboard/AttendanceLogsLive — the "Live Attendance"
        // (or "Live Notifications" under VITE_ORGANISATION_ID="dubai")
        // card mounted on the dashboard. Reads attendanceLogs + isMuted
        // from useAllDetections(), maps each log through mapLog (employee
        // name composition + premise / avatar / capturedImage fall-back
        // chains + composite id), slices to first 12 and renders one
        // card per entry with the makeDeptColorResolver palette
        // assignment. The items-change effect silently snapshots the
        // current id set on first mount and on subsequent updates calls
        // speak() for new ids only (when !isMutedRef.current); isMuted
        // flipping true cancels any in-flight utterance via
        // window.speechSynthesis.cancel(). The avatar button opens a
        // DetailModal (Escape / overlay click / X button close it; the
        // inner dialog click stops propagation; the captured + profile
        // <img>s drive loading/loaded/error states off onLoad/onError;
        // the modal labels swap between Entered/Exited Premise based on
        // cameraType; designation/email/employeeId rows render only
        // when present). Tested under tests/unit/page/user/Dashboard/
        // AttendanceLogsLive.test.jsx.
        "src/page/user/Dashboard/AttendanceLogsLive.jsx",
        // Round 92: Detection/DetectionSetting — the top-level Detection
        // Settings listing page mounted under /detection-settings (distinct
        // from DetectionSettingsModal R45, Innersettings R78, and
        // SavedConfiguration R79). The full page is heavy (TanStack-table
        // of channels, NVR + Camera Selects, three Detection/Api modules +
        // Streams/Api/patch, Pagination, DeleteConfirmation, Monitorcog
        // popover, Tooltip on every action, six setIsXxxLoading flags),
        // but the permission gates at the very top of the component
        // short-circuit before any of those hooks fire. The new spec pins
        // the two early-return arms (permissionsLoading -> PageLoader,
        // !canView -> AccessDenied "permission to view Detections.") plus
        // the "permissions object missing detectionSettings entirely" arm
        // so the canView=undefined fall-through is covered too, and the
        // "loading wins over canView=false" precedence invariant. Tested
        // under tests/unit/page/user/Detection/DetectionSetting.test.jsx.
        "src/page/user/Detection/DetectionSetting.jsx",
        // Round 94: EmployeeLogs/AccessLog — the top-level "Access Logs"
        // listing page mounted under /logs/access. The full page is heavy
        // (TanStack-table via ReusableTablePage, LogEmployeeProfileDialog +
        // ActionCameraPreview, LogsFilterPopover + AutoRefreshComponent,
        // six Api/post endpoints + Api/get, jsPDF/autotable/xlsx export,
        // sonner toasts, react-router-dom navigate, multiple useEffects
        // firing at mount + on every filter change), but the permission
        // gates at the bottom of the component short-circuit before the
        // downstream ReusableTablePage tree mounts. Spec pins the
        // null-render permissionsLoading branch, the AccessDenied branch
        // when accessLogs.view is false, the "permissions object missing
        // logs entirely" arm (resolveLogPerm `if (!logs) return false`
        // path), and the "loading wins over canView=false" precedence
        // invariant. Tested under tests/unit/page/user/EmployeeLogs/
        // AccessLog.test.jsx.
        "src/page/user/EmployeeLogs/AccessLog.jsx",
        // Round 95: two more 0% top-level permission-gated log pages —
        //  - EmployeeLogs/AttendanceLog: the top-level "Attendance Logs"
        //    page mounted under /logs/attendance. Heavy downstream tree
        //    (ReusableTablePage + LogEmployeeProfileDialog +
        //    ActionCameraPreview + BreakLogsDialog, LogsFilterPopover +
        //    AutoRefreshComponent, four Api/post + Api/get +
        //    Dashboard/Api/get, jsPDF/autotable/xlsx export), but the
        //    permission gates short-circuit before any of those run. Spec
        //    pins the null-render permissionsLoading branch, the
        //    AccessDenied branch when attendanceLogs.view is false, the
        //    "permissions object missing logs entirely" arm, and the
        //    "loading wins over canView=false" precedence invariant.
        //  - EmployeeLogs/ANPRLogs: the top-level "ANPR Logs" (Automatic
        //    Number Plate Recognition) page mounted under /logs/ANPR.
        //    Heavy downstream tree (ReusableTablePage, AutoRefreshComponent,
        //    direct axios GET to /api/v1/incidents/logs/vehicle-detection,
        //    Api/post getNVRs / getchannels, jsPDF/autotable/xlsx export),
        //    but the same permission-gate pattern at the bottom short-
        //    circuits the render. Spec pins the same four arms.
        // Each entry has a dedicated test under tests/unit/page/user/
        // EmployeeLogs/{AttendanceLog,ANPRLogs}.test.jsx.
        "src/page/user/EmployeeLogs/AttendanceLog.jsx",
        "src/page/user/EmployeeLogs/ANPRLogs.jsx",
        // Round 96: layout/Layout.jsx — the top-level page chrome shown on
        // every authenticated route. Owns the pathname-driven sidebar
        // selector (SETTINGS / ADMIN / LogsSidebar / null), the `hasSidebar`
        // gap-class + spacer toggle, and the route-change useEffect that
        // scrolls `.app-scroll-container` back to top. The new spec stubs
        // Header + the four Sidebar variants + TitleUpdater (6 mocks), pins
        // each pathname branch (dashboard -> null sidebar; /settings ->
        // SettingsSidebar; /admin/roles/* -> AdminSidebar; /logs/* ->
        // LogsSidebar; arbitrary path -> no sidebar), the scroll-to-top
        // effect (instrumented via document.querySelector), and the
        // missing-container no-op guard. Tested under tests/unit/layout/
        // Layout.test.jsx.
        "src/layout/Layout.jsx",
        // Round 98: layout/Header/Header.jsx — the top-level page chrome
        // shown on every authenticated route. Combines three contexts
        // (AuthContext / Permission / AllDetections) + UserContext with
        // four child slot components (HeaderSkeleton / DesktopNav /
        // MobileNav / ProfileDropdown), opens a status WebSocket on mount,
        // and computes the filtered navLinks list before render. The new
        // spec stubs the three context hooks + the four child components
        // (7 mocks, one under cap) and pins: the AuthContext.isLoading
        // skeleton branch, the loaded-state full-chrome render after the
        // 1.5s mount timer (logo + DesktopNav + MobileNav +
        // ProfileDropdown + mute button + Welcome strip with capitalised
        // first letter), the mute-button -> AllDetections.toggleMute
        // wiring, the isMuted=true aria-label swap, the Welcome-strip
        // suppression when user.name_f is missing, the empty-permissions
        // pass-through that forwards all 8 baseNavLinks to DesktopNav,
        // and the Settings-tab filter when every settings sub-permission
        // is false. Tested under tests/unit/layout/Header/Header.test.jsx.
        "src/layout/Header/Header.jsx",
        // Round 99: Dashboard/Alertcards/CriticalAlerts — the "Critical /
        // Total / Resolved Incidents" listing page popped up from the
        // dashboard StatCards card-click handlers (sibling of ActiveCamera
        // covered in R82, but with a different filter contract). Heavy
        // downstream tree (TanStack-table with 9 columns, VideoModal,
        // ReportIncidentModal, NVR + Camera Selects, four Api modules,
        // useDebounce, useAuth + usePermissions contexts, memo'd
        // IncidentTable, react-loading-skeleton), but the page is
        // permission-gateless — every branch flows through the
        // location.pathname -> INCIDENT_TYPE_MAP -> API_TYPE_MAP chain.
        // Spec mounts the three documented pathnames (/critical-incidents,
        // /total-incidents, /incidents-resolved) and pins the page title,
        // sub-label, API flag fan-out, the location.state.incident-
        // branched back-button (Back to Incidents -> /incidents vs
        // Back to Dashboard -> /dashboard), and the non-200
        // getIncidentData failure path with toast.error + No-data-found
        // copy. Tested under tests/unit/page/user/Dashboard/Alertcards/
        // CriticalAlerts.test.jsx.
        "src/page/user/Dashboard/Alertcards/CriticalAlerts.jsx",
        // Round 100: three more 0% surfaces —
        //  - Dashboard/Dashboard.jsx: the top-level user dashboard page
        //    mounted under /dashboard. Full page is heavy (StatCards /
        //    RecentAlerts / EmployeesOnDuty / AlertGauge / ActivityChart /
        //    CameraStream / VideoCanvasStream / AttendanceLogsLive children,
        //    four Api/get calls via three pre-gate useEffects, five
        //    contexts), but the permission gates near the bottom of the
        //    component short-circuit the downstream tree:
        //      if (permissionsLoading) return <PageLoader />;
        //      if (!canView) return showDenied ? <AccessDenied /> : <div></div>;
        //    The new spec pins all three early-return arms (loading,
        //    immediate-placeholder, post-2s-AccessDenied) plus the missing-
        //    dashboard-permissions fall-through using fake timers + 8 mocks.
        //  - Settings/StorageSetting/components/S3Form.jsx and SftpForm.jsx:
        //    sibling presentational sub-forms alongside the already-included
        //    GoogledriveForm (R27). Pure controlled Formik sub-forms (no
        //    effects, no fetch) — existing tests under tests/unit/page/user/
        //    Settings/StorageSetting/components/{S3Form,SftpForm}.test.jsx
        //    were authored without adding the src files to the include
        //    scope. Adding them here so the coverage report counts their
        //    pre-existing tests.
        "src/page/user/Dashboard/Dashboard.jsx",
        "src/page/user/Settings/StorageSetting/components/S3Form.jsx",
        "src/page/user/Settings/StorageSetting/components/SftpForm.jsx",
        // Round 101: Dashboard/Alertwidgets/alert.jsx — the FireAlert
        // wrapper that fans switchOn[] entries through a per-incidentType
        // switch to one of six BaseAlertCard variants (PersonCount /
        // VehicleCount / MotionDetection / ObjectDetection / Unauthorized /
        // Authorized Loitering) or falls back to <NoDataCard incidentName=
        // {...} /> on an unknown type. BaseAlertCard renders a header
        // strip (icon + heading + Severity chip), a preview pane (video /
        // .webp image / "No Image Available" fallback), a Maximize button
        // gated on totalWidgets (single-tile layout only), and a metadata
        // grid (one cell per metaData entry or a "Metadata: N/A" fallback).
        // The lineCrossing case at line 52 is product-bug #97 (lowercase
        // <lineCrossingAlertCard> JSX tag) and is skipped in the new
        // spec with an it.skip annotation. Tested under tests/unit/page/
        // user/Dashboard/Alertwidgets/alert.test.jsx.
        "src/page/user/Dashboard/Alertwidgets/alert.jsx",
        // Round 97: Playback/Playback.jsx — the top-level "CCTV Playbacks"
        // page mounted under /playback. The full page is heavy
        // (useReducer-driven filters/state machine, PlaybackHeader +
        // VideoSection children, multiple useCallback fetchers each
        // calling axios.post against /api/v1/authorizedChannels/*, a
        // debounce'd camera search, websocket teardown on unmount, 5+
        // useEffects firing on mount), but the permission gates near the
        // bottom of the component short-circuit the render before any of
        // the downstream JSX mounts. Spec pins the three early-return arms
        // (permissionsLoading -> PageLoader; !canView -> AccessDenied
        // "permission to view Playbacks."; "permissions object missing
        // playbacks entirely" -> AccessDenied fall-through). Mocks
        // PermissionContext + AccessDenied + PageLoader + SocketContext +
        // react-router-dom + axios + getAccessToken + PlaybackVideo (8 at
        // cap — needed because the useEffects above the gate still
        // register + fire on the first commit). Tested under tests/unit/
        // page/user/Playback/Playback.test.jsx.
        "src/page/user/Playback/Playback.jsx",
        // Round 102: Detection/Api/put/index.jsx — PRIVATE-CLONE-ONLY API
        // leaf with the same two functions as the public mirror's
        // Detection/Api/patch/index.jsx. Both use axios.put despite the
        // path name; the file is the 4th known clone divergence (joins
        // EmployeeRegister R86, VehicleCountLogs R90, AttendanceLogsLive
        // R91). New tests/unit/page/user/Detection/Api/put.test.js
        // (private only) pins every URL contract, the token-fresh-per-
        // call invariant, body pass-through, raw-response return, and
        // rejection propagation for both updateDetectionSettings (per-id
        // PUT) and enableDetectionSettings (toggle PUT).
        "src/page/user/Detection/Api/put/index.jsx",
        // Round 103: RolePermissions/PermissionStep — the 5-column
        // permission matrix sub-step rendered inside AddRoleDialog
        // (Access | View | Create | Edit | Delete). Pure props-driven
        // (no API of its own): updatePermission auto-flips view=true
        // when enabling create/edit/delete, cascades create/edit/delete=
        // false when disabling view, no-ops on channels.create + channels.
        // delete (those cells are wrapped in a "Not in use" Tooltip and
        // rendered disabled); updateLogsSubPermission cascades view to
        // every LOG_SUB_KEY when toggling the global row, and recomputes
        // global as an OR of children when toggling a child; handleSelectAll
        // / handleClearAll build per-module action bags from the union of
        // roleData.permissionDetails.permissionConfig keys + edited keys,
        // with the channels module forced to create=false / delete=false
        // on select-all and the logs module rebuilt as global + every
        // LOG_SUB_KEY. readOnly suppresses the Select All / Clear All
        // bar and disables every row checkbox. Tested under tests/unit/
        // page/user/RolePermissions/PermissionStep.test.jsx.
        "src/page/user/RolePermissions/PermissionStep.jsx",
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
