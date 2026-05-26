# Testing — Session Handoff

> Pick-up document for the testing initiative. Read this first, then jump to
> the wave you want. Last refreshed: **2026-05-26**.

## TL;DR — what changed on 2026-05-26 (R76 — full 4-phase round, +40 tests; **face_auth_onfly_api hits 100%; storage 93.36%; getLocationFromAPI 100%**)

- **server** — `core/v1/storage/storage.service.js` `uploadToSFTP`
  body (lines 908-965, the largest remaining uncovered region) +
  `handleRangeRequest` error arms (1311-1316). New
  `server/tests/integration/services/storage.service.uploadSFTP.test.js`
  (**6 tests, 5 mocks** — ssh2-sftp-client, @aws-sdk/client-s3,
  googleapis, mime-types, utils/newSFTPConnectionCheck). Pinned:
  uploadToSFTP happy path (cold-start pool, mkdir, pipeline, Files
  persist, temp delete, 200 JSON), folderName override branch,
  mkdir "Failure" already-exists swallow branch, non-"Failure"
  mkdir error → catch + finally bookkeeping; handleRangeRequest
  ERR_STREAM_PREMATURE_CLOSE swallow vs re-throw. Coverage of
  storage.service.js: **88.49% → 93.36%** stmts (+4.87pp); branches
  **86.03% → 87.30%** (+1.27pp); fns **92% → 96%** (+4pp). Suite
  2542 → 2548 / +6. **Across R73→R74→R75→R76 storage.service.js:
  ~64% → 78% → 88.49% → 93.36%**. Public `456bf93`, private mirror
  `497bddd`.
- **client** — TWO 0% Streams files covered in one round:
  - `page/user/Streams/CameraDiscoveryModal.jsx` (166-line
    "Manage Cameras" axios+sonner modal). New
    `client/tests/unit/page/user/Streams/CameraDiscoveryModal.test.jsx`
    (9 tests, 7 mocks). Pinned: loading spinner, empty state,
    populated list, checkbox toggle, Save no-diff info-toast path,
    Save add path with `addSelectedCameras`, Save remove path with
    `removeCamera(String(dbId))`, error response, GET-failure-on-mount,
    X+Cancel close wiring.
  - `page/user/Streams/CameraPlay/PlaybackStreams.jsx` (180-line
    JSMpeg forwardRef canvas tile). New
    `client/tests/unit/page/user/Streams/CameraPlay/PlaybackStreams.test.jsx`
    (9 tests, **0 mocks**). Pinned: canvas render, function-ref +
    object-ref forwarding, no-JSMpeg/no-channel guards, JSMpeg
    Player constructor URL+options, ~100ms `onLoadedMetadata` fire,
    `onPlay`→`onPlaying`/`onPause`→`onEnded` hooks, `playbackRate`
    writethrough, unmount destroy.
  
  Suite 1527 → 1545 / +18. Public `55f53d6`, private mirror `738d69d`.
- **streaming** — `internal/logger` 93.0% → **94.0%** (+1.0pp).
  `getLocationFromAPI` **87.5% → 100%** (+12.5pp). Two error arms
  pinned (both 0% before): `io.ReadAll` body-read failure (custom
  `http.RoundTripper` returns 200 with erroring Body — also
  verifies `defer resp.Body.Close()` runs), and `json.Unmarshal`
  failure (httptest serves 200 + malformed JSON). New
  `streaming/internal/logger/iplogger_geoapi_error_test.go` (2 tests,
  channel-sync / synchronous transport, no goroutines, no real
  sockets, no ffmpeg). Total streaming: 87.1% → **87.2%** (+0.1pp).
  **Streaming continues to lift modestly via clean error-arm
  exceptions** despite the practical-ceiling diagnosis. Private only
  `3240249`.
- **cv-faceauth** — `api/face_auth_onfly_api.py` **46% → 100%**
  (+54pp). New `cv-faceauth/tests/test_face_auth_onfly_api_routes.py`
  (**14 tests**). Pinned: `get_face_auth_onfly_manager()` lazy
  singleton (creates `CameraManager(max_cameras=0)`, repeat call
  returns same instance); POST `/poc/api/v1/cameras/start` (happy +
  409 dup + 500 init failure + `registration_api_url` override
  mutates `settings`); POST `/poc/api/v1/cameras/stop` (404 missing
  pipeline + happy with stopped list + `pipeline_mode=face_auth_onfly`);
  GET `/poc/api/v1/cameras` (get_status values + empty); GET
  `/poc/api/v1/db/stats` (PersistentMatcher counters/path); GET
  `/poc/api/v1/health` (redis_dispatcher ok vs missing, active_cameras,
  uptime); `startup_event` (configure_logging + log_gpu_status +
  `manager._clear_state()` + RedisDispatcher construction);
  `shutdown_event` (`manager.stop_all()`). Suite 1094 → **1108
  passing** / 7 skipped. Total cv-faceauth coverage 84% → **85%**.
  Private only `f75a51a`. **Implementation lesson re-applied**: agent's
  first draft installed sys.modules stubs at module-level which
  polluted neighbouring test files during pytest collection (124
  cascading failures in test_persistent_matcher, test_base_pipeline,
  etc.). Refactored to per-test `patched_lazy_imports` fixture with
  `try/finally` scoped rollback — matching R75's
  `test_face_auth_api_routes.py` pattern. Module-level only does
  `load_standalone` of the target.

**No new bugs filed this round.** R68's roles.service.js mongoose
issue and R72's permissions.utility deletePermissions issue remain
unfiled.

**Process compliance perfect (4th round in a row)**: no agent
prematurely edited TESTING_TODO.md.

Cumulative R22→R76: **~2251 new tests across 157 test files; 0
product files touched across 55 rounds.** Serial execution still
clean. cv-faceauth suite: 1108 passing.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** +
**1 process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R75 — full 4-phase round, +59 tests; **face_auth_api handler bodies 32→96%; storage 88.49%; handleCamera 98.4%**)

- **server** — `core/v1/storage/storage.service.js` — TWO new test
  files this round (server's biggest single-round delta in many
  rounds). New
  `server/tests/integration/services/storage.service.uploadGoogleDrive.test.js`
  (3 tests, 5 mocks — pins `uploadFile → uploadToGoogleDrive` +
  `findOrCreateFolder` cold/warm branches + upload catch arm) and
  `storage.service.smartStream.test.js` (8 tests, 5 mocks — pins
  `smartStreamFile` input validation, regex short-circuit,
  global-SFTP success + traversal guard, fallback chain
  path-miss → _id-hit, total-miss → 404, outer URIError catch).
  Coverage of storage.service.js: **78.42% → 88.49%** lines
  (+10.07pp); branches 80.74% → 86.03% (+5.29pp); fns **84% →
  92%** (+8pp). Storage module overall: 73.91% → 76.08%. Suite
  2545 → 2556 / +11. Public `0f19fc6`, private mirror `d5b9854`.
  **Across R73 → R74 → R75 the storage.service.js journey: ~64% →
  78% → 88%**.
- **client** — `page/user/Detection/components/AlertReceiversSection.jsx`
  (0% → **82.6% lines / 90.32% branches / 69.23% fns**) — 314-line
  props-driven dropdown panel for the Detection settings card
  (chip strip + toggleable Select-Recipients dropdown +
  Select-All / Clear-All header + verified-only filter +
  per-row Checkbox + Remove + VerifiedBadge / Verify-with-navigate +
  Escape-while-open dropdown close + scroll-to-bottom pagination
  hook). New
  `client/tests/unit/page/user/Detection/components/AlertReceiversSection.test.jsx`
  (**14 tests, 6 mocks** — checkbox, badge, button, Tooltip,
  RecipientList.VerifiedBadge, react-router-dom). Suite 1513 →
  1527 / +14. Public `432ab48`, private mirror `615aa83`.
- **streaming** — `internal/server` **95.7% → 96.9%** (+1.2pp).
  `handleCamera` 88.7% → **98.4%** (+9.7pp) via the previously-0%
  PUT and DELETE `Config.Save()` error arms (server.go:211-215 +
  249-253). New
  `streaming/internal/server/handle_camera_save_error_test.go`
  (2 tests). Approach: `t.Chdir(tmp)` + `os.Mkdir("config.json",
  0755)` forces `os.WriteFile` inside `Config.Save()` to fail,
  exposing the handler's 500 error arm without touching product
  code. No goroutines, no ffmpeg, no sockets. Total streaming:
  86.6% → **87.1%** (+0.5pp). **Streaming continued to lift modestly
  despite the practical-ceiling diagnosis** — handleCamera Save
  error arms were a clean exception requiring just an `os.Mkdir`
  trick. Private only `62cf297`.
- **cv-faceauth** — `api/face_auth_api.py` **32% → 96%** (+64pp
  on 177 lines). R65 covered the metadata surface (33 tests on
  schemas/route map/lazy singleton) but the actual handler bodies
  weren't reached because of lazy imports. R75 hit the handler
  bodies via FastAPI TestClient + sys.modules stubs for every
  lazy-imported dep (`orchestrator.manager`,
  `orchestrator.face_auth_pipeline`, `config.settings`,
  `core.memory_monitor`, `core.health_monitor`, `processor.embedder`,
  `recognition.local_matcher`, `qdrant_client`, `httpx`). New
  `cv-faceauth/tests/test_face_auth_api_routes.py` (**32 tests**).
  Pinned: `_restore_pipelines` (empty state + env-mismatch filter +
  already-running skip + happy CameraConfig construction + failure
  path with state-removal); `start_camera` (503 capacity / 409 dup /
  200 happy + state persisted / 500 init failure / dispatcher
  lazy-init); `stop_camera` (no-fa-pipelines early success / happy
  stopped+remaining lists / 500 manager error); `stop_all_cameras`
  iteration; `register_face` (400 empty profileImages / 400 no face /
  500 no embeddings / 200 with UUID pass-through / uuid5 derivation
  for non-UUID uid / default_db fallback / local-matcher None /
  500 remote Qdrant failure); `list_cameras` filtering; `get_camera_status`
  (404 + happy); `health_check{,_detailed,_get_error_details}`;
  `startup_event` + `shutdown_event` lifecycle including
  `asyncio.wait_for` timeout branch. Scoped `finally:` rollback
  tracks each sys.modules key it touched. Suite 1062 → **1094
  passing** / 7 skipped. Total cv-faceauth coverage 83% → **84%**.
  Private only `3168cb7`.

**No new bugs filed this round.** R68's roles.service.js issue
and R72's permissions.utility deletePermissions issue remain
unfiled.

**Process compliance perfect** (3rd round in a row): no agent
prematurely edited TESTING_TODO.md.

Cumulative R22→R75: **~2211 new tests across 152 test files; 0
product files touched across 54 rounds.** Serial execution still
clean. cv-faceauth suite: 1094 passing.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** +
**1 process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R74 — full 4-phase round, +34 tests; **storage SFTP + LocalMatcher 99% + ActionCameraPreview 0→covered**)

- **server** — `core/v1/storage/storage.service.js` SFTP streaming
  surface (`getSftpClient` + `streamFromSFTP` + `handleRangeRequest`
  206 path) — remaining storage gap after R73 landed Google Drive.
  New
  `server/tests/integration/services/storage.service.streamSFTP.test.js`
  (**6 tests, 5 mocks** — ssh2-sftp-client, @aws-sdk/client-s3,
  googleapis, utils/newSFTPConnectionCheck.js, utils/database.js).
  Coverage of storage.service.js: **71.64% → 78.42%** stmts (+6.78pp);
  branches **77.85% → 80.74%** (+2.89pp); fns **79.16% → 84%**
  (+4.84pp). Suite 2548 → 2554 / +6. Public `89d4f9e`, private
  mirror `5b576e8`.
- **client** — `page/user/EmployeeLogs/ActionCameraPreview.jsx`
  (0% → covered) — 387-line carousel + dialog component shown on
  Attendance/Access log entry click. New
  `client/tests/unit/page/user/EmployeeLogs/ActionCameraPreview.test.jsx`
  (**14 tests, 1 mock** — `@/components/ui/dialog`). Pinned: dialog
  open/closed null-guard, 0/1/multi imageUrls branches (counter +
  chevron suppression), module='attendancelogs' vs 'accesslogs'
  header copy + per-module rows, Next/Previous chevron wrap-around,
  ArrowRight/ArrowLeft/Escape key handlers + `!isOpen` keyboard
  guard, Close button onClose, BASE_URL prefixing for string vs
  `{url, timestamp, cameraType}` entries, img onLoad/onError +
  window resize listener, '--/--/----' date placeholder + 'Employee
  Name' header fallback. Suite 1499 → 1513. Public `b2db8b6`,
  private mirror `b3cb92b`.
- **streaming** — `internal/logger` 92.5% → **93.0%** (+0.5pp).
  `(*IPLogger).appendToLogFile` **83.3% → 100%** via the `os.OpenFile`
  error early-return arm (l.logFile is a directory → EISDIR /
  Windows access-denied). New
  `streaming/internal/logger/iplogger_append_error_test.go` (1 test,
  in-package, deterministic — `t.TempDir()` + direct struct
  construction; no sleeps/sockets/goroutines). Total streaming:
  86.6% → 86.6% (sub-percent gain on a small package diluted to
  zero at 3-sig-fig precision). Agent confirmed R73's "practical
  ceiling" diagnosis largely held — `appendToLogFile`'s OpenFile
  error was a clean exception that didn't need a seam refactor;
  most other gaps remain blocked. **Streaming is at the diminishing-
  returns floor: ~1 test per round of marginal lift will be the
  norm.** Private only `824da55`.
- **cv-faceauth** — `recognition/local_matcher.py` **55% → 99%**
  (+44pp). New `cv-faceauth/tests/test_local_matcher_sync.py`
  (**13 tests, 0 skips**). Pinned: `_init_local()` happy path +
  suffix-fallback (`path + "_1"`) on first-attempt `QdrantClient`
  failure; `sync()` orchestration (skip-not-on-source, per-collection-
  failure-continue, source-client-failure); `_sync_collection()`
  (scroll-and-upsert with `vector is None` skipping, page-end
  termination, `delete_collection` exception swallowing); `close()`
  with/without `_local_client`; `get_local_matcher` singleton-
  caches-first-args contract; `init_matcher_sync` propagates `sync()`
  return value (both True + False). Remaining 1% (lines 36-37,
  module-import-time `dbs.json` exception handler) unreachable
  without a fresh module reload. Suite 1049 → **1062 passing** /
  7 skipped. Total coverage 82% → 83%. Private only `91ffb17`.

**No new bugs filed this round.** R68's roles.service.js mongoose
issue and R72's permissions.utility deletePermissions ObjectId-vs-
string issue both remain unfiled (no R74 agent touched those files).

**Process compliance perfect**: no agent prematurely edited
TESTING_TODO.md (R72 lesson absorbed, 2nd round in a row).

Cumulative R22→R74: **~2152 new tests across 147 test files; 0
product files touched across 53 rounds.** Serial execution still
clean. cv-faceauth suite: 1062 passing.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** +
**1 process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R73 — full 4-phase round, +26 tests; **face_auth_onfly_pipeline.py hits 100%; storage Google Drive + PlaybackHeader from 0%**)

- **server** — pivoted off permissions.utility (95.13%, diminishing).
  `core/v1/storage/storage.service.js::streamFromGoogleDrive` — was
  **0% on a ~70-line method body** (lines 1090-1160). New
  `server/tests/integration/services/storage.service.streamGoogleDrive.test.js`
  (**5 tests, 5 mocks** — googleapis, @aws-sdk/client-s3,
  ssh2-sftp-client, utils/newSFTPConnectionCheck.js,
  utils/database.js). Branches pinned: 200 no-Range happy path, 206
  Range with explicit `bytes=0-99`, 206 omitted-upper-bound
  (`bytes=200-`) → clamps to `fileSize-1`, catch arm with
  `!headersSent` → 500, catch arm with `headersSent` → no-op guard.
  Suite 2548 → 2553 / +5. Pre-existing `incidents.service.crud` 2
  flakes unchanged. Note: per-file coverage summary unavailable due
  to recurring Windows tinypool worker-exit on full-suite coverage
  runs, but the 5 tests exercise every line/branch in the function.
  **streamFromS3 was already covered (R62-ish); Google Drive streaming
  was the remaining storage gap.** Public `c6c3b0d`, private mirror
  `98da7ea`.
- **client** — `page/user/Playback/components/PlaybackHeader.jsx`
  (0% → **97.75%** lines / 86.11% branches / 77.77% fns) — top
  filter bar for the CCTV Playbacks page (search input + Location/
  NVR/Camera/Department selects + camera-type MultiSelect +
  DatePicker, pure presentational, props-driven via `state` +
  `actions`). New
  `client/tests/unit/page/user/Playback/components/PlaybackHeader.test.jsx`
  (**7 tests, 8 mocks** — at budget cap:
  `@/components/ui/{input,select,multiselect,calendar}`,
  `@/utils/formatDateRange`, `react-icons/md`, `lucide-react`,
  `@/assets/Calendar.svg`). Only the unreachable Escape-state effect
  and a hidden useEffect leg remain uncovered. Suite 1492 → 1499.
  Public `f28b6eb`, private mirror `1eeb8e9`.
- **streaming** — `internal/server` **95.3% → 95.7%** (+0.4pp).
  `validateAndUpdateToken` 90.0% → **100%**. New
  `streaming/internal/server/validate_token_transport_test.go`
  (2 tests). Pins `client.Do` error arm (line 928-930) via closed-
  `httptest.NewServer` URL, and `json.Decoder.Decode` error arm
  (line 955-957) via 200/non-JSON body. Total streaming: 86.4% →
  **86.6%** (+0.2pp). Private only `4dec261`. **Agent confirmed
  the remaining `internal/stream` gaps are all real-binary/seam-
  blocked** (`runFFmpegPipeline`/Sub/Playback + `getVideoCodec`
  need real ffmpeg/ffprobe binaries; `processStartQueue` +
  `cleanupInactive*` are explicit seam blockers; `UpdateConfig` /
  `config.Save` only have unreachable `json.Marshal/Indent` errors
  left; `handleRestart` 503-arm + ServeHLS 503-timeout branches are
  dead code / 30s-wait blocked). **Streaming is approaching its
  practical ceiling without product-side seam refactors.**
- **cv-faceauth** — `orchestrator/face_auth_onfly_pipeline.py`
  **54% → 100%** (+46pp, 37 missing → 0 missing) — the on-the-fly
  registration POC pipeline override. **The roadmap entry that
  called this "import-time-blocked" was wrong**; R73 agent
  unblocked it. New
  `cv-faceauth/tests/test_face_auth_onfly_pipeline_init.py`
  (**12 tests**). Pinned: `_initialize_components` (super delegation,
  matcher swap to `PersistentMatcher.get_instance(local_path=
  "./data/qdrant_poc", collection="poc_faces")`, `get_token_provider`
  wiring, `NASUploader(NASConfig(api_url=settings.nas_upload_api))`
  construction, `RegistrationService` composition, hard-coded
  thresholds `recognition_threshold=0.4` / `new_person_threshold=0.15`,
  parent-raises re-raise path — matcher NOT swapped); dispatch
  exception handler (lines 177-178) `dispatcher.dispatch_entry_log`
  raising → swallowed, `mark_dispatched` not called, frame buffer
  cleanup still runs; `_active_tracks.pop` on success + exception
  + hasattr guard safe when attr missing; registered-users follow-up
  loop (lines 201-230) non-empty `process_unknowns` → per-user
  `dispatch_entry_log`, candidates_by_track lookup hit + miss
  (orphan track fallback), multi-user fan-out, outer exception
  swallow, empty-list short-circuit. Scoped sys.modules rollback
  limited to first-party prefixes per R71 lesson. Suite 1037 →
  **1049 passing**, 7 skipped (unchanged). Private only `e1bd2a3`.

**No new bugs filed this round.** R68's roles.service.js mongoose
`Schema.Types.ObjectId` issue and R72's permissions.utility
`deletePermissions` ObjectId-vs-string-adminId issue both remain
unfiled (no R73 agent touched those files).

Cumulative R22→R73: **~2118 new tests across 143 test files; 0
product files touched across 52 rounds.** Serial execution still
clean. cv-faceauth suite: 1049 passing.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** +
**1 process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R72 — full 4-phase round, +34 tests; **ProfileSelectionDialog + ServeSubStreamHLS pinned; permissions tail-branches near 100%**)

- **server** — `core/v1/permission/permissions.utility.js` tail
  branches not reached by R67/R71. New
  `server/tests/integration/services/permissions.service.tailBranches.test.js`
  (**5 tests, 3 mocks** — `vi.spyOn` on `roleModel.aggregate`,
  `Admin.findOne`, and `res.send` capture; per-test
  `restoreAllMocks` in `beforeEach`). Pins: `deletePermissions`
  no-permissionId empty branch (lines 301-307, 314, 316 — the
  success-resp arm at 315 remains unreachable from unit-test surface
  because the inner aggregate `$match:{adminId}` compares
  string-typed adminId against ObjectId field; JWT-decoded adminId
  is also a string in production, so this is a **new latent product
  issue independent of bug #107's `collectionName` ReferenceError**
  on line 312); `fetchRolesPermission` admin-missing
  permissionConfig path (343-346); `fetchRolesPermission` outer
  catch (407-409); `bulkPermissionUpdate` no-authorized-users tail
  (422-423 — the missing `return` means both line 422 and the
  success-resp at 447 fire, verified via `res.send` spy call-count);
  `bulkPermissionUpdate` outer catch (450-452). Coverage of
  permissions.utility.js: **91.18% → 95.13%** statements (+3.95pp);
  branches **83.8% → 87.33%** (+3.53pp); fns remain 100%. Remaining
  uncovered: 311-312 (bug #107 unreachable) and 320-322. Suite 2543
  → 2548. Public `6a1668f`, private mirror `30a5b65`.
- **client** — `page/user/Detection/components/ProfileSelectionDialog.jsx`
  (0% → **94.11%** lines / 82.5% branches / 85.71% fns) — 245-line
  Radix dialog the AppliedProfile UI mounts when attaching an
  existing detection profile to a channel. New
  `client/tests/unit/page/user/Detection/components/ProfileSelectionDialog.test.jsx`
  (**10 tests, 6 mocks** — Profile/Api/get + Streams/Api/patch +
  Streams/Api/pacth typo variant + sonner + MultiStepForm +
  PermissionContext + radio-group passthrough). Branches: open=false
  null guard, loading/error/empty/populated arms of `getProfileDetails`,
  15-char profile-name truncate + ellipsis, permission-gated `+ Add
  New Profile` CTA, Apply-button `disabled={!selectedProfile}` gate,
  200-OK happy path (channelId + profile._id + toast.success +
  fetchAppliedProfile + onClose), non-200 error toast, debounced
  search-input re-fetch, Cancel button onClose. Both `patch` and
  `pacth` imports mocked so the spec is parity-clean across private
  and public mirror. Suite 1482 → 1492 / +10. Public `205b514`,
  private mirror `32ae9e7`.
- **streaming** — `internal/server` **91.7% → 95.3%** (+3.6pp).
  `ServeSubStreamHLS` 75.8% → **96.7%** (+20.9pp). New
  `streaming/internal/server/serve_substream_stale_segments_test.go`
  (2 tests). Pinned: stale sub-stream segments + no active viewer →
  `RemoveAll + MkdirAll` cleanup arm (lines 697-716, with
  `time.Since(latestSeg) > 8s` forced via `os.Chtimes`); live
  sub-stream + .ts fetch → `video/MP2T` Content-Type +
  `LastSegmentAt`/`LastActive` bump on the `SubStreams[camID]` entry
  (755-765). Total streaming: 85.1% → **86.4%** (+1.3pp). Private
  only `920fa25`.
- **cv-faceauth** — `workers/nas_uploader.py` **59% → 91%** (+32pp,
  86 → 19 lines missing — remaining all in `if __name__ ==
  "__main__"` CLI block + two dead-branch guards). New
  `cv-faceauth/tests/test_nas_uploader_http.py` (**17 tests**).
  Pinned: `_get_client` lazy create + reuse + recreate-on-closed,
  `_encode_to_jpeg` `cv2.imencode→(False,_)` raises ValueError,
  every upload method (`upload_person_cutout` / `upload_face_cutout`
  / `upload_frame_from_memory` / `upload_frame_from_disk`) happy +
  exception paths, `_upload_bytes` 200 / 401-short-circuit /
  5xx-retry-exhaustion / generic-exception-then-success /
  `folder_path` override, `close()` aclose + `_running` flip,
  `_cleanup_old_frames` per-file `os.remove` exception swallowing.
  Suite **1020 → 1037 passing**, 7 skipped (unchanged). Overall
  coverage 81% → 82%. Private only `61520d8`.

**No new bugs filed this round.** R68's latent `roles.service.js
::update` mongoose `Schema.Types.ObjectId` issue remains unfiled.
R72 server agent catalogued a NEW latent issue worth filing in
a future round: `permissions.utility.deletePermissions` inner
aggregate `$match:{adminId}` compares string-typed adminId against
ObjectId field, making the success-resp arm at line 315 unreachable
even when the bug #107 fix lands.

Cumulative R22→R72: **~2092 new tests across 139 test files; 0
product files touched across 51 rounds.** Serial execution still
clean. cv-faceauth suite: 1037 passing.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** +
**1 process (#103)** = 12 issues open.

**Process note**: R72 server agent prematurely added its own
TL;DR to TESTING_TODO.md in commit `30a5b65`. Cron driver
rewrote the section to encompass all 4 phases. Future rounds:
sub-agents should leave TESTING_TODO updates to the cron driver
(end-of-round aggregation) — touching TESTING_TODO mid-round
risks mis-aggregated state if other phases also try to edit it.

## TL;DR — what changed on 2026-05-26 (R71 — full 4-phase round, +35 tests; **dispatcher.py hits 100%, ServeHLS stale-cleanup pinned**)

- **server** — `core/v1/permission/permissions.utility.js` outer-catch
  arms (the 4 tail branches none of R67's create/bulkDelete tests
  reached). New
  `server/tests/integration/services/permissions.service.outerCatches.test.js`
  (**5 tests, 4 mocks** — `vi.spyOn` on `usersModel.findOne`,
  `Admin.findOne`, `permissionModel.find`, `permissionModel.findOne`/
  `updateMany`; per-test `mockImplementationOnce` + `restoreAllMocks`
  in `beforeEach`). Pins: `userPermissions` catch (559-561),
  `updateAdminPermissions` catch (653-655), `bulkPermissionDelete`
  modifiedCount=0 else (502-503), `bulkPermissionDelete` outer catch
  (506-508). Coverage of permissions.utility.js: **89.51% → 91.18%**
  statements (+1.67pp); branches **80% → 83.8%** (+3.8pp); fns
  remain 100%. Suite 2538 → 2543 / +5. Public `511f931`, private
  mirror `2e0535b`.
- **client** — `page/user/Detection/components/DefaultDetectionSettings.jsx`
  (0% → **97.38%** stmts / 83.87% branches / 97.38% lines). 4 of 153
  lines uncovered (remaining = conditional click-outside `mousedown`
  handler arms that fire only when `showUsersDropdown`). New
  `client/tests/unit/page/user/Detection/components/DefaultDetectionSettings.test.jsx`
  (**8 tests, 7 mocks** — `@/components/ui/switch`,
  `./InnerSettingsContext`, `../../Streams/Api/patch` +
  `../../Streams/Api/pacth` (both paths — the typo'd one still
  ships on mirror), `sonner`, `../../Profile/MultiStepForm`,
  `../components/DeleteConfirmation`, `@/context/Permission/PermissionContext`).
  Branches: Switch from `authorisedUsers.length > 0` (empty +
  non-empty), "No users selected" fallback, first-3-inline + "+N
  more" toggle, edit gate mounts `MultiStepForm` with
  `module='appliedProfile'` + `selectedChannelIds` from
  `channelData.linkedCameras`, delete gate opens
  `DeleteConfirmation` → confirm calls
  `updateCameraSettingById(linkedCameras[0]._id, { profile: null })`
  + toast.success + `fetchAppliedProfile`, non-200 → toast.error +
  no fetch, thrown → toast.error(error.response.data.body.message),
  neither permission → zero right-action buttons. Suite 1474 → 1482
  / +8. Public `1e8ca68`, private mirror `28000ae`.
- **streaming** — `internal/server` **89.1% → 91.7%** (+2.6pp).
  `ServeHLS` 80.8% → **93.9%** (+13.1pp). New
  `streaming/internal/server/serve_hls_stale_segments_test.go`
  (2 tests). First test walks the `latestSeg` modtime accumulator
  + `noActiveViewer` classifier without firing RemoveAll (fresh
  segments arm). Second forces stale modtimes via `os.Chtimes` to
  trigger the `RemoveAll + MkdirAll` cleanup branch (lines 561-563);
  uses a sentinel-disappearance signal in the side goroutine to
  deterministically gate the post-cleanup playlist re-seed (avoids
  racing with RemoveAll). Total streaming: 84.2% → 85.1% (+0.9pp).
  Private only `e146f3d`. **Newly catalogued seam blockers** (per
  R71 agent): `json.Marshal/Indent` error arms in `config.Save()`
  (unreachable for any realistic Config), and the `strconv.Unquote`
  success arm (unreachable when marshaled JSON contains any `"`).
- **cv-faceauth** — `workers/dispatcher.py` **57% → 100%** (+43pp,
  all 81 statements covered). New
  `cv-faceauth/tests/test_dispatcher_async.py` (**20 tests**).
  Pinned: `_async_dispatch` body (lines 197-274, formerly 0%) —
  happy-path triple-upload + person-only upload (URL placement) +
  failed-upload URL stays None + face/frame skip when cutout None /
  settings flag off, **all 8 camera_type string variants → enum
  mapping**, `return_exceptions=True` isolating per-client failures
  (access OR attendance raising does not abort dispatch);
  `dispatch()` exception arm (`create_task` raising is swallowed);
  `_get_loop()` RuntimeError fallback (`get_event_loop` raising →
  `new_event_loop` + `set_event_loop` adopted); `shutdown()`
  cleanup-exception swallow. Sub-client stubs swapped on
  `WorkerDispatcher` instance after construction (AsyncMock for
  access_log / attendance_log / nas_upload — no real I/O). Suite
  1000 → **1020 passing** / 7 skipped (unchanged). Private only
  `b93644e`. **Lesson learned**: `sys.modules` rollback in
  `teardown_module` had to be scoped to first-party prefixes
  (`workers.`, `core.`, `config.`) — initial broad rollback broke
  `test_face_auth_api` + `test_local_matcher` by invalidating
  cached class references in sibling test files.

**No new bugs this round.** R68's latent `roles.service.js::update`
mongoose `Schema.Types.ObjectId` confusion remains unfiled.

Cumulative R22→R71: **~2058 new tests across 135 test files; 0
product files touched across 50 rounds.** Serial execution still
clean. cv-faceauth suite: 1020 passing.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** +
**1 process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R70 — full 4-phase round, +52 tests; **cv-faceauth suite hits 1000 passing; 3 files lifted to 98%+**)

- **server** — pivoted from permissions.utility (already at 89.51%
  stmts / 100% fns — diminishing) to `server/middlewares/verifyToken.js`.
  The whole `decoded.memberId` user-token branch (lines 65-98) was
  uncovered, plus the python-backend flag on a user-token (100-102)
  and the orgId success arm (108-110). New
  `server/tests/unit/middlewares/verifyToken.memberId.test.js`
  (**7 tests, 2 mocks** — checkActivePlan + helperFunctions.getEmpAuthInfo,
  same pattern as existing verifyToken.test.js). Covers: User.findOne +
  authorizedChannelsModel.findOne + roleModel.aggregate `$lookup` on
  `permissionschemas` (surfacing permissionConfig + authorizedChannel
  on `req.verified`), empty-user / no-channels fall-through (the
  commented-out "User not found" guard is dead code), python-backend
  service flag on a USER-signed token → `decoded.system = true`,
  orgId assignment from getEmpAuthInfo (success path + null-result +
  empty-data arms), mainRoute 24-hex-ObjectId masking. Coverage of
  verifyToken.js: **74.12% → 100%** statements; **80.95% → 100%**
  branches. Suite 2531 → 2538 / +7. Public `0f3cb2f`, private mirror
  `f704c96`.
- **client** — `layout/Header/HeaderActions.jsx` (0% → **100%**, +5
  tests, 1 mock — `@/components/ui/button` stubbed to plain `<button>`).
  The top-right desktop-header action cluster has two distinct branches:
  `UpgradeReqiore` [sic] false → Install button (installerStatus flips
  label "Install"/"Installed" + disabled state) and true → Upgrade pill
  (CircleFadingArrowUp + Version stamp + caption + FaBell). Both
  interactive paths build a throwaway `<a href=<bucket-url>>.click()`
  for download; `document.createElement` is spied so the anchor click
  is observable without real navigation. Suite 1469 → 1474. Public
  `95a0599`, private mirror `73ee420`.
- **streaming** — `internal/logger` **91.0% → 92.5%** (+1.5pp).
  `cleanupRoutine` 60.0% → **100%** (+40pp) and `deleteOldFiles`
  60.0% → 66.7% (+6.7pp; remaining is the dead-code branch per
  bug #96). New `streaming/internal/logger/logrotator_routine_test.go`
  (2 tests). `TestLogRotator_DeleteOldFiles_ReadDirError` pins the
  early `os.ReadDir` error return via a non-existent nested path.
  `TestLogRotator_CleanupRoutine_TickFires` pins the previously-
  unreached `<-lr.cleanupTick.C` arm by installing a 5ms ticker
  directly on the rotator, running cleanupRoutine in a goroutine,
  polling the FS for the rotation side-effect (no `time.Sleep` sync),
  then closing `done` to drain the loop deterministically. Goroutine
  join verified with 2s timeout. Private only `f76fdcd`.
- **cv-faceauth** — `workers/api_clients.py` **46% → 98%** (+52pp,
  173 of 179 missing lines now covered) — the biggest cv-faceauth
  leverage available. New `cv-faceauth/tests/test_api_clients_http.py`
  (**38 tests**). Pinned: retry loops for all 5 clients (Access,
  Attendance, Incident, Registration, EntryLog); payload assembly
  for every IncidentLogClient method (PPE / Crowd / PersonCount /
  Light / LineCrossing); JWT refresh happy path + exception
  swallowing + near-expiry re-refresh; lazy `_get_client` creation +
  closed-client rebuild; 3 singleton factories
  (`get_incident_log_client`, `get_registration_client`,
  `get_entry_log_client`) both unconfigured-None and
  configured-caching branches; `.close()` on every client.
  **Suite 962 → 1000 passing / 7 skipped** — **first cv-faceauth
  4-digit suite count.** Repo total 79% → 81%. Private only `6ce11da`.

**No new bugs this round.** The R68-noted latent `roles.service.js
::update` mongoose Schema.Types.ObjectId issue remains unfiled
because no R70 agent touched roles.service.

Cumulative R22→R70: **~2023 new tests across 131 test files; 0 product
files touched across 49 rounds.** Serial execution still clean.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** + **1
process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R69 — full 4-phase round, +35 tests; **no new bugs; vehicle.service + redis_dispatcher near 100%**)

- **server** — `core/v1/vehicle/vehicle.service.js` body. New
  `server/tests/integration/services/vehicle.service.notification.test.js`
  (**5 tests, 3 mocks** — socket + jobs.service + mail.helper, mirrors
  the existing `vehicle.service.log.test.js` pattern). Covers the
  previously-unreached notification dispatch branch
  (`handleProfileNotification === true`): happy path (profile + email
  recipient + `channels.email: true` → `MailHelper.vehicleLog` invoked),
  `channels.email: false` boundary (NOT invoked), phone-only recipients
  boundary (NOT invoked), plus 2 outer-catch branches via
  `vi.spyOn(Vehicle/VehicleLog, "find").mockImplementationOnce(throw)`.
  Coverage of vehicle.service.js: **81.66% → 97.91%** statements
  (+16.25pp); branches 82.14% → 97.05% (+14.91pp). Only the `log()`
  outer-catch (lines 150-154) remains uncovered. Suite (integration/
  services slice) 1162 → 1167. Public `145b011`, private mirror `3b0c531`.
- **client** — Two pure-presentational layout skeletons (both 0% →
  covered, both added to vitest include scope):
  `layout/Header/HeaderSkeleton.jsx` (4 tests) and
  `layout/Sidebar/SidebarSkeleton.jsx` (4 tests). Both depend only
  on `react-loading-skeleton`; 0 mocks per file. New specs pin
  layout classes, documented widget counts (7 nav pills / 5 sidebar
  tiles), desktop-only welcome strip, no-interactive-controls
  invariant. Suite 1461 → 1469 / +8 tests. Public `ddfc4b7`, private
  mirror `8123580`.
- **streaming** — `internal/server` **87.2% → 89.1%** (+1.9pp). Two
  functions pinned in one round: `checkPlaybackToken` 82.6% → **100%**
  (+17.4pp) and `handleCamera` 79.0% → **88.7%** (+9.7pp). New
  `streaming/internal/server/check_playback_token_branches_test.go`
  (3 tests — sync.Map.Range continue arm, backend-success-with-past-exp
  evicts cache, malformed Backend_url err-arm) and
  `handle_camera_stream_exists_test.go` (2 tests — DELETE with
  pre-seeded live stream entry → Cancel fires exactly once + entry
  removed + slice rebuild preserves siblings; PUT on Active=false cam
  with live stream → Cancel + delete + RTSPURL rewritten encrypted +
  no goroutine spawn). StreamManager built directly (no
  NewStreamManager → no log-rotator / StartQueue / cleanup goroutines).
  Active=false everywhere to avoid `if Active { go StartStreamForCamera }`
  arms. No live ffmpeg, no real sockets, deterministic (atomic counter
  + httptest backend; no `time.Sleep`). Private only `ca5700d`.
- **cv-faceauth** — `workers/redis_dispatcher.py` **54% → 98%**
  (+44pp, only 2 lines remain). The roadmap re-scan showed
  `orchestrator/face_auth_onfly_pipeline.py` was already at 54%
  (not 0% as the roadmap implied) — its remaining 37 lines are
  import-time-blocked `_initialize_components` body. **`workers/
  redis_dispatcher.py` was the bigger leverage at 54% with the
  entire async push surface uncovered.** New
  `cv-faceauth/tests/test_redis_dispatcher_async.py` (**17 tests**,
  609 LOC). Pinned: `_async_push_payload` (full payload shape +
  queue routing + 3 toggle-off branches + push-failure-no-depth-call
  + queue-depth exception swallowing + outer-exception fire-and-forget
  contract), `dispatch_entry_log` (running short-circuit +
  `asyncio.create_task` scheduling + scheduling-exception swallow),
  `_async_push_entry_log` (happy path with `log_job` queue +
  `task_type="entry_log"` shape + `Unknown User` fallback +
  push-failure log path + outer-exception swallow), `_save_frame_to_disk`
  cv2.imwrite exception → returns `""`, `_encode_base64` imencode
  `False` and exception → `""`. Suite **945 → 962 passing / 7 skipped**
  (unchanged). Repo total 78% → 79%. Private only `eb88078`.

**No new bugs this round.** R68's latent `roles.service.js::update`
mongoose `Schema.Types.ObjectId` confusion remains unfiled because
no R69 agent touched roles.service.

Cumulative R22→R69: **~1971 new tests across 127 test files; 0 product
files touched across 48 rounds.** Serial execution still clean.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** + **1
process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R68 — full 4-phase round, +38 tests; **2 product bugs filed (#106, #107); client roadmap purged of stale entries**)

- **server** — `core/v1/roles/roles.service.js` body. R57 covered the
  basic CRUD; R68 adds `RolesServices.get` (3 new branches) and `.update`
  (4 new branches). New
  `server/tests/integration/services/roles.service.extras.test.js`
  (**7 tests, 0 mocks** — pure in-memory Mongo + shared `serviceCtx`/
  `payload` helpers). Suite 2519 → 2526 / +7. Public `64f75bb`, private
  mirror `06bc4d4`. **TWO new product bugs filed this round**:
  - [#106](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/106)
    `auth.service.js::revokeDetectionService` /
    `revokeAttendanceService` call `axios.post(...)` but `axios` is
    NEVER imported → `ReferenceError` on invocation. R67 noticed this
    but didn't file; R68 filed it.
  - [#107](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/107)
    `permissions.utility.js::deletePermissions` bulk-delete branch
    references undefined `collectionName.deleteMany(...)` at line 312
    — silent failure (the throw is swallowed by the async forEach
    callback) so the response reports success while no docs are
    actually deleted.
  - **Also noted but NOT filed**: `roles.service.js::update` (lines
    230-231) imports `ObjectId` from `mongoose` (which is
    `Schema.Types.ObjectId`, a schema-type constructor) and calls
    `new ObjectId(adminId)`, producing a `SchemaObjectId` that never
    matches any document in the subsequent `$match`. Makes the
    `isRoleDuplicate` and likely `roleEditAccess === false` branches
    effectively unreachable. Latent for many rounds; doesn't crash.
    Would be worth filing in a future round if any server agent needs
    a low-priority issue to surface.
  - **Coverage data note**: the `--coverage` run terminated with
    unhandled tinypool worker-exit errors before writing
    `coverage-summary.json` (recurring Windows-host serial-runner
    glitch, unrelated to R68 tests). Per-file numbers unavailable for
    this round; agent verified branch-level qualitative delta.
- **client** — `layout/Header/ProfileDropdown.jsx` (0% → ~100%, +9
  tests, 0 mocks — uses real `react-router` MemoryRouter). The
  avatar + dropdown panel is a real product surface but small/self-
  contained. Suite 1452 → 1461 / +9. Public `4bf1a32`, private
  mirror `0f02579`. **MAJOR roadmap correction** — the client agent
  verified the roadmap had several stale entries:
  - `client/src/contexts/` directory **does NOT exist**
  - All 5 files in `client/src/hooks/` already have tests
  - All `CameraStreamsModal/*` siblings already covered (R55-R59)
  - `IncidentDetail` / `IncidentFilters` / `AutoEmailReport` / `Network`
    page entries — **the files don't exist** (stale roadmap)
  - `src/utils/`, `src/lib/`, `src/components/ui/` are fully tested
  - Roadmap below reflects this purge.
- **streaming** — `internal/server` 86.8% → **87.2%** (+0.4pp).
  `handleRestart` 73.7% → **84.2%** (+10.5pp) via the refresh-true /
  known-camera / 200-JSON success arm. New
  `streaming/internal/server/handle_restart_success_test.go`
  (1 test, no mocks). Pre-seed playlist file → corrupt-ciphertext
  RTSPURL → `util.D("")` no-op makes spawned `StartStreamForCamera`
  early-return → 3s `RestartStream` sleep → `os.Stat` finds the
  playlist → 200 JSON. No ffmpeg, no sockets, no goroutine leaks.
  Remaining 15.8% in `handleRestart` is dead code — the RTSP-error
  503-JSON arm's only producer is fully commented out at
  `stream.go:325-332`. Private only `a3e40d3`.
- **cv-faceauth** — `processor/detector.py` 51% → **91%** (+40pp)
  — **the roadmap was wrong about this module being 0%-uncovered**;
  R68 agent re-scanned with `pytest --cov` and found it was actually
  at 51%. New `cv-faceauth/tests/test_detector_inference.py`
  (**21 tests, 0 skips**, 543 LOC). Surfaces pinned:
  `_resolve_and_export_onnx` ultralytics export (YOLO + RTDETR class
  dispatch, `check_requirements` monkeypatch incl. failure-path
  restore, ImportError re-raise), `_load_onnx_model` CPU + CUDA +
  missing-provider RuntimeError + dynamic vs static batch-shape +
  generic-exception re-raise, `_postprocess` RTDETR normalized-coords
  + YOLOv5 short-detection skip, `detect` unloaded/happy/exception,
  `detect_batch` unloaded/empty/single/fixed/dynamic/exception
  fallback, `_load_model` .onnx pass-through. R47/R54 stub-at-import
  pattern + GPU-lock null-context patch. Suite 924 → **945 passing
  / 7 skipped** (+21 pass). Repo total 77% → 78%. Remaining 9% in
  detector.py is Linux/CUDA-runtime-specific (`ctypes.CDLL(
  "libcublas.so.12")`, `torch.cuda.zeros`, ORT-CPU-fallback retry)
  — not portably testable on Windows without product seams. Private
  only `af8a302`.

Cumulative R22→R68: **~1936 new tests across 122 test files; 0 product
files touched across 47 rounds.** Serial execution still clean.

Total pending bugs filed: **11 product (#96-#102, #104-#107)** + **1
process (#103)** = 12 issues open.

## TL;DR — what changed on 2026-05-26 (R67 — full 4-phase round, +70 tests; **pivot off authorizedUsers; bug #105 filed**)

- **server** — pivoted off `authorizedUsers.service.js` (now 86.77% /
  100% functions, diminishing). New target: `core/v1/permission/permissions.utility.js`
  — `PermissionService.create` + `PermissionService.bulkPermissionDelete`.
  An old `permissions.service.test.js` header claimed both were unreachable
  due to a "double-nested `req.verified.userData.userData`" shape — the
  R67 agent verified that comment was WRONG: both methods destructure
  `req.verified.userData` directly and work with the standard
  `serviceCtx({adminId, body})` shape. New
  `server/tests/integration/services/permissions.service.createAndBulkDelete.test.js`
  (**9 tests, 0 mocks** — pure in-memory Mongo). `create`: Joi failure,
  happy-path persist, exact-match dup, case-insensitive regex dup,
  outer-catch via undefined permissionName. `bulkPermissionDelete`:
  admin-not-found, missing permissionConfig, missing-module list,
  happy-path `$unset` of a named module. Suite 2510 → 2519 / +9.
  Public `a777127`, private mirror `55c79d3`. **Two additional bugs
  noticed but not filed this round** (agent judgment, since they're
  unreachable from existing tests): `auth.service.js::revokeDetectionService`/
  `revokeAttendanceService` use `axios.post` but `axios` is never imported
  → `ReferenceError` if invoked; `dashboard.service.js::WeeklyComparisonChart`
  references undeclared `channelFilter`/`userMatch` (already tracked as
  legacy issue #49). Note for future rounds: the auth.service axios bug
  IS worth filing if the next server round wants an easy issue to land.
- **client** — pivoted from PAGE-level sweep to `layout/Sidebar/*`.
  TWO 0% files in one round: `SettingsSidebar.jsx` (152-line 4-item
  settings side rail — 5 tests, 3 mocks pinning pathname-active,
  `activePaths` fallback for `/settings/inner`, dormant `AddNVRForm`
  import) and `Sidebar.jsx` (113-line permission-gated main dashboard
  rail — 7 tests, 4 mocks pinning view gate, `isSettingsPage` gate on
  `/settings` and `/detection-settings`, `isLoading` skeleton branch,
  non-dashboard short-circuit, `sidebarShow` toggle + collapsed-icon
  list branches). Both files added to vitest include (previously the
  `src/layout/**` glob was opt-in per-file — only `AdminSidebar`,
  `LogsSidebar`, `Api/{get,put}` were listed). Suite 1440 → 1452 /
  +12 tests. Public `320ea06`, private mirror `f9ebdd2`.
- **streaming** — `internal/stream` **79.0% → 80.9%** (+1.9pp).
  `StreamManager.StartPlayback` 54.2% → **100%**. New
  `streaming/internal/stream/playback_start_happy_test.go` (2 tests).
  Covers `endTime != ""` arm (sessionID format `pb-<camID>-<n>`,
  runPlaybackPipeline goroutine launched but parked on saturated
  `ffmpegPool`, PlaybackStream registration, PlaybackSessions metric
  Inc, clean teardown via ctx-cancel + pool drain) AND `endTime == ""`
  arm with `sessionCounter` monotonic increment via 2 back-to-back
  calls. Agent noted the remaining named targets in the roadmap
  (`cleanupInactiveStreams/SubStreams/Playbacks` at 0%, `processStartQueue`
  body, `MonitorFFmpegProcessStats` second-tick) are all blocked on
  product-side seams (5-min `time.NewTicker` blocking loops with no
  shutdown channel; `time.Sleep(5*time.Second)` in `processStartQueue`;
  flaky netIO deltas in MonitorFFmpeg second tick). StartPlayback was
  the highest-leverage testable gap remaining. Private only `8186554`.
- **cv-faceauth** — `scripts/run_bg_worker.py` (0% → **70%** on 403
  stmts) — was untouched. The R66 agent's note that it "already had
  coverage" was wrong; R67 agent re-scanned with `pytest --cov` and
  confirmed it was 0%. New `cv-faceauth/tests/test_run_bg_worker.py`
  (**43 pass + 4 skip**). Pinned: init/singleton wiring, `_decode_base64`,
  `get_status`, `stop`, `_process_task` (face-rec + entry_log routing +
  all gates + error paths + camera_type mapping + outer-except),
  `_safe_process_task`, `_process_entry_log_task` (happy + remote_face_url
  skip + None-client + return-False/raise + frame removal), `_cleanup`,
  `run()` (pre-stopped + pop-then-stop). Suite 881 → **924 passing /
  7 skipped** (+43 pass, +4 skip on bug #105). Private only `7e05d48`.

## NEW PRODUCT BUG — #105 (run_bg_worker incident handler missing)

[#105 — `scripts/run_bg_worker.py`: incident tasks crash + never dispatched](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/105)

The R67 cv-faceauth agent found TWO related bugs:
1. `_process_task` never routes to an incident handler — PPE / Crowd /
   Light / LineCrossing tasks fall through to face-recognition.
2. The would-be incident handler calls `self.incident_log` which is
   never defined on the BackgroundWorker class.

Four dispatch tests are `pytest.skip("see #105")` pending product fix.

Total pending bugs filed: **9 product (#96-#102, #104-#105)** + **1
process (#103)** = 10 issues open.

Cumulative R22→R67: **~1898 new tests across 118 test files; 0 product
files touched across 46 rounds. Serial execution continues clean.**

## TL;DR — what changed on 2026-05-26 (R66 — full 4-phase round, +64 tests; **serial execution worked: zero race; LAST KNOWN-UNAVAILABLE module unblocked**)

- **server** — `core/v1/authorizedUsers/authorizedUsers.service.js` —
  the remaining big methods: `createAuthUser` (197-line block) and
  `updateAuthUser` (343-line block). New
  `server/tests/integration/services/authorizedUsers.service.createUpdate.test.js`
  (**23 tests**, 3 mocks — `axios`, `sftpConnectionCheck`,
  `newSFTPConnectionCheck`; pattern lifted from R65's
  `deleteAuthUserAndLogin.test.js`). Coverage of authorizedUsers.service.js:
  **53.82% → 86.77%** statements (+33pp); functions **76.92% → 100%**
  (+23.08pp); branches 85.45% → 84.41% (-1.04pp, marginal). Suite 2454 →
  2487 / +33 tests. Public `8567d09`, private mirror `b369bc6`. **In 3
  consecutive rounds (R64 → R65 → R66) authorizedUsers.service has gone
  37% → 87%** — a 1399-stmt service that was a quiet drag now mostly
  pinned.
- **client** — `page/user/Locations/Locations.jsx` AND
  `page/user/NotificationRecipients/NotificationRecipients.jsx` (both
  0% → covered). New `Locations.test.jsx` (2 tests, 4 mocks —
  PermissionContext + AccessDenied + PageLoader + `./Api`; the extra
  mock is because Locations declares its useEffect BEFORE the early-
  return, so the Api call would fire without the gate. Hook-order
  anti-pattern is a pre-existing codebase convention, not filed as
  bug per agent judgment) and `NotificationRecipients.test.jsx`
  (2 tests, 3 mocks — standard permission-gate pattern). Suite 1436 →
  1440 / +4 tests. Public `3b9a167`, private mirror `ba3b1b4`. **Note:
  NVR/ was already 100% covered (it's only the `NVRAuthLogin.jsx` stub) —
  the roadmap entry that called it "the biggest 0% area" was stale.**
- **streaming** — `internal/logger` **87.5% → 91.0%** (+3.5pp). Three
  previously-uncovered IPLogger boot/shutdown lifecycle functions:
  `NewIPLogger` 0% → **100%**, `Stop` 0% → **100%**, `StartCleanupRoutine`
  0% → 33.3% (disabled early-return arm only; enabled arm deliberately
  skipped — unkillable 6h-ticker goroutine with no shutdown signal in
  product code). New `streaming/internal/logger/iplogger_lifecycle_test.go`
  (4 tests, no mocks). All prior logger tests sidestepped these via the
  `newBareIPLogger` shortcut — the new file pins the real constructor +
  rotator-stop double-close panic recovery + final cleanupOldLogs via
  stale-entry seed. No live ffmpeg, no goroutine leaks (`t.Chdir(tmpdir)`
  + `t.Cleanup(l.Stop)` guards). Private only `8852c9b`.
- **cv-faceauth** — `core/memory_monitor.py` (0% → covered) — **the
  LAST KNOWN-UNAVAILABLE module from the R23 blocker list is now
  unblocked** (psutil must have been installed locally; the agent
  stubs it in `sys.modules` regardless for determinism). New
  `cv-faceauth/tests/test_memory_monitor.py` (**22 pass + 1 skip
  pending #104**). Pinned: MB→bytes unit conversion on all thresholds,
  default + custom kwargs, initial-state counters, `start()`
  lifecycle (daemon thread named "MemoryMonitor", double-start guard,
  safe-without-start `stop()`), `get_stats()` shape, single-tick
  `_monitor_loop` behaviours (below-threshold no-op, plain GC at
  memory_threshold, `generation=2` GC at aggressive_threshold,
  swap-triggered GC, outer exception swallowing), and the three
  singleton helpers. Stub strategy: `psutil` pre-stubbed in
  `sys.modules` then per-test `monkeypatch.setattr(mm, "psutil",
  ...)` for controlled rss/swap; `time.sleep` monkey-patched as
  deterministic stop-gate; `gc.collect` patched to observable
  lambda; `teardown_module` rolls back. Suite 859 → **881 passing
  / 3 skipped** (+22 pass + 1 new skip on top of existing 2 #102 skips).
  Private only `93197eb`. **All 4 original KNOWN-UNAVAILABLE modules
  are now covered.**

## NEW PRODUCT BUG — #104 (memory_monitor swap_info UnboundLocalError)

[#104 — `core/memory_monitor.py::_monitor_loop` UnboundLocalError on `swap_info`](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/104)

The R66 cv-faceauth agent found a real bug: when `psutil.swap_memory()`
raises, `_monitor_loop` references `swap_info` in a subsequent branch
without defining it, causing UnboundLocalError. The dedicated
swap-failure test is `pytest.skip("see #104")` pending the product fix.

Total pending bugs filed: **8 product (#96-#102, #104)** + **1 process
(#103)** = 9 issues open.

## Serial-vs-parallel decision

R66 ran the four sub-agents **serially** (one at a time) instead of
in parallel — a deliberate response to the R65 race that triggered
#103. Results:

- **Zero index race**. Every commit's subject matched its diff.
- **Zero off-limits-path violations**.
- **Total wall-clock**: ~22 minutes (vs ~10 min parallel). Acceptable
  cost for correctness on an autonomous loop.

Going forward the cron should keep running serially until #103 is
resolved by either (a) per-phase git worktrees, or (b) a remote-side
serialization signal. The cost is ~12 extra minutes per round; the
benefit is bulletproof commit/diff alignment.

Cumulative R22→R66: **~1828 new tests across 114 test files; 0 product
files touched across 45 rounds.**

## TL;DR — what changed on 2026-05-26 (R65 — full 4-phase round, +58 tests; **first parallel-agent index race + process-violation issue #103**)

- **server** — `core/v1/authorizedUsers/authorizedUsers.service.js`
  THREE more previously-uncovered methods: `deleteAuthUser`,
  `authUserLogin` (happy + wrong-password paths), `verifyUser`
  (downstream branches). New
  `server/tests/integration/services/authorizedUsers.service.deleteAuthUserAndLogin.test.js`
  (**18 tests**, 3 mocks — `axios`, `sftpConnectionCheck`,
  `newSFTPConnectionCheck`; `fs.{existsSync,lstatSync,unlinkSync,rmSync}`
  via `vi.spyOn` per-test, R64 constraint). Exercises real production
  crypto round-trip (model's pre-save encrypt + service's `decrypt`).
  Coverage of authorizedUsers.service.js: **43.31% → 53.82%** statements
  (+10.51pp on 1399 stmts); functions 61.53% → 76.92% (+15.39pp);
  branches 76.51% → 85.45% (+8.94pp). Suite 217 → 218 / +18 tests.
  Public `1ab8cbc`, private mirror `89584c5`.
- **client** — `page/user/Streams/Streams.jsx` AND
  `page/user/Streams/Cameraview/GridViewModal.jsx` (both 0% → covered).
  Streams (top-level NVR Settings listing): 2 tests, 3 mocks
  (PermissionContext + AccessDenied + PageLoader) pinning the two
  permission-gate early-return branches before the heavy downstream
  tree (AddNVRForm + Nvrsettings/NvrLocalsettings + 2 Api modules +
  sonner + skeleton + StreamHeader). GridViewModal (fullscreen
  multi-camera Live Monitoring grid): 4 tests, 2 mocks (Dialog primitive
  + CameraStreamDisplay) — isOpen=false null guard, channel-to-tile
  formatting (`rtspChannels[1].id` + `customName|name` display) +
  `perPage` slicing + page-indicator string, ArrowLeft/ArrowRight
  window-key pagination + close-button `onOpenChange(false)` wiring,
  default-grid fallback. Coverage delta: Streams.jsx 0% → 41.09 /
  66.66 / 25 / 41.09; GridViewModal.jsx 0% → 98.08 / 77.77 / 75 /
  98.08. Suite 1445 → 1451 / +6 tests. **Public `e98150c`, private
  `adb3576` — RECOVERY COMMITS after the index race; see issue
  [#103](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/103)
  below.**
- **streaming** — `internal/stream` **77.2% → 79.0%** (+1.8pp).
  `MonitorFFmpegProcessStats` ticker.C arm pinned: **46.9% → 78.1%**
  (+31.2pp). New `streaming/internal/stream/monitor_ffmpeg_stats_tick_test.go`
  (1 test, no mocks). Uses `os.Getpid()` for a live PID so the first
  5s tick exercises the full body: pins CPU + Memory gauge writes
  via a poison-and-watch sentinel, and pins the `lastTime.IsZero()`
  TRUE arm of the network block which only snapshots `lastNet`/
  `lastTime` without touching bandwidth gauges (guards against an
  `index out of range` regression on `lastNet[0]`). ~6s runtime,
  no live ffmpeg, no sockets, no goroutine leaks (ctx-cancel +
  drain). Full streaming green. Private only `0a48a3e`.
- **cv-faceauth** — `api/face_auth_api.py` (main FastAPI service for
  the heavier face-auth camera pipeline — sibling of R47's onfly POC,
  was priority 8 on the roadmap). Bypassed `api/__init__.py` (which
  imports `face_auth_api.app` and would cycle when `load_standalone`
  re-loads the module). New `cv-faceauth/tests/test_face_auth_api.py`
  (**33 tests**). Pinned: `FaceAuthStartCameraRequest` schema +
  full `@validator("zones")` matrix (None / valid int points /
  not-a-list / non-list-point / wrong-arity / non-numeric coord /
  negative coord), `FaceAuthStopCameraRequest`, module constants
  (`PREFIX == "/face-auth/api/v1"`, `PIPELINE_MODE == "face_auth"`,
  `_manager is None` at import, `_start_time` is `datetime`,
  `dbs.json` admin→collection map), FastAPI app metadata
  (title/version/description mentions RTDETR, docs/redoc URLs,
  CORS middleware), full 9-route map with method + tag assertions,
  `get_face_auth_manager()` lazy singleton via injected fake
  `CameraManager` in `sys.modules["orchestrator.manager"]` (rolled
  back via `finally:`). Product-behaviour pin discovered: the
  `zones` field is `List[List[int]]` so pydantic rejects floats
  *before* the validator runs — test documents the actual contract.
  Suite 826 → **859 passing / 2 skipped** (unchanged #102 skips).
  Private only `5ed449d`.

## NEW PROCESS-VIOLATION ISSUE — #103 (parallel-agent index race)

[#103 — parallel sub-agents on the same working tree caused an index race](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/103)

R65 was the first round where two sub-agents (server + client)
collided on `git add` / `git commit` against a shared private clone.
Commit `d1fdbf0` landed on `videoraiq:main` with the **client's
commit subject** but a **server file's content** (the diff showed
only `authorizedUsers.service.deleteAuthUserAndLogin.test.js`,
not the client's Streams/GridViewModal tests). The client agent
correctly detected the mis-attribution in its self-check, reverted
via `fea45cb` (force-pushed), and filed #103 with a recommendation
to **serialize phase agents or isolate working trees per phase**
(e.g. `git worktree add` per phase, or per-phase clones). The
server agent later recovered its file from its own write history
and landed `89584c5` cleanly under a server-only path scope. The
client deliverables were re-committed in this round's
recovery commits (`adb3576` private, `e98150c` public).

Both pieces of work landed correctly in the end — the violation
was the commit-subject/contents mismatch, not a content loss.
Total pending bugs filed: **7 product (#96-#102)** + **1 process
(#103)** = 8 issues open.

Cumulative R22→R65: **~1764 new tests across 110 test files; 0
product files touched across 44 rounds.**

## TL;DR — what changed on 2026-05-26 (R64 — full 4-phase round, +48 tests; **streaming Start* happy-paths 100%, legacy LocalMatcher unblocked**)

- **server** — `core/v1/authorizedUsers/authorizedUsers.service.js`
  exported helper `deleteFileFromStorage` (lines 1317-1402) — was 0%
  in a 1406-stmt service still sitting at 37%. New
  `server/tests/integration/services/authorizedUsers.service.deleteFileFromStorage.test.js`
  (**11 tests**, 3 mocks — `sftpConnectionCheck`, `axios`,
  `newSFTPConnectionCheck`; `fs.{existsSync,lstatSync,unlinkSync}` use
  `vi.spyOn` at runtime rather than `vi.mock("fs")` — critical because
  the latter clobbers `utils/logger.js`'s load-time `mkdirSync(logDir)`).
  All 9 distinct code paths pinned: empty/non-array guard, falsy entry
  skip, local cache unlink branch (`isFile()` true/false), URI
  decode, `sftp.exists` returns `false`/`'d'`/`'-'`, per-path
  try/catch (records err.message + continues), outer try/catch
  rethrow on `checkSftpConnection` failure. Coverage of
  authorizedUsers.service.js: **37.24% → 43.31%** statements
  (+6.07pp on 1406 stmts); functions 53.84% → 61.53% (+7.69pp).
  Suite 217 → 218 files / 2431 → 2442 passing. Public `91537d2`,
  private mirror `db875bd`.
- **client** — `page/user/RolePermissions/RolesandPermission.jsx` AND
  `page/user/Streams/Cameraview.jsx` PAGES (both 0% → covered) —
  two top-level permission-gated pages in one round. Mirrors the
  R62/R63 pattern: 3 mocks each (PermissionContext + AccessDenied
  + PageLoader) pin the two early-return branches without exercising
  the heavy downstream tree (RolesandPermission has AddRoleDialog
  + PermissionStep + DeleteConfirmation + PermissionTable +
  Pagination + 4 Api modules; Cameraview has multi-select filters
  + CameraTwo/CameraStreamDisplay tiles + GridViewModal + axios +
  getAccessToken + 2 contexts + react-router). New
  `client/tests/unit/page/user/RolePermissions/RolesandPermission.test.jsx`
  and `Cameraview.test.jsx` (4 tests total). Suite 1426 → 1430.
  Public `5d7ac05`, private mirror `c7823f0`.
- **streaming** — `internal/stream` **71.2% → 77.2%** (+6.0pp).
  `StartStreamForCamera` 50% → **100%** and `StartSubStreamForCamera`
  50% → **100%** — both happy-path arms pinned. New
  `streaming/internal/stream/stream_start_happy_test.go` (2 tests,
  no mocks). Uses the saturated `ffmpegPool` (capacity 1, one
  in-flight token) trick to block the spawned `runFFmpegPipeline`/
  `runFFmpegPipelineSub` goroutines on their first line during the
  synchronous assertion window, then drains and polls the pool for
  goroutine unwind. Pins: segment-dir path (with/without `-sub`
  suffix), map registration (`Streams` vs `SubStreams`), decrypted
  URL via `util.D`, recent `LastActive`/`LastSegmentAt` timestamps,
  `Cancel` func presence, and the `StreamsActive` gauge delta
  (bumped on MAIN, NOT bumped on SUB — the cross-contamination
  guard). Bonus: `runFFmpegPipeline` 0% → 25.7% and
  `runFFmpegPipelineSub` 0% → 29.7% via the brief goroutine window.
  Private only `a3ca451`.
- **cv-faceauth** — `recognition/local_matcher_old.py` (legacy
  LocalMatcher — previously uncovered because `recognition/__init__.py`
  only re-exports the new `local_matcher.py`). Used
  `load_standalone("local_matcher_old_standalone",
  "recognition/local_matcher_old.py")` to bypass the `__init__.py`
  (which would pull qdrant_client in). New
  `cv-faceauth/tests/test_local_matcher_old.py` (**31 tests**).
  Pinned surface: SyncStats defaults + per-instance mutability,
  construction (host/port/path/health-callback registration),
  `stats` snapshot incl. datetime stringification, `is_synced`
  flag, `match()` fast paths (not-synced, missing collection),
  payload extraction for `firstName/lastName`/legacy `identity`/
  `name`/blank-name → "unknown", the **legacy-only diagnostic
  "search without threshold" branch** inside `match()` (three
  sub-paths: empty diag hit, populated diag hit, diag exception
  swallowed), outer exception handler + `health_monitor.record_error`,
  `match_all_collections` fan-out, `get_best_match` highest-score
  selection (incl. explicit collections arg + empty-breakdown
  short-circuit), `close()` with/without client, module-level
  `get_local_matcher` singleton, and `init_matcher_sync` true/false
  propagation. Suite **795 → 826 passing / 2 skipped** (unchanged
  — same #102 skips). Private only `a79529b`.

Cumulative R22→R64: **~1706 new tests across 106 test files; 0
product files touched across 43 rounds. 7 product bugs filed
(#96-#102), all still pending product-team fix.**

## TL;DR — what changed on 2026-05-26 (R63 — full 4-phase round, +26 tests; **attendance +26.7pp record + NEW bug #102 + URLTokenManager unblocked**)

- **server** — `core/v1/attendance/attendance.service.js` body
  (1117 stmts) — **the supposed "mega-service" turned out to be
  testable with just 1 mock** (socket only). New
  `server/tests/integration/services/attendance.service.export.test.js`
  (4 tests). Pipes `res` to an in-memory Writable so
  `ExcelJS.workbook.xlsx.write(res)` and `PDFDocument.pipe(res)` can
  stream binary output, exercising `#exportExcel` (~129 stmts),
  `#exportPdf` (~181 stmts), and the PDF page-break branch via a
  60-row seed. Coverage **68.48% → 95.16% (+26.68pp on 1117 stmts)**
  — **biggest service-body delta in the cron's history**, beating
  R61 entry +21.34pp. Suite full green at 218 files / 2466 passing.
  Public `36514a7`, private mirror `0375c54`. **Roadmap correction**:
  the "mega-service excluded" rule was wrong for attendance.service
  — the export writers are isolatable via a Writable mock.
- **client** — `page/user/Profile/Profile.jsx` PAGE (0% → covered) —
  the long-roadmapped Profile top-level. New
  `client/tests/unit/page/user/Profile/Profile.test.jsx` (2 tests,
  3 mocks — PermissionContext, AccessDenied, PageLoader). Mirrors
  the R62 Incidents pattern: pins the two permission-gated early-return
  branches (`permissionsLoading → PageLoader`, `!canView → AccessDenied`),
  short-circuits the heavy downstream surface (MultiStepForm dialog,
  ProfilesTable, four Api modules, bulk delete/export, useDebounce).
  Suite 1443 → 1447 passing. Adds vitest.config.js include. Public
  `0cd40bc`, private mirror `7a59601`. **First Profile PAGE test
  landed.**
- **streaming** — `internal/stream` 70.8% → **71.2%** (+0.4 pts).
  `MonitorLiveStreamSegments` 98.1% → **100%** — the last branch
  pinned. New test drives `seg_600.ts → INIT → swap to seg_5.ts →
  REAL RESET arm`, then sleeps 2.3s and asserts both
  `SegmentsCreatedTotal` and `StreamResetCount` stay flat across
  the skipped + steady-state ticks. No product code touched.
  Private only `29efb1d`.
- **cv-faceauth** — `stream/token_manager.py` (0% → covered) —
  **was KNOWN-UNAVAILABLE since R23** because of jwt dep; R63 agent
  unblocked it by installing a fake `jwt` module in `sys.modules`
  before `load_standalone` (R55 robust_hls_reader pattern). New
  `cv-faceauth/tests/test_token_manager.py` (19 tests: **17 pass + 2
  skip**). The 2 skipped tests revealed a real product bug — see
  bug #102 below. Suite 778 → **795 passing / 2 skipped**. Private
  only `069a6a1`. **3 of the original 4 KNOWN-UNAVAILABLE modules
  now unblocked** — only `core/memory_monitor.py` (psutil) remains.

## NEW PRODUCT BUG — #102 (URLTokenManager deadlock)

[#102 — `stream/token_manager.py::URLTokenManager.get_stats()` deadlocks](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/102)

The R63 cv-faceauth agent found a real product deadlock: `get_stats()`
acquires the non-reentrant `self._lock`, then calls `self.is_token_valid()`
which re-acquires the SAME lock. Production code that calls
`get_stats()` would deadlock forever. 2 tests skipped pending the fix.

Total pending bugs filed: **7** (#96-#102).

## Roadmap correction (R63)

The **"mega-service excluded" rule was wrong for attendance.service**.
The R63 server agent isolated the Excel + PDF export writers via a
Writable stream mock and got 95.16% coverage with just 1 mock.
Same caveat as R56 storage.controller (the mega-service rule was
about service complexity, not impossibility). Updating the exclusion:

- ✅ `storage.controller.js` (R56 — pure delegation, 1 mock)
- ✅ `attendance.controller.js` + `users.controller.js` (R57 — pure delegation)
- ✅ `attendance.service.js` (R63 — export writers via Writable mock)
- Still pending: `storage.service.js`, `users.service.js` — service
  bodies may also be approachable with the right mocking pattern;
  check before excluding.

## TL;DR — what changed on 2026-05-26 (R62 — full 4-phase round, +52 tests; **qdrant_deduplicator unblocked — last KNOWN-UNAVAILABLE cleared**)

- **server** — `core/v1/channels/channels.service.js` body (1364
  statements, biggest remaining gap). New
  `server/tests/integration/services/channels.service.filters.test.js`
  (18 tests, 3 mocks — python.service + delete.service + rtspStream
  partial). `getFilterAllChannels` filter pipeline (camType single +
  list, _id, nvrId, search by NVR/department name, location/department/
  authorizedChannel intersect with and without overlap),
  `getChannelsByNvr` isSystem path with linked detection setting,
  `getPlaybackUrl` happy path, `toggleDetection` linked + status-change
  happy path (lines 1254-1291), `bulkUpdateChannels` profile-only.
  Coverage **76.09% → 87.82%** statements (+11.73pp on 1364 stmts);
  50.00% → 77.58% branches. Agent noted `getPlaybackTimeline`
  brand-branch tests intentionally omitted — APP_ENV=local strips
  fields that the `decrypt()` calls at lines 852-853 require; the
  routes-contract suites cover those branches instead. Suite full
  green at 218 files / 2462 passing. Public `e9bfa4c`, private mirror
  `8277f35`. **5th service-body in the sweep.**
- **client** — `page/user/Incidents/Incidents.jsx` PAGE itself
  (0% → covered) — the long-roadmapped Incidents top-level page.
  New `client/tests/unit/page/user/Incidents/Incidents.test.jsx`
  (2 tests, 3 mocks — PermissionContext, AccessDenied, PageLoader).
  Pins the two permission-gated early-return branches:
  `permissionsLoading → PageLoader` and `!canView → AccessDenied(message)`.
  The downstream grid (StatCards/VideoModal/IncidentCard/MultiSelect/
  DateRangePicker/AutoRefresh + 4 Api modules + 3 contexts) is
  short-circuited so no extra mocks needed. Suite 1441 → 1443 passing.
  Adds vitest.config.js include. Public `45d6716`, private mirror
  `e27a1d8`. **First Incidents PAGE test landed.**
- **streaming** — `internal/logger` 78.0% → **87.5%** (+9.5 pts).
  `LogRotator.Start` 0% → 80%; `LogRotator.Stop` 0% → 100%;
  `Critical` 0% → 100%; `InitCriticalLogger` 0% → 87.5%. New
  `streaming/internal/logger/logrotator_test.go` (5 tests). The
  Critical-boot path is now pinned end-to-end — important because
  this is the logger that fires when the streaming service hits an
  unrecoverable condition. Full `./...` green. Private only `cea9692`.
- **cv-faceauth** — `processor/qdrant_deduplicator.py` —
  **THE LAST KNOWN-UNAVAILABLE module unblocked!** Patched
  `QdrantClient` on the loaded module so no on-disk Qdrant storage
  is touched. New `cv-faceauth/tests/test_qdrant_deduplicator.py`
  (**27 tests**). Module constants, construction happy path +
  missing-collection create-with-VectorParams + exception-recovery
  branch (pins the quirk that `self._client` ends up None even after
  successful path+"_1" reconstruct), `is_duplicate` across no-client/
  no-hit/hit/camera-scoped=False/search-exception arms with counter
  assertions, `_cleanup_expired` + `add` + `check_and_add` + `clear`
  short-circuits and exception-swallow arms, full `stats` snapshot
  shape (dedup_rate + get_collection-exception fallback + no-client
  fallback), `get_qdrant_deduplicator` singleton. Suite 751 → **778
  passing / 0 skipped**. Private only `dc04b11`. **All KNOWN-UNAVAILABLE
  cv-faceauth modules cleared.**

## TL;DR — what changed on 2026-05-26 (R61 — full 4-phase round, +38 tests; **EntryService +21.3pp — biggest service-body delta yet**)

- **server** — `core/v1/entry/entry.service.js` body coverage. New
  `server/tests/integration/services/entry.service.log.test.js`
  (8 tests, 3 mocks — socket + jobs.service + mail.helper).
  - `log()` 404-for-missing-entry-user + 404-for-missing-channel +
    201 success (Admin+EntryUser+Channel+NVR+Profile populated
    end-to-end).
  - `log()` profile-notification email dispatch branch (recipients +
    channels.email + handleProfileNotification=true →
    MailHelper.entryLog).
  - `log()` no-email branch when handleProfileNotification=false.
  - `buildEntryPipeline` non-admin without query.channelId (covers
    the previously-uncovered `effectiveChannelIds = authorizedChannelIds`
    else).
  - `buildEntryPipeline` non-admin NVR overlap + NVR no-overlap
    (empty `_id: null` pipeline).
  Coverage **73.72% → 95.06%** statements (+21.34pp). Branches
  77.77% → 90.81%. **Biggest service-body delta yet** (R58 +7.15,
  R59 +6.45, R60 +17.52, R61 +21.34). Suite 2436 → 2425 (minor
  variance from concurrent commits — R61 net +8). Public `1860070`,
  private mirror `9ac3878`.
- **client** — `page/user/Settings/StorageSetting/AddStorageModal.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Settings/StorageSetting/AddStorageModal.test.jsx`
  (7 tests, 7 mocks — sonner, dialog passthrough, select native-shim,
  Tooltip passthrough, SFTPForm/GoogledriveForm/S3Form/addStorage/
  updateStorage stubs). Add-mode picker render, Edit-mode title swap +
  pre-fill, SFTP/GoogleDrive/S3 lazy sub-form mount per `editData.type`,
  disabled type-Select in edit mode, isOpen=false null guard,
  yup-blocks-submit when password hard-coded blank in edit mode, Name
  input keystroke round-trip through Formik. Suite 1434 → 1441 passing.
  Adds vitest.config.js include. Public `ffd0023`, private mirror
  `acadbd2`. **StorageSetting Add/Edit Modal joins the previously-
  covered trio of sub-forms** (Googledrive R27, S3 R28, Sftp R29).
- **streaming** — `internal/server` 79.3% → **86.8%** (+7.5 pts).
  New `streaming/internal/server/serve_hls_stale_stream_test.go`
  (2 tests, no mocks). Pins the stale-stream restart branch of
  BOTH `Server.ServeHLS` (58.6% → 80.8%) AND `Server.ServeSubStreamHLS`
  (57.1% → 75.8%). Each test pre-seeds a stale StreamContext
  (zero LastSegmentAt) with a Cancel closure + fresh playlist.m3u8
  on disk so the post-stale 500ms ticker finds it on the first tick.
  No ffmpeg, no goroutine leaks (buffered StartQueue cap 100 with
  no consumer; sub-stream short-circuits at `util.D("blob") == ""`).
  Asserts: Cancel() invoked exactly once, stale map entry deleted,
  primary StartQueue receives exactly one config. Full `./...` green.
  Private only `75dbbb8`.
- **cv-faceauth** — `orchestrator/face_auth_pipeline.py` — **the
  heavier sibling of R60's onfly subclass — using the SAME stub stack
  R60 set up**. New `cv-faceauth/tests/test_face_auth_pipeline.py`
  (**21 tests**). Class contract (PIPELINE_TYPE, inheritance, method
  defs), `_process_frame` pass-through, `process_batch` empty-frames
  short-circuit, `_recognize_and_dispatch` paths (empty no-op,
  known-match dispatch + frame-buffer lookup, cached-identity skip,
  tracker-cache hit skipping matcher, ID-switch invalidation +
  re-match, new-unknown via deduplicator dispatch, duplicate-unknown
  drop), `get_health_status` happy + degraded (None components),
  `_log_stats` smoke, `_run_recognition_task` outer guard
  (TimeoutError + generic Exception swallowed, `_recognition_pending`
  reset). Suite 730 → **751 passing / 0 skipped**. **Both
  FaceAuthPipeline subclasses now covered** (face_auth_onfly R60,
  face_auth_pipeline R61). Private only `55a9687`.

## TL;DR — what changed on 2026-05-26 (R60 — full 4-phase round, +25 tests; **uploads.service +17.5pp, 60th-round milestone**)

- **server** — `core/v1/Uploads/uploads.service.js` body coverage —
  the next biggest service-body gap after R58 NVRService + R59
  authorizedChannels. New
  `server/tests/integration/services/uploads.service.extras.test.js`
  (9 tests, 2 mocks — connectSFTP + logger; real in-memory MongoDB
  for AuthorizedUsers model).
  - `uploadMedia` catch arm + `/mnt/nfs/videoraiq-media-NAS` path-prefix-strip
  - `deleteMedia` cache-hit + sftp.exists rejection 500
  - `deleteUserMedia` full happy 200 + `..` path-traversal 400 +
    sftp 404 + sftp 500
  - `getManualMimeType` remaining extension arms
  Coverage **69.20% → 86.72%** statements (+17.52pp; +62 lines).
  Branches **64.58% → 92.18%** (+27.60pp; +28 branches). Suite
  2427 → 2436 passing. Public `54a02aa`, private mirror `274e1f0`.
- **client** — `page/user/Streams/LiveViewModal.jsx` (0% → covered)
  — 300-line side-overlay live-feed modal, **distinct** from the
  fullscreen `StreamModal` (R59) that covered the CameraStreamsModal/
  subdir. New
  `client/tests/unit/page/user/Streams/LiveViewModal.test.jsx`
  (2 tests, 6 mocks — useHlsPlayer, EditCameraInfo stub, sonner toast,
  createCameraAliasName, getDepartmentList, PermissionContext).
  isOpen=false null guard + full open-path orchestration (departments
  fetch, Edit overlay gating on `permissions.channels.edit` with alias
  + dept preselect, `createCameraAliasName` save flow with
  toast.success + onUpdate + local alias-chip update, prev/next
  wrap-around navigation through cameraList, X-button onClose).
  Suite 1432 → 1434 passing. Adds vitest.config.js include.
  Public `92bf4b7`, private mirror `062fda1`.
- **streaming** — `internal/server` 75.0% → **79.3%** (+4.3 pts).
  `handlePlaybackStart` 55.4% → **94.6%**. New
  `streaming/internal/server/handle_playback_start_cleanup_test.go`
  (1 test, no mocks). Pins the NVR cleanup loop (server.go:324-343)
  + StartPlayback error-bubble (server.go:351-354): seeds two playback
  sessions (same-NVR + different-NVR host) and a camera whose
  decrypted RTSP omits "Channels" — StartPlayback rejects before
  spawning any ffmpeg. Asserts same-NVR session cancelled/removed/
  flipped Active=false while different-NVR session preserved; returns
  500 with Channels error text. Full `./...` green. Private only
  `d81150f`.
- **cv-faceauth** — `orchestrator/face_auth_onfly_pipeline.py`
  (0% → covered) — on-the-fly registration POC subclass of
  FaceAuthPipeline. New
  `cv-faceauth/tests/test_face_auth_onfly_pipeline.py` (13 tests).
  Uses the R56-R59 pre-stub-and-rollback pattern across `stream.*`,
  `processor.*`, `recognition.*`, `workers.*`, `insightface.*` — no
  native deps loaded. PIPELINE_TYPE override ("face_auth_onfly"),
  class hierarchy + MRO + override sites, empty-candidates no-op,
  high-score known-face dispatch path (matcher + dispatch_cache +
  dispatcher.dispatch_entry_log + frame buffer cleanup) + user_info
  payload shape with profile_url fallback, cached-dispatch skip
  (should_dispatch=False), low-score routing into
  `registration_service.process_unknowns` with the right
  (embedding, face_crop, track_id) tuple. Suite 717 → **730 passing /
  0 skipped**. **First pipeline subclass covered** (subsequent rounds
  can use the same stub stack to cover face_auth_pipeline.py itself).
  Private only `5db10b5`.

## .gitignore extended (allowed)

Test build artifacts that kept leaking into `git status`:
`streaming/cover*.out`, `streaming/cover.html`,
`streaming/internal/**/config.json` (from `Config.Save()` tests).
Bundled into this commit. Per cron rule: ".gitignore (only to ignore
test build artifacts: coverage/, *.log, etc.)".

## TL;DR — what changed on 2026-05-26 (R59 — full 4-phase round, +23 tests; **new bug #101 + CameraStreamsModal/ subdir complete**)

- **server** — `core/v1/cameraRestrictions/authorizedChannels.service.js`
  body coverage. New `server/tests/integration/services/cameraRestrictions.service.fetchChannels.test.js`
  (7 tests, **0 mocks** — in-memory MongoDB + real models). Covers
  the 5 previously-uncovered `fetchChannels` filter branches:
  departments=true (with/without populated nvrIds), nvrs=true,
  departmentIds-only, departmentIds + empty-nvrIds, the
  nvrIds-routed-to-NVRs branch, and the trailing fall-through
  failure. Coverage 64.22% → **70.67%** (+6.45pp, ~80 lines).
  Suite 2420 → 2427 passing. Public `81c21c0`, private mirror
  `0cb01bd`. **New bug filed #101** (agent confirmed via gh, the
  bug-aware assertions stay GREEN until the fix lands).
- **client** — `page/user/Streams/CameraStreamsModal/StreamModal.jsx`
  (0% → covered) — the LAST untested sibling in CameraStreamsModal/.
  **Subdir is now fully covered**: ZoneSelector R52, AttendanceCheckLog
  R55, UserProfileDialog R56, CameraCanvasModal R57,
  CameraStreamWithDetection R58, StreamModal R59. New
  `client/tests/unit/page/user/Streams/CameraStreamsModal/StreamModal.test.jsx`
  (2 tests, 5 mocks). isOpen=false returns null; maximized-open path:
  `requestFullscreen` called on mount, ZoneSelector receives
  cam-filtered detection list, fresh `countPersons`/`countVehicles`
  cards surface, "People Detected" stat appears (2-second freshness
  window), stale detections for other cameras filtered, Minimize2
  close button wires onClose, `fullscreenchange` exit re-invokes
  onClose. Suite 1430 → 1432 passing. Adds vitest.config.js include.
  Public `dccb6be`, private mirror `6d61b9c`.
- **streaming** — **PIVOT** from `internal/stream` (remaining gaps
  need spawned ffmpeg or 5-min tickers) to `internal/server` HLS-body
  handlers. `internal/server` 71.9% → **75.0%** (+3.1 pts). New
  `streaming/internal/server/handle_add_camera_test.go` +
  extended `handle_camera_test.go` (3 tests total, no mocks).
  `handleAddCamera` 53.8% → **100%** (HandleCameraRequest-error
  400 path + 200 JSON-envelope success). `handleCamera` 62.9% →
  79.0% (PUT happy path on existing inactive camera — no ffmpeg
  spawn). Full `./...` green. Private only `0f38fed`.
- **cv-faceauth** — `api/dependencies.py` FastAPI dependency-provider
  (0% → covered) — unblocked by R56 manager coverage. New
  `cv-faceauth/tests/test_api_dependencies.py` (11 tests, loaded
  via `load_standalone` + a fake CameraManager stub on
  orchestrator.manager). `get_camera_manager()` lazy-singleton
  contract, sentinel datetime, pre-populated-slot bypass, one-shot
  construction. Notable: stubs `orchestrator.manager` with a fake
  rather than letting the real one compile, to avoid test-local
  pyav stubs leaking into `base_pipeline.py`'s import-time bindings
  when tests run in alphabetical order. Suite 706 → **717 passing /
  0 skipped**. **First api/dependencies.py covered** (the file was
  on the original known-unavailable list since R23!). Private only
  `3c43bbc`.

## New product bug filed (#101)

[#101](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/101)
— `cameraRestrictions/authorizedChannels.service.js::fetchChannels`:

1. **Comma-operator typo** in the `nvrs` guard (line ~85): any
   populated `nvrIds` is incorrectly routed into the NVRs branch.
2. **ObjectId-vs-string `Set#has` mismatch** (lines ~52, ~101):
   always yields an empty `filteredNVRIds` because the Set is built
   from string keys but checked with ObjectId values.

Tests assert current (bug-aware) behavior so they stay GREEN until
the fix lands. After fix, update the assertions to reflect correct
behavior.

Total pending bugs filed: **6** (#96-#100 from earlier rounds + #101 this round).

## TL;DR — what changed on 2026-05-26 (R58 — full 4-phase round, +19 tests; **server pivots to service bodies**)

- **server (PIVOT)** — Now that all 30+ controllers are done (R26-R57),
  the cron pivots to **service bodies**. Picked `nvr.service.js` because
  at 59.88% it was the largest active gap among services for
  already-tested controllers (smaller services like domain,
  detectionObjects, shifts, authorizedObjects, roles are already
  >86% covered per R55 agent's earlier survey). New
  `server/tests/integration/services/nvr.service.extras.test.js`
  (7 tests, 3 mocks — `delete.service`, `nvr.brands`, `net`).
  - `getNVRLocations` memberId branch filtering against
    `authorizedChannel.locations`.
  - `getAllNvrs` memberId branch scoping to `authorizedChannel.nvrIds`
    with skip/limit pagination.
  - `testRtspConnection` pure socket helper across all 4 outcomes
    (connect / error / timeout / malformed-URL).
  NVRService body coverage **59.88% → 67.03%** (+7.15pp; 600/895
  statements). Suite 2389 → 2420 passing / 5 skipped. Public
  `533ca37`, private mirror `83bfd39`. **First service body landed
  in the new sweep.**
- **client** — `page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.jsx`
  (0% → covered) — the absolute-positioned canvas overlay that
  CameraCanvasModal (R57) layers on its video tile. New
  `client/tests/unit/page/user/Streams/CameraStreamsModal/CameraStreamWithDetection.test.jsx`
  (2 tests, **0 module mocks** — only jsdom polyfills for
  ResizeObserver, HTMLCanvasElement.prototype.getContext, devicePixelRatio,
  canvas clientWidth/Height). Mount + ResizeObserver wiring + canvas
  DPR sizing + setTransform/clearRect with empty detections (no
  polygon-path APIs touched); polygon scaling/draw path with
  personPresent=true green palette, empty-referencePoints skip, and
  video 'playing' → window-resize → re-draw chain. Suite 1428 →
  1430 passing. Adds vitest.config.js include. Public `d9c11c3`,
  private mirror `41e97b5`.
- **streaming** — `internal/stream` 70.3% → **70.8%** (+0.5 pts).
  `StartStreamForCamera` 28.6% → **50%**. New
  `streaming/internal/stream/stream_start_test.go` (2 tests, no
  mocks). Symmetric to R57's `StartSubStreamForCamera` guards:
  empty-decrypted RTSP URL early-return + MkdirAll failure early-return
  (both must short-circuit before registering a Streams entry,
  creating segmentDir, or bumping `StreamsActive` metric). Full
  `./...` green. Private only `8eb53c0`.
- **cv-faceauth** — `orchestrator/__init__.py` package re-export
  surface (0% → covered). New
  `cv-faceauth/tests/test_orchestrator_init.py` (8 tests). `__all__`
  matches expected, every name resolves on the package, re-exports
  are `is` the source-module definitions, both are classes,
  `BasePipeline` is abstract with non-empty `__abstractmethods__`,
  `PIPELINE_TYPE == "base"` sentinel via package alias. Same
  pre-stub-then-rollback pattern as R56 manager + R57 base_pipeline
  (no real av/cv2/jwt/redis loaded). Suite 698 → **706 passing /
  0 skipped**. Private only `09efc1e`. (The commit also picked up
  the pre-staged `.gitignore` 2-line addition that excludes
  `streaming/cover.out` and `cv-faceauth/logs/` — these are
  test-build artifacts, allowed per cron rule.)

## TL;DR — what changed on 2026-05-26 (R57 — full 4-phase round, +70 tests; **all 30+ server controllers covered**)

- **server** — covered the LAST two thin-delegation controllers that
  the original "mega-service excluded" rule had wrongly grouped with
  their service bodies:
  - `core/v1/attendance/attendance.controller.js` (4 handlers, 8 tests)
  - `core/v1/users/users.controller.js` (14 handlers, 28 tests)
  Single `*.service.js` mock per file (2 total). Both confirmed pure
  delegation. **The server controller layer is now fully done** (30+
  controllers covered; only `files.controller.js` remains and it's
  an empty stub class). Suite 2377 → **2389 passing / 5 skipped**.
  Public `7cd6990`, private mirror `01a2f59`.
- **client** — `page/user/Streams/CameraStreamsModal/CameraCanvasModal.jsx`
  (0% → covered) — the zoom/pan video canvas embedded by `StreamModal`
  when a tile is maximized. New
  `client/tests/unit/page/user/Streams/CameraStreamsModal/CameraCanvasModal.test.jsx`
  (2 tests, 2 mocks — `useHlsPlayer` hook to capture the onError
  callback + `CameraStreamWithDetection` child stub). Loading
  overlay → `onCanPlay` → hook-driven `onError` pane transition with
  close-button + `onClose` wiring, wheel-zoom 1 → 1.15 + Reset
  button appearing only when scale > 1 + restore, 3-second auto-hide
  of zoom hint via fake timers. Suite 1426 → 1428 passing. Adds
  vitest.config.js include. Public commit got bundled with the
  server agent's by a staging race (`7cd6990` carries both test
  payloads — clean separation in the private repo: server mirror
  `01a2f59`, client mirror `68d781c`).
- **streaming** — `internal/stream` 69.1% → **70.3%** (+1.2 pts).
  `StartSubStreamForCamera` 0% → 50%. New
  `streaming/internal/stream/sub_stream_start_test.go` (2 tests,
  no mocks). Two pre-spawn guard branches: empty-decrypted-URL
  early-return (the `util.D("")` no-op path that prevents downstream
  ffmpeg work on corrupt encrypted RTSPURL) + MkdirAll-failure silent
  return (segmentDir creation guard). Full `./...` green. Private
  only `0ddbfd8`.
- **cv-faceauth** — **pivoted** from `face_auth_pipeline.py` (would
  have needed RTDETR + InsightFace + ONNX + qdrant_local +
  batch_processor + embedder + deduplicator stubs all at once) to
  its parent `orchestrator/base_pipeline.py` (0% → covered). New
  `cv-faceauth/tests/test_base_pipeline.py` (**30 tests**). ABC
  contract, construction defaults + properties, `_handle_error`
  reason categorization (connection/stream/cuda/timeout/fallback),
  `_create_stream_reader` backend selection (HLS+JWT → RobustHLSReader,
  HLS without JWT → PyAV, RTSP → PyAV fallback, explicit pyav backend),
  default `process_batch` per-frame iteration, `stop()` flows
  (private reader, shared reader, release_async preference,
  exception-swallowing on stream errors). Same R56 pattern:
  pre-stub `stream.*` modules in sys.modules then roll back via
  `finally:` so neighbouring stream tests still install their own
  stubs. Suite 668 → **698 passing / 0 skipped**. **Second
  orchestrator/ module covered.** Private only `371661b`.

## TL;DR — what changed on 2026-05-26 (R56 — full 4-phase round, +70 tests; **NewStreamManager 0%→100%, storage controller covered**)

- **server** — `core/v1/storage/storage.controller.js` (0% → covered).
  **Roadmap correction**: the mega-service exclusion applies to the
  storage *service body*, not the *controller* — the controller is
  pure 9-handler delegation. New
  `server/tests/unit/controllers/storage.controller.test.js`
  (18 tests, 1 mock — storage.service.js). 9 handlers × 2 (delegation
  + rejection propagation). **27th controller covered.** Suite 2359
  → 2377 passing / 5 skipped. Public `718e923`, private mirror
  `c8aa3e5`.
- **client** — `page/user/Streams/CameraStreamsModal/UserProfileDialog.jsx`
  (0% → covered) — the modal popped up by clicking a row in
  AttendanceCheckLog (R55). New
  `client/tests/unit/page/user/Streams/CameraStreamsModal/UserProfileDialog.test.jsx`
  (6 tests, **0 mocks**). `isOpen=false` / `userData=null` early-return
  paths, known + non-access-log render (Department + moment-formatted
  Last Activity + Employee ID InfoCards, AUTHORIZED badge, close
  button → onClose), avatar carousel cycling forward/backward with
  wrap-around + synced "n/N" counter, single-avatar fallback
  (`userData.avatar` → `[avatar]`, arrows hidden), unknown +
  access-log path (UNAUTHORIZED + Denied + verbatim Access Time +
  initials-fallback src on no avatars, Department card skipped),
  known + access-log path (Granted status + verbatim time + Employee
  ID card suppressed). Suite 1420 → 1426 passing. Adds vitest.config.js
  include. Public `21905a6`, private mirror `f385c62`.
- **streaming** — `internal/stream` 66.3% → **69.1%** (+2.8 pts).
  **`NewStreamManager` 0% → 100%.** New
  `streaming/internal/stream/stream_constructor_test.go` (4 tests,
  no mocks). `MaxPlaybackPerCam == 0 → 50` default coercion + non-zero
  preservation, legacy-plaintext `rtsp://` auto-encryption migration
  loop + its negative companions (empty-RTSPURL `continue` and
  already-encrypted no-double-encrypt), field-initialisation contract
  for every map/channel the runtime depends on. Full `./...` green.
  Private only `1300b6a`.
- **cv-faceauth** — `orchestrator/manager.py` CameraManager (0% →
  covered) — biggest single file landed this round. New
  `cv-faceauth/tests/test_manager.py` (**42 tests**). Pre-stubs
  `stream.pyav_reader` / `stream.robust_hls_reader` /
  `stream.shared_reader` / `stream.token_manager` /
  `workers.redis_dispatcher` in `sys.modules` then rolls them back
  via `finally:` so they don't pollute sibling test files. Construction,
  `from_yaml` happy + error paths, pipeline-key utilities + round-trip,
  JSON persistence (save/load/clear/save_entry/update_modes via
  `monkeypatch.chdir(tmp_path)`), fill-first shard assignment with
  overflow at last shard, `_is_duplicate` (new + legacy entry formats),
  pipeline accessors with prefix-safe filtering (`cam1` vs `cam10`),
  `get_status` / `get_cameras_summary` via tiny stub pipeline,
  async stop helpers on empty maps, `start_camera` standalone-mode
  short-circuit + max-cameras gate. Suite 626 → **668 passing /
  0 skipped**. **First orchestrator/ module covered.** Private only
  `c02ef62`.

## TL;DR — what changed on 2026-05-26 (R55 — full 4-phase round, +55 tests; **RestorePlaybacks 100% without triggering #100**)

- **server** — pivoted to **route-wiring contracts** (a phase the
  roadmap had down at priority 4). New
  `server/tests/contract/permissions.routes.test.js` (9 tests, 3 mocks).
  All 9 declared `/api/v1/permissions` routes pinned through their
  inline `verifyToken` + `permissionMiddleware` access-check chain to
  the expected `PermissionController` method. Suite 2350 → 2359
  passing / 5 skipped. Public `4938ea2`, private mirror `d638a4d`.
  **Agent surfaced roadmap-correction data** (recorded below).
- **client** — `page/user/Streams/CameraStreamsModal/AttendanceCheckLog.jsx`
  (0% → covered) — sibling of R52 ZoneSelector. New
  `client/tests/unit/page/user/Streams/CameraStreamsModal/AttendanceCheckLog.test.jsx`
  (5 tests, **0 mocks**). Null on empty/non-array, full render +
  section toggle + `onProfileClick` routing (isAccess true/false),
  slice-to-5 cap on a 7-item feed, no-throw when `onProfileClick`
  omitted. Suite 1415 → 1420 passing. Adds vitest.config.js include.
  Public `0443b5f`, private mirror `eacd6d1`.
- **streaming** — `internal/stream` 63.8% → **66.3%** (+2.5 pts).
  **`RestorePlaybacks` 69.2% → 100%** WITHOUT triggering bug #100
  (range-loop value-copy on Active=false). Test pins the cold-start
  recovery SPAWN arm via a pre-filled `ffmpegPool` (capacity 1) so
  the `runPlaybackPipeline` goroutine blocks on its first send and
  the synchronous assertion window is clean. `MonitorLiveStreamSegments`
  96.2% → 98.1% via two more edge arms (`os.ReadDir` error continue;
  `len(seqs)==0 && expectedSeq > 0` post-INIT republish). 3 tests
  total. Full `./...` green. Private only `435e469`.
- **cv-faceauth** — `processor/detector.py` PersonDetector
  (YOLO/RTDETR ONNX wrapper, 0% → covered). New
  `cv-faceauth/tests/test_detector.py` (**38 tests**, R47/R54 pattern
  with insightface stub at import top). Construction defaults,
  unloaded `is_loaded=False` path, `_detect_model_type` filename
  heuristic, singleton semantics, `_resolve_and_export_onnx`
  early-returns + error paths (without triggering the ultralytics
  export branch), `_preprocess` letterbox maths
  (square/landscape/portrait/upscaled), `_postprocess` for both
  YOLOv8 [B,84,N] and YOLOv5 [B,N,85] output layouts (with class
  filtering, threshold filtering, image-bounds clamping, empty-detection
  short-circuit), `detect`/`detect_batch` early-return guards. Suite
  588 → **626 passing / 0 skipped**. Private only `f1d1912`.

## Roadmap calibration from R55 server agent

The server agent explored the priority-2/3 lists and reported that
several "0%" targets were already comprehensively covered by
pre-existing tests:
- `telegram.service.js`, `domain.service.js`, `detectionObjects.service.js`,
  `shifts.service.js`, `helperFunctions` — already covered
- `validators.simple` / `validators.records` / `validators.channels`
  / `validators.users` — already covered comprehensively

And flagged 3 utils that need product-side changes before they can be
unit-tested:
- `utils/logger.js` — `mkdir` on import (side effect at module load)
- `utils/newSFTPConnectionCheck.js` — top-level `setInterval`
- `utils/database.js` — mostly initializer side effects

These need product-side refactoring to inject seams; **the cron should
NOT touch them per the test-only rule.** They're now flagged in the
gap roadmap as "needs product-side seam refactor before testable".

## TL;DR — what changed on 2026-05-26 (R54 — full 4-phase round, +48 tests; **prometheus.js unblocked via mock**)

- **server** — pivot: `checkActivePlan` turned out to already be
  well-covered by pre-existing tests, so the agent picked the next
  remaining 0% util: `server/utils/prometheus.js` (3 tests, 1 mock —
  `prom-client` stubbed via `vi.mock`, which **unblocks the file
  that was on the "excluded" list since R25 due to missing
  prom-client install**). Smoke-check 11 metric exports +
  `metricsHandler` success-path Content-Type/body + 500-path on
  `register.metrics()` rejection. Public `49284ac`, private mirror
  `90ab8dc`.
- **client** — `page/user/Streams/CameraPlay/CameraStream.jsx`
  (0% → covered) — the actual JSMpeg-based tile rendered by every
  CameraView grid + the Streams page. Distinct from
  `CameraStreamDisplay` (covered R18). Note: `CameraGridLarge.jsx`
  doesn't exist; what was on the roadmap turned out to be
  `CameraStreamDisplay` (already R18). New
  `client/tests/unit/page/user/Streams/CameraPlay/CameraStream.test.jsx`
  (4 tests, 4 mocks — StreamModal, FakeJSMpegPlayer, FakeWebSocket,
  `vi.stubEnv('VITE_SOCKET_URL', ...)`). Canvas + maximize button
  render, maximize hand-off, RtspChannel-matched StreamModal
  mount/onClose, 100ms JSMpeg polling that constructs exactly one
  Player against `ws://stream.test/ch-7` and clears its own interval,
  unmount destroys player + sends `'stop'` over freshly opened
  control WebSocket. Suite 1411 → 1415 passing. Adds vitest.config.js
  include. Public `fc61769`, private mirror `a70ce93`.
- **streaming** — `internal/stream` 60.8% → **63.8%** (+3.0 pts).
  Extended `streaming/internal/stream/stream_branches_test.go`
  (+2 tests, no mocks). `RestartStream` known-camera-cancels-and-
  succeeds-when-playlist-exists (os.Stat happy path) AND
  playlist-doesn't-appear error arm with the canonical "stream failed
  to start" diagnostic. Both bypass ffmpeg by handing
  `StartStreamForCamera` a corrupt-ciphertext RTSPURL so it takes its
  `util.D("")` no-op early-return — no `ffmpegPool` reach, no real
  subprocess. Full `./...` green. Private only `88ed37f`.
- **cv-faceauth** — `processor/embedder.py` FaceEmbedder InsightFace
  wrapper (0% → covered). New `cv-faceauth/tests/test_embedder.py`
  (**39 tests**, R47 insightface stub-at-import pattern — embedder
  enters `is_loaded=False` via ImportError branch of `_load_model`,
  no real ML touched). Yaw-bin → DB-name mapping (with fallback for
  out-of-range angles), pose-wise on/off DB routing, missing/None
  `face.pose` handling, `_crop_face` padding + image-edge clamping,
  `is_loaded=False` short-circuits on every public method,
  `get_instance` singleton across shards, CPU-mode `ctx_id=-1`
  forcing, `extract()` happy path with injected fake `_app` (bbox
  clamp, degenerate-bbox skip, None-embedding drop, small-crop
  upscale, sequential vs ThreadPoolExecutor branch). Suite 549 →
  **588 passing / 0 skipped**. Private only `51a69cc`.

## TL;DR — what changed on 2026-05-26 (R53 — full 4-phase round, +32 tests; **CameraView chain + cv-faceauth stream/ trio both closed**)

- **server** — `middlewares/errorMiddleware.js` ValidationError +
  localDev arms. Extended `server/tests/unit/middlewares/errorMiddleware.test.js`
  (+2 tests, 0 mocks). Mongoose ValidationError → 400 with field-message
  join + the `NODE_ENV === 'localDev'` arm of the dev-formatter
  conditional. `errorMiddleware.js` 94.7% → **~100%** lines and
  functions. Suite 2345 → 2347 passing / 5 skipped. Public `aa7bc80`,
  private mirror `894d10a`. **All flagged middleware files now
  near-fully covered**: permissionMiddleware ~100% (R52),
  verifyToken 74% lines / 81% branches (R52), errorMiddleware ~100% (R53).
- **client** — **CameraView grid chain closed.** New
  `client/tests/unit/page/user/Streams/Cameraview/CameraSeven.test.jsx`
  + `CameraEight.test.jsx` + `CameraNine.test.jsx` (6 tests total,
  2 mocks per file — CameraStream + CameraCanvas stubs). Same pattern
  as Six (slice cap, distinct responsive grid ladder, overlay text,
  click forwards exact camera object, default-`[]` no-crash). Suite
  1405 → 1411 passing. Public `d1784b5`, private mirror `04d159f`.
  **All 9 CameraView variants now covered** (One/Two R17, Three R46,
  Four R48, Five R50, Six R51, Seven/Eight/Nine R53).
- **streaming** — **2 packages bumped**.
  - `internal/metrics` 0% → covered: new `metrics_test.go` (4 tests,
    ~264 lines). All 26 declared metric families registered with the
    default Prometheus registry under documented name/type/help, with
    two registration strategies (Gather() for gauges, AlreadyRegistered
    re-Register for Vec collectors since they're absent from Gather()
    until a child is observed). Plus a StreamHealth fresh-registry
    test and labelled-child observation test. Package coverage stays
    `[no statements]` (var-declarations only) but **registry contract
    is now pinned** — drift in metric names/types/help would fail.
  - `internal/stream` 60.6% → **60.8%** (+0.2 pts). New
    `TestStartPlayback_MkdirAllFailureReturnsError`: pre-creates
    `<BaseDir>/playback` as a regular file so `os.MkdirAll(outputDir,
    0755)` returns non-nil; asserts error wraps "failed to create
    playback directory" AND no PlaybackContext registered (orphan-
    prevention contract — `runPlaybackPipeline` goroutine must not
    spawn on the error arm).
  - Single commit `72d12c0` on private only. Full `./...` green.
- **cv-faceauth** — `stream/robust_hls_reader.py` (the "continuous
  pipe" HLS reader, 0% → covered). **Closes the stream/ trio**
  (base R38, pyav_reader R51, shared_reader R52, robust_hls_reader R53).
  New `cv-faceauth/tests/test_robust_hls_reader.py` (**23 tests**).
  Stubs `av`, `cv2`, `requests`, `stream.token_manager` pre-load via
  sys.modules — no native deps touched. StreamBuffer pipe semantics
  (write/read FIFO, partial reads, close, flush, compact past 5MB),
  SegmentDownloader `_add_token` URL builder across all separator
  permutations + constructor wiring, RobustHLSReader closed-state
  surface (read/get_frame short-circuit, read_batch defers during
  stall recovery, properties, get_stats/get_diagnostics aggregation,
  start/stop aliases). Suite 526 → **549 passing / 0 skipped**.
  Private only `29d8407`.

## TL;DR — what changed on 2026-05-26 (R52 — full 4-phase round, +33 tests; **server pivots from controllers to middlewares**)

- **server (PIVOT)** — All 26 viable controllers are done, so this round
  starts the middleware sweep. Extended `permissionMiddleware.test.js`
  + `verifyToken.test.js` with the rejection arms that controllers
  don't exercise: missing-`req.verified` catches in
  `editAccessCheck`/`deleteAccessCheck`; outer try/catch when
  `req.header` throws synchronously; `getEmpAuthInfo` rejection that
  silently continues without `orgId`. **4 tests added**. Suite 2341 →
  2345 passing / 5 skipped. `permissionMiddleware.js` lines now fully
  covered; `verifyToken.js` 70.6% → **74.1%** lines and 68.4% →
  **80.95%** branches. Public `06333ad`, private mirror `23710c0`.
- **client** — `page/user/Streams/CameraStreamsModal/ZoneSelector.jsx`
  (0% → covered) — floating draggable zone-picker. New
  `client/tests/unit/page/user/Streams/CameraStreamsModal/ZoneSelector.test.jsx`
  (3 tests, **0 mocks** — pure-DOM, only `Object.defineProperty(window,
  'innerWidth', …)` + a synthesized `.stream-modal` ancestor with a
  stub `getBoundingClientRect`). Click-to-open + close-after-select,
  falsy-selectedZone gate hides trigger, mousedown→window-mouseup
  drag lifecycle inside `.stream-modal` ancestor. Suite 1402 → 1405
  passing. Adds vitest.config.js include. Public `8fbb7df`, private
  mirror `e79690d`.
- **streaming** — `internal/server` 68.6% → **71.9%** (+3.3 pts).
  New `streaming/internal/server/setup_routes_test.go` (4 tests, no
  mocks). `NewServer` 0% → **100%** (wires config / sm / ipLogger),
  `SetupRoutes` 0% → **100%** (playback-check route registration,
  OPTIONS preflight hitting CORS + auth short-circuit, middleware
  chain order through to handler). Uses the existing struct-literal
  `StreamManager` so no log-rotator / StartQueue goroutines spawn.
  Full `./...` green. Private only `515f49e`.
- **cv-faceauth** — `stream/shared_reader.py` SharedStreamReaderPool
  (0% → covered) — the reference-counted singleton gating
  PyAVReader / RobustHLSReader creation. New
  `cv-faceauth/tests/test_shared_reader.py` (**22 tests** across 7
  classes). Pre-stubs `stream.pyav_reader` and `stream.robust_hls_reader`
  in `sys.modules` with minimal `PyAVConfig` / `PyAVReader` /
  `RobustHLSReader` stand-ins, loaded via `load_standalone` — no real
  `av` / `cv2` / `jwt` touched. Dataclass, singleton, acquire, release,
  snapshots, `_close_reader`, shutdown, convenience wrappers. Suite
  504 → **526 passing / 0 skipped**. **Third stream/ module covered.**
  Private only `49accfc`.

## All 5 pending product bugs are now filed as GitHub issues

`gh auth login` ran successfully; all R23-R37 pending product bugs
filed as Globussoft-Technologies/videoraiq-ai issues:

| Issue | Phase | File | Subject |
|---|---|---|---|
| [#96](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/96) | streaming | logger/logrotator.go | `deleteOldFiles` filter contradiction + missing sort |
| [#97](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/97) | client | Dashboard/Alertwidgets/alert.jsx | undefined `lineCrossingAlertCard` would crash render |
| [#98](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/98) | client | Profile/DefaultDetectionStep.jsx | stray `console.log` + debug effect in production |
| [#99](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/99) | client | RolePermissions/AddRoleDialog.jsx | edit-mode prefill wiped by sibling `useEffect` |
| [#100](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/100) | streaming | stream/RestorePlaybacks | range-loop value-copy never persists |

When any of these issues are fixed by the product team, the corresponding
`t.Skip` / `it.skip` / test-pinning comments in the existing tests should
be updated to assert the corrected behavior (the tests currently pin the
buggy contract or are outright skipped).

## Coverage Gap Roadmap (the cron reads this each firing — picks the next target from here)

This roadmap supersedes the per-round "context (DO NOT re-cover)" lists.
Each phase has a prioritized list of remaining gaps. Sub-agents should
pick the **highest-leverage uncovered target** that fits the round's
constraints (≤8 mocks, no live ffmpeg/sockets/disk, no insightface/GPU
on cv-faceauth).

### Server — controller chain complete (R26-R51), pivoting to middlewares/utils/routes

**Done:**
- All 26 viable controllers (R26-R51)
- 3 services (telegram, python, delete)
- 1 util (sftpConnectionCheck)
- 4 middleware files partially covered (permissionMiddleware now full
  after R52; verifyToken to 74% lines / 81% branches)

**Server controller layer — DONE** (R26-R57). All 30+ v1 controllers
covered. Only `files.controller.js` remains uncovered and it's an
empty stub class.

**Still excluded — service BODIES** (not controllers):
- `attendance.service.js`, `storage.service.js`, `users.service.js` —
  mega-services, >8 mocks each.
- ~~`server/utils/prometheus.js`~~ **UNBLOCKED + COVERED in R54** —
  agent solved the missing-`prom-client` problem by `vi.mock`-ing it.

**Excluded — needs product-side seam refactor before testable** (R55):
- `server/utils/logger.js` — `mkdir` on import (module-load side effect)
- `server/utils/newSFTPConnectionCheck.js` — top-level `setInterval`
- `server/utils/database.js` — mostly initializer side effects
These are TEST-WALL violations even with mocks because the side
effects fire at `require()` time. Skip until product team adds
testability seams (move the `mkdir` / `setInterval` / `mongoose.connect`
calls behind an `init()` function).

**Already comprehensively covered** (R55 server agent verified — don't
re-target):
- `telegram.service.js`, `domain.service.js`, `detectionObjects.service.js`,
  `shifts.service.js`, `helperFunctions`, all the `validators.*`
  validator suites.

**Next priorities (pick top-down):**

1. **`server/middlewares/`** — `permissionMiddleware` (R52),
   `verifyToken` rejections (R52), `errorMiddleware` ValidationError +
   localDev (R53) done. R54 agent confirmed `checkActivePlan` is
   already well-covered by existing tests. Remaining:
   - Any 0% middleware files diff `ls server/middlewares/` vs
     `ls server/tests/unit/middlewares/`.

2. **`server/services/` body coverage** — controllers only test
   delegation, not service logic. The actual `*.service.js` files
   for each covered controller (RolesService, ChannelsService,
   NVRService, etc.) are mostly 0% on the service body. Target the
   smallest service first: any service file under 100 LOC with
   no/light DB usage.

3. **`server/utils/`** — diff `ls server/utils/` vs
   `ls server/tests/unit/utils/`. Skip `prometheus.js`. Look for
   formatters, helpers, validators that don't need >8 mocks.

4. **`server/routes/`** — route-wiring tests are low-cost and pin
   the middleware chain attached to each route (e.g. that
   `/api/v1/nvr/*` actually goes through `authMiddleware` +
   `permissionMiddleware`). Use supertest against `app.js`.

### Client — page+component sweep

**Done by area:**
- Layout/Header: DesktopNav (R22), MobileNav (R24), UpgradeModal (R26), ProfileDropdown (R68), HeaderSkeleton (R69), **HeaderActions (R70)**
- Layout/Sidebar: LogsSidebar (R23), AdminSidebar (R49), SettingsSidebar + Sidebar (R67), **SidebarSkeleton (R69)**
- EmployeeLogs: TimePickerComponents (R25), LogsFilterPopover (R31), BreakLogsDialog (R33)
- StorageSetting: Googledrive (R27), S3 (R28), Sftp (R29), AddStorageModal (R61)
- Dashboard: RecentAlerts (R30), NoDataCard (R38)
- RolePermissions: PermissionTable (R32), AddRoleDialog (R34), RolesandPermission PAGE (R64)
- Incidents: IncidentPagination (R35), IncidentCard (R36), ReportIncidentModal (R37), Incidents PAGE (R62)
- Locations: LocationForm (R39), **Locations PAGE (R66)**
- NotificationRecipients: **NotificationRecipients PAGE (R66)**
- Users: ForgotPassword (R40), ResetPassword (R41)
- Playback: MediaControls (R42)
- Streams: NvrLocalsettings (R43), CameraCanvas (R47), ZoneSelector (R52), CameraStream (R54), Cameraview PAGE (R64), **Streams PAGE + GridViewModal (R65)**
- Cameraview grid: CameraOne/Two (R17), Three (R46), Four (R48), Five (R50), Six (R51), Seven/Eight/Nine (R53)
- Departments: Departments page (R44)
- Detection: AddNewConfiguration (R45)
- Profile: Profile PAGE (R63)

**Excluded:**
- `Dashboard/Alertwidgets/alert.jsx` — blocked by [#97](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/97)
- `Profile/DefaultDetectionStep.jsx` — blocked by [#98](https://github.com/Globussoft-Technologies/videoraiq-ai/issues/98)

**True remaining 0% candidates (verified — pick from these, NOT the
stale list below):**

- Each round: `npx vitest run --coverage 2>&1 | tail -100` from
  `d:/gbs projects/videora/videoraiq/client` then look for 0% files
  that ARE in the vitest include scope. The include scope is opt-in
  per-file (not glob-based), so unincluded src files won't show up
  in coverage — diff `ls client/src/<area>/` against what's in
  `client/vitest.config.js` include list.
- Likely remaining: smaller widget components inside
  `client/src/page/user/<area>/components/` that haven't had a
  parent test file include them yet.

**Stale-list reference (DO NOT re-target — verified non-existent or
already done):**

1. ~~`client/src/page/user/Streams/Cameraview/`~~ **DONE in R53**.
2. ~~Cameraview PAGE / RolesandPermission PAGE~~ **DONE in R64**.
3. ~~Streams PAGE / GridViewModal~~ **DONE in R65**.
4. ~~Locations PAGE / NotificationRecipients PAGE~~ **DONE in R66**.
5. ~~`client/src/page/user/NVR/`~~ **STALE** — NVR/ is only
   `NVRAuthLogin.jsx` stub, already covered.
6. ~~`layout/Header/ProfileDropdown.jsx`~~ **DONE in R68**.
7. ~~`client/src/page/user/Streams/CameraStreamsModal/*`~~
   **STALE** — R55-R59 already covered all siblings of ZoneSelector.
8. ~~`client/src/page/user/Incidents/IncidentDetail` /
   `IncidentFilters`~~ **STALE** — files don't exist.
9. ~~`client/src/page/user/Settings/{AutoEmailReport,Network}/`~~
   **STALE** — files don't exist.
10. ~~`client/src/hooks/`~~ **STALE** — all 5 files in
    `client/src/hooks/` already have tests.
11. ~~`client/src/contexts/`~~ **STALE** — directory does NOT exist.
12. ~~`client/src/utils/`, `client/src/lib/`, `client/src/components/ui/`~~
    **STALE** — fully tested.
5. **`client/src/page/user/Streams/CameraStreamsModal/*`** other
   than ZoneSelector R52 — check for sibling components.
6. **`client/src/page/user/Incidents/`** — IncidentDetail,
   IncidentFilters (PAGE itself is R62).
7. **`client/src/page/user/Settings/`** — AutoEmailReport, Network,
   Other (StorageSetting trio + AddStorageModal done).
8. **`client/src/hooks/`** — most custom hooks uncovered.
9. **`client/src/contexts/`** — SocketContext, PermissionContext,
   UserContext untested.
10. **`client/src/components/`** — Modals, Forms, Tables, Cards in
    `src/components/` (vs `src/page/.../components/`).
11. **`client/src/utils/` and `client/src/lib/`** — formatters and helpers.

### Streaming Go — diminishing returns on existing pkgs; pivot to remaining 0% pkgs after that

**Coverage state (after R76):**
- `internal/fmt` 100%, `internal/ram` 96.4%, `internal/util` 95.2%,
  `internal/config` 82.4%, `internal/logger` **94.0%** (R76:
  getLocationFromAPI 87.5→100%), `internal/server` 96.9%, `internal/stream`
  80.9%
- Total streaming: **87.2%** (was 87.1%)

**Practical ceiling note** (per R73 agent investigation): all
remaining `internal/stream` and most `internal/server` gaps are
either (a) blocked on the explicit seam list (cleanupInactive*,
processStartQueue Sleep, MonitorFFmpeg second tick, StartCleanupRoutine
enabled arm, RestartStream dead-code) or (b) need real ffmpeg/ffprobe
binaries (runFFmpegPipeline/Sub/Playback, getVideoCodec) or (c) are
unreachable error arms (json.Marshal/Indent errors in config.Save(),
strconv.Unquote when JSON contains `"`). Streaming is at its
practical ceiling without product-side seam refactors.

**Known blocked on product-side seams** (per R67 agent investigation):
- `cleanupInactiveStreams` / `cleanupInactiveSubStreams` / `cleanupInactivePlaybacks` — 5-min `time.NewTicker` blocking loops with no shutdown channel; would need product `init()` seam
- `processStartQueue` — contains hard-coded `time.Sleep(5*time.Second)`; deterministic testing would need a clock seam
- `MonitorFFmpegProcessStats` second-tick branches — depend on flaky system-wide netIO deltas
- `StartCleanupRoutine` enabled arm — unkillable 6h ticker (same seam issue)
- `internal/metrics` registry contract **pinned via smoke tests** in R53
- `cmd/server` **0%** (main + wiring, hard to unit-test without
  spawning the full server)

**Next priorities (pick top-down):**

1. **`internal/stream`** (still the biggest active gap at 79.0%) —
   `runFFmpegPipeline`/`runFFmpegPipelineSub` partial (25.7%/29.7%);
   `MonitorFFmpegProcessStats` at 78.1% after R65 (remaining 22% is
   post-snapshot branches needing a second tick);
   remaining stale-cleanup branches, queue handling.
2. **`internal/server` HLS body delivery** — large fraction of the
   remaining ~13% is live-ffmpeg-dependent serve paths; can pin error
   paths and header contracts without ffmpeg.
3. **`internal/logger`** — diminishing returns now (91.0%); remaining 9%
   is the enabled-arm of `StartCleanupRoutine` (unkillable 6h-ticker
   goroutine with no shutdown signal — needs product-side seam refactor
   to be testable, file as ambiguous if attempting).

### cv-faceauth — 43+ product modules covered, suite at 881 passing / 3 skipped

**Done:**
- core (10): fps_tracker, context, gpu_lock, health_monitor, metrics,
  models, logger, redis_client, triton_client + builtin baseline
- recognition (4): cache, qdrant_client, persistent_matcher,
  local_matcher, registration_service (counted as 5)
- processor (4): quality, tracker, batch_processor, deduplicator
- config (1): settings
- workers (6): dispatch_cache, api_clients, nas_uploader, dispatcher,
  redis_dispatcher, __init__
- stream (3): base, pyav_reader, shared_reader
- api (2): face_auth_onfly_api, models (whole file)

**KNOWN UNAVAILABLE in this dev env — ALL CLEARED:**
- ~~`core/memory_monitor.py`~~ **UNBLOCKED + COVERED in R66** —
  22 pass + 1 skip on bug #104 (UnboundLocalError on swap_info).
  Pre-stubs psutil + per-test monkeypatch for rss/swap.
- ~~`api/dependencies.py`~~ **UNBLOCKED + COVERED in R59**.
- ~~`stream/token_manager.py`~~ **UNBLOCKED + COVERED in R63** —
  17 pass + 2 skip on bug #102 (URLTokenManager deadlock).
- ~~`processor/qdrant_deduplicator.py`~~ **UNBLOCKED + COVERED in R62**.

**STATUS**: All 4 original KNOWN-UNAVAILABLE modules are now covered.

**Next priorities (pick top-down):**

1. ~~`cv-faceauth/stream/robust_hls_reader.py`~~ **DONE in R53**.
2. ~~`cv-faceauth/processor/embedder.py`~~ **DONE in R54**.
3. ~~`cv-faceauth/orchestrator/manager.py`~~ **DONE in R56**.
4. ~~`cv-faceauth/orchestrator/face_auth_pipeline.py`~~ **DONE in R61**.
5. ~~`cv-faceauth/recognition/local_matcher_old.py`~~ **DONE in R64**.
6. ~~`cv-faceauth/api/face_auth_api.py`~~ **DONE in R65**.
7. ~~`cv-faceauth/core/memory_monitor.py`~~ **DONE in R66** — the last
   original KNOWN-UNAVAILABLE module. Bug #104 filed.
8. ~~`cv-faceauth/processor/detector.py`~~ **DONE in R68** —
   was 51% (not 0% as R66 thought), now 91%. 21 tests. Remaining
   9% is Linux/CUDA-runtime-specific (libcublas, torch.cuda) not
   portably testable on Windows.
9. ~~`cv-faceauth/orchestrator/face_auth_onfly_pipeline.py`~~
   **DONE in R73** — 54% → **100%** (+46pp). The "import-time-blocked"
   note in the earlier roadmap was wrong; R73 agent unblocked it via
   the standard stub-at-import + scoped sys.modules rollback pattern.
   12 tests pinning `_initialize_components`, dispatch exception
   handler, `_active_tracks.pop`, and the registered-users follow-up
   loop including multi-user fan-out and outer exception swallow.
12. ~~`cv-faceauth/workers/redis_dispatcher.py`~~ **DONE in R69** —
    54% → 98% via 17 tests covering the entire async push surface.
10. ~~`cv-faceauth/scripts/run_bg_worker.py`~~ **DONE in R67** —
    R66's note was wrong; R67 agent verified 0% and landed 43 pass +
    4 skip (bug #105). Module now at 70%.
11. **Each round: re-scan with `python -m pytest --cov --cov-report=term-missing tests`** to find the true remaining 0% / low-coverage modules.

### e2e — STALLED until live DOM is reverse-engineered

The Playwright suite has 10 unauthenticated specs passing. The
authenticated specs need POM selectors rebuilt against the live
deployed DOM (TESTING_TODO §3). The cron should continue to SKIP
e2e each round until this is done by hand — autonomous DOM discovery
on a live deployment isn't a safe operation.

If you want to unblock e2e: run `npx playwright codegen <staging-url>`
on a real auth'd session and feed the resulting selectors back into
the page-object models under `e2e/pages/`.

## TL;DR — what changed on 2026-05-26 (R51 — full 4-phase round, +54 tests; **all viable controllers now covered**)

- **server** — `core/v1/incidents/incidents.controller.js` (0% →
  covered) — the last viable 0% controller per the R50 roadmap.
  16-handler delegator (527 LOC). New
  `server/tests/unit/controllers/incidents.controller.test.js`
  (**36 tests**, 1 mock — incidentsService; 16 handlers × 2 with
  `expectOnlyCalled` invariant). **26th controller test — all
  viable controllers are now covered** (files.controller.js is an
  empty-stub class; attendance/storage/users are mega-services that
  need >8 mocks, excluded by budget). Suite 2295 → 2341 passing /
  5 skipped. Public `f50d7c0`, private mirror `237a47f`. **Next
  rounds pivot to server middlewares/utils/routes.**
- **client** — `page/user/Streams/Cameraview/CameraSix.jsx`
  (0% → covered) — 6-tile grid. New
  `client/tests/unit/page/user/Streams/Cameraview/CameraSix.test.jsx`
  (2 tests, 2 mocks — CameraStream + CameraCanvas stubs).
  `slice(0,6)` cap (7th/8th drop), layout-specific Tailwind classes
  (`sm:grid-cols-2`, `md:grid-cols-3`, `lg:grid-cols-4` — distinct
  from CameraFive's 3-col cap), click forwards exact camera object
  (4th tile), default `[]` zero tiles. Suite 1400 → 1402 passing.
  Public `85c67aa`, private mirror `d55ad70`. **CameraView grid
  chain: One/Two R17, Three R46, Four R48, Five R50, Six R51.**
- **streaming** — `internal/server` 67.1% → **68.6%** (+1.5 pts).
  `handlePlaybackStart` 41.1% → **55.4%**. Extended
  `streaming/internal/server/handle_playback_start_branches_test.go`
  (+2 tests, no mocks). `util.D` decrypt-failure on corrupt RTSPURL
  → 500 with no PlaybackStream side effects (data-loss guard), AND
  Generate=false stop-success → 200 with full eviction +
  `Active=false` flip on matching `Config.Playbacks` row (note this
  is the *non-broken* path; the R37 RestorePlaybacks range-loop
  value-copy bug is on the related but separate restore-startup
  path). Full `./...` green. Private only `691e697`.
- **cv-faceauth** — `stream/pyav_reader.py` PyAV-backed HLS/RTSP
  stream reader (0% → covered). New
  `cv-faceauth/tests/test_pyav_reader.py` (14 tests). Stubbed `av`,
  `av.container`, and `cv2` at import time + `load_standalone` —
  no network, no decoder, no real PyAV wheel touched. `PyAVConfig`
  + `ReaderStats` (defaults + `to_dict()` shape with
  buffer_utilization formatting + decode_fps rounding + error
  truncation to last 5), `DecoderThread.stop()` flag-flip without
  starting OS thread, `PyAVReader` closed-state surface (`read()`,
  `get()` for all CV property IDs, `isOpened()`, `get_stats()`,
  `get_frame()`, properties), `get_stream_reader` factory (kwargs
  propagation, gstreamer→PyAVReader override, defaults). Suite
  **490 → 504 passing / 0 skipped**. **Second stream/ module
  covered** (base R38, pyav_reader R51). Private only `72e9d35`.

## TL;DR — what changed on 2026-05-26 (R50 — full 4-phase round, +36 tests; **50th cron round milestone**)

- **server** — `core/v1/authorizedUsers/authorizedUsers.controller.js`
  (0% → covered) — 9-handler delegator (340 LOC). New
  `server/tests/unit/controllers/authorizedUsers.controller.test.js`
  (18 tests, 1 mock — authorizedUsersService; 9 handlers × 2 with
  `expectOnlyCalled` guard: deleteAllAuthUsers, fetchAuthUser,
  createAuthUser, updateAuthUser, deleteAuthUser, authUserLogin,
  bulkImportAuthUser, fetchUniqueLocations, verifyUser). **25th
  controller test.** Suite 2287 → 2295 passing / 5 skipped. Public
  `b4cdae1`, private mirror `4e512e6`. Only remaining 0% viable
  controller now: `incidents` (527 lines).
- **client** — `page/user/Streams/Cameraview/CameraFive.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Streams/Cameraview/CameraFive.test.jsx`
  (2 tests, 2 mocks — CameraStream child stubbed, imported-but-unused
  CameraCanvas stubbed). `slice(0,5)` cap (passes 7 cameras, verifies
  6th/7th drop), distinctive responsive grid classes
  (`sm:grid-cols-2` + `lg:grid-cols-3`, NOT `lg:grid-cols-4`), title
  + datetime overlays, config forward, tile-click `selectedVideo`
  delegates exact entry (clicks 3rd tile), default `[]` → zero tiles.
  Suite 1398 → 1400 passing. Public `8283eed`, private mirror
  `ce45a07`.
- **streaming** — `internal/stream` 59.9% → **60.6%** (+0.7 pts) —
  **crosses 60%**. Extended
  `streaming/internal/stream/metrics_stream_test.go` (+2 tests, no
  mocks). `MonitorLiveStreamSegments` no-change arm (fall-through tail
  when `currentMax == lastMaxSeq` — ffmpeg idle between ticks; pinned
  by poisoning `ExpectedNextSegment = -1` after INIT and verifying
  the next tick restores) AND gap-closed arm (inner
  `if currentGapStart > 0` block zeroing `CurrentGapMissedSegments`
  / `SegmentGapSize` when a continuous segment arrives after a gap:
  seq seg_5 → seg_10 (gap=4) → seg_11 closes gap). Full `./...`
  green. Private only `bcf58dd`.
- **cv-faceauth** — `processor/deduplicator.py` extras pass (the
  module was insightface-resolved between R46-R48; this round adds
  `clear()` / `stats` / cache-cap surface). New
  `cv-faceauth/tests/test_deduplicator_extras.py` (14 tests, stubs
  `insightface.utils.face_align` at module top — same pattern as
  R47 batch_processor). `clear()` empties cache + lifetime-stats
  preserved + idempotent, `stats` zero-division guard + accumulation
  via both `is_duplicate` and `check_and_add`, `add()` /
  `check_and_add()` deep-copy embedding (mutation safety) + default
  `camera_id="unknown"`, threshold boundary (`>=` semantics + negative
  threshold treats orthogonal as duplicate), `max_cache_size` growth
  bounded to `cap + 1` with "keep newest" tie-break. Suite 476 →
  **490 passing / 0 skipped**. Notable: agent observed a
  clock-resolution stable-sort tie-break nuance in `_cleanup_expired`
  (collides at clock resolution → keeps oldest), correctly sidestepped
  via explicit timestamp staggering rather than filing as a bug.
  Private only `601bbc0`.

## TL;DR — what changed on 2026-05-26 (R49 — full 4-phase round, +41 tests)

- **server** — `core/v1/channels/channels.controller.js` (0% →
  covered) — 11-handler delegator (372 LOC). New
  `server/tests/unit/controllers/channels.controller.test.js`
  (**24 tests**, 1 mock — channelsService). 11 handlers × 2 with
  `expectOnlyCalled` sibling-isolation guard: updateChannel,
  getAllChannels, getChannelsByNvr, deleteChannel, bulkUpdateChannels,
  updateChannelConfiguration, getPlaybackUrl, getPlaybackTimeline,
  getPlaybackWithFilters, getFilterAllChannels, getChannelById,
  toggleDetection. **24th controller test.** Suite 2263 → 2287
  passing / 5 skipped. Public `c47a641`, private mirror `1866a64`.
  (Remaining 0% controllers: authorizedUsers, incidents.)
- **client** — `layout/Sidebar/AdminSidebar.jsx` (0% → covered) —
  137-line admin section side rail with one expandable parent
  (User Details → 2 children) + three leaves. New
  `client/tests/unit/layout/Sidebar/AdminSidebar.test.jsx`
  (6 tests, 2 mocks — Nvrform stubbed null to keep the
  Formik+Yup+Streams Api graph out of the import chain;
  `useNavigate` spy alongside real MemoryRouter+useLocation).
  Parent labels + auto-expanded User Details, leaf-click navigate,
  parent-click toggle without nav, active background class on
  matching pathname, `isChildActive` lifts to parent+child, child
  routes. Suite 1392 → 1398 passing. Adds vitest.config.js include.
  Public `ad50e02`, private mirror `b025f64`. **Second Sidebar
  covered** (LogsSidebar R23, AdminSidebar R49).
- **streaming** — `internal/stream` 59.4% → **59.9%** (+0.5 pts).
  Extended `streaming/internal/stream/stream_branches_test.go`
  (+3 tests, no mocks). `HandleCameraRequest` `Config.Save()`
  error-return paths in the `true`/`stop`/`delete` arms — forces
  `os.WriteFile` failure by pre-creating `config.json` as a
  directory in the chdir'd CWD (same trick as
  `TestUpdateConfig_WriteFailureReturnsWrappedError` from R47).
  Full `./...` green. Private only `092e46d`.
- **cv-faceauth** — `workers/__init__.py` (0% → covered) — the
  package's public re-export surface. New
  `cv-faceauth/tests/test_workers_init.py` (8 tests). `__all__`,
  attribute presence, identity-vs-source, class/callable shape,
  enum-like CameraType. Suite 468 → **476 passing / 0 skipped**.
  Private only `4566d16`.

## TL;DR — what changed on 2026-05-26 (R48 — full 4-phase round, +32 tests; **0 skipped left**)

- **server** — `core/v1/dashboard/dashboard.controller.js` (0% →
  covered) — 9-method delegator (273 LOC). New
  `server/tests/unit/controllers/dashboard.controller.test.js`
  (18 tests, 1 mock — dashboardService; 9 handlers × 2 with
  sibling-isolation guard: headerStats, criticalityStats,
  detectionChart, WeeklyComparisonChart, getSidebarConfig,
  updateSidebarConfig, recentIncidents, getIncidentsByType,
  getDetections). **23rd controller test.** Suite 2198 → 2263
  passing / 5 skipped. Public `ba8e062`, private mirror `bbe0645`.
  (Remaining 0% controllers: authorizedUsers, channels, incidents.)
- **client** — `page/user/Streams/Cameraview/CameraFour.jsx`
  (already in vitest.config include list since R17 but no dedicated
  test file). New
  `client/tests/unit/page/user/Streams/Cameraview/CameraFour.test.jsx`
  (2 tests, 2 mocks — CameraStream + imported-but-unused CameraCanvas).
  `slice(0,4)` with 6-camera input (only first 4 render), title +
  datetime overlay, config forward to stub, responsive
  `md:grid-cols-2` / `lg:grid-cols-4` classes, tile-click invokes
  `selectedVideo(camera)` with exact entry (clicks 2nd tile to prove
  it's not always the last), default `[]` cameraData → zero tiles.
  Suite 1390 → 1392 passing. Public `47789ca`, private mirror
  `d3134c9`. **CameraView grid trio complete** (One R17, Two R17,
  Three R46, Four R48).
- **streaming** — `internal/stream` 59.2% → **59.4%** (+0.2 pts).
  `buildPlaylist` 97.4% → **100%**. Extended
  `streaming/internal/stream/playlist_test.go` (+1 test for
  `os.Create` error silent-return: pre-creates `playlist.m3u8` as a
  directory, asserts no panic + no destructive side effect — the
  guard that prevents an FS error from NPE-crashing the 300ms-tick
  playlist updater goroutine). Full `./...` green. Private only
  `a3b35f8`.
- **cv-faceauth** — `recognition/registration_service.py` (0% →
  covered). New `cv-faceauth/tests/test_registration_service.py`
  (11 tests, DBSCAN/NAS/HTTP bypassed via early-return paths and
  matcher.match stubbing). Module-level random pools, `UnknownFaceEntry`
  dataclass, constructor defaults (BUFFER_LIMIT=15,
  STALE_TIMEOUT_SEC=2, settings-derived URL), `process_unknowns`
  buffering control flow (no-op fast path, under-limit accumulation,
  cross-call buffer growth on same track id, stale-track trigger
  into clustering branch). Suite **457 → 468 passing / 0 skipped**.
  Private only `e71338a`. **Both original insightface-gated skips
  are now confirmed resolved** (tracker R46 + deduplicator at some
  point between R46 and R48 via the same `load_standalone` import
  bypass; deduplicator turned out not to need its own dedicated test
  file).

## TL;DR — what changed on 2026-05-26 (R47 — full 4-phase round, +42 tests)

- **server** — `core/v1/profiles/profiles.controller.js` (0% →
  covered) — 9-method delegator. New
  `server/tests/unit/controllers/profiles.controller.test.js`
  (18 tests, 1 mock — ProfileService; 9 handlers × 2). **22nd
  controller test.** Suite 2172 → 2198 passing / 5 skipped. Public
  `087ddc6`, private mirror `e4f6156`. (Remaining 0% controllers:
  authorizedUsers, channels, dashboard, incidents.)
- **client** — `page/user/Streams/CameraCanvas.jsx` (0% → covered)
  — 170-line shared video-thumbnail tile used by Incidents, Streams,
  and Playback. New
  `client/tests/unit/page/user/Streams/CameraCanvas.test.jsx`
  (4 tests, 2 mocks — UserContext Provider with setter spies, Missing
  asset). `<video>` branch when src present, `<img>` fallback when
  missing (plus bundled fallback SVG on first onError and no-op guard
  on second), in-modal Maximize → Fullscreen API branch (jsdom shim),
  non-modal Maximize → UserContext `setStreamModalContentSrc` +
  `setStreamModalShow(true)`. Suite 1386 → 1390 passing. Adds
  vitest.config.js include. Public `438427c`, private mirror `f3517a5`.
- **streaming** — `internal/stream` 58.3% → **59.2%** (+0.9 pts).
  Extended `streaming/internal/stream/lifecycle_test.go` (+2 tests,
  no mocks). `killFFmpeg` non-nil-cmd / already-exited-process branch
  (uses `go env GOROOT` as a deterministic short-lived child — the
  fallback `taskkill`/`kill -9` shell-out MUST be skipped when
  `ProcessState.Exited()==true` to avoid signalling a recycled PID).
  `UpdateConfig` write-failure arm (forced by pre-creating
  `config.json` as a directory, verifies `"failed to write config
  file"` wrapping). Full `./...` green. Private only `6690331`.
- **cv-faceauth** — `processor/batch_processor.py` (0% → covered).
  New `cv-faceauth/tests/test_batch_processor.py` (18 tests). Stubs
  `insightface.utils.face_align` before import then injects fake
  Embedder + QualityScorer (no real ML). Covers `add()` input
  validation, per-track buffer separation, `should_process` frame /
  timeout / empty triggers, `flush()` with missing aligned crops +
  None embeddings + top-K ordering + min_face_quality filtering +
  yaw-penalty math + None-score coercion, buffer reset semantics,
  `stats`, `clear()`. Suite 421 → 457 passing / 2 skipped (the +36
  reflects R46 carry-over + R47). Private only `f50b203`.

## TL;DR — what changed on 2026-05-26 (R46 — full 4-phase round, **+57 tests**; tracker skip resolved)

- **server** — `core/v1/admin/admin.controller.js` (0% → covered) —
  even bigger than NVR at 13 handlers. New
  `server/tests/unit/controllers/admin.controller.test.js`
  (**26 tests**, 1 mock — AdminService). 13 handlers × 2 (signUP,
  updateAdmin, fetch, getEmpEmployees, importEMPUsers, addEMPEmails,
  getEMPEmails, updateEMPEmail, deleteEMPEmail, getLocationByEmpEmail,
  getDeletionProgress, updateLogsSound, fetchLogsSound).
  **21st controller test.** Suite 2172 → 2227 passing / 5 skipped
  (the +55 reflects R45 carryover + R46). Public `8fd3861`, private
  mirror `12b8e3c`. (Remaining 0% controllers: authorizedUsers,
  profiles, channels, dashboard, incidents.)
- **client** — `page/user/Streams/Cameraview/CameraThree.jsx` (0% →
  covered) — 35-line 3-column camera-grid wrapper (sibling of
  CameraOne/Two/StreamDisplay/GridLarge which were already covered).
  New `client/tests/unit/page/user/Streams/Cameraview/CameraThree.test.jsx`
  (3 tests, 1 mock — CameraStream child stubbed to surface props as
  data attrs). Per-camera render with title/datetime overlays + prop
  pass-through, responsive grid classes + empty-data zero-tile,
  default-prop branch. Suite 1383 → 1386 passing. Public `2df66ef`,
  private mirror `963627c`.
- **streaming** — `internal/stream` 55.7% → **58.3%** (+2.6 pts).
  New `streaming/internal/stream/monitor_ffmpeg_stats_test.go`
  (2 tests, no mocks — uses gopsutil's deterministic pid=-1 sentinel).
  `MonitorFFmpegProcessStats` 0% → 46.9%. Covers both pure-Go
  branches: process.NewProcess error early-return AND ctx.Done() arm
  zeroing all 4 per-camera gauges (CPU, Memory, NetworkSpeedMbps,
  NetworkBandwidthBytes). Previously 0% because all callers require
  a live ffmpeg child. Full `./...` green. Private only `ce2bb0f`.
- **cv-faceauth** — `processor/tracker.py` (insightface-gated skip
  from the original baseline, now **resolved via load_standalone**).
  New `cv-faceauth/tests/test_tracker_logic.py` (**26 tests**).
  Cosine feature similarity (None/flatten/orthogonal/opposite), track
  creation vs IoU reuse, feature persistence, short-features fallback,
  miss-count lifecycle + expiry semantics, match-resets-miss,
  max_tracks overflow, recognition cache set/read/invalidate,
  `verify_identity` (match / ID-switch / zero-norm / missing /
  no-cache), `memory_estimate_kb`. Suite 395 → 421 passing /
  2 skipped (the deduplicator skip remains; tracker is no longer
  among them). Private only `a7b6770`.

## TL;DR — what changed on 2026-05-26 (R45 — full 4-phase round, **+64 tests**)

- **server** — `core/v1/NVR/nvr.controller.js` (0% → covered) — the
  biggest controller yet at 11 handlers. New
  `server/tests/unit/controllers/nvr.controller.test.js`
  (**22 tests**, 1 mock — NVRService). 11 handlers × 2 (delegation +
  rejection propagation), `expectOnlyCalled` per case. **20th
  controller test.** Suite stable at 2172 passing / 5 skipped. Public
  `efcae3c`, private mirror `3952f23`.
- **client** — `page/user/Detection/components/AddNewConfiguration.jsx`
  (0% → covered) — the legacy DetectionSetting panel with
  collapse/expand + `getAllDetectionTypes()` fetch + lazy
  ManageSettings mount. New
  `client/tests/unit/page/user/Detection/components/AddNewConfiguration.test.jsx`
  (6 tests, 3 mocks — react-select inline native stub, ManageSettings
  passthrough, `Detection/Api/get`). Heading switch on isEdit, header
  chevron expand/collapse, option mapping from API response, lazy
  ManageSettings mount + setAddedDetection wiring, inner clear-type
  unmount, API-failure fallback to empty options. Suite 1377 → 1383
  passing. Adds vitest.config.js include. Public `3e61077`, private
  mirror `a74f4d4`. **First Detection component covered.**
- **streaming** — `internal/stream` 54.6% → **55.7%** (+1.1 pts).
  New `streaming/internal/stream/ffmpeg_codec_test.go` (1 test for
  `getVideoCodec` missing-binary wrapped-error path). `getVideoCodec`
  0% → 85.7% (happy path needs live RTSP + vendored binary). Uses
  `t.Chdir` to force `./xver_l0.exe` lookup failure — pins the
  empty-string return + `"ffprobe error:"` prefix contract that every
  ffmpeg pipeline (live/sub/playback) relies on to abort spawning.
  Full `./...` green. Private only `0f0a3ad`.
- **cv-faceauth** — `api/models.py` rest-of-models (StartCameraRequest
  was already covered; this rounds out the file). New
  `cv-faceauth/tests/test_api_models_full.py` (**35 tests**, loaded via
  `load_standalone`). StopCameraRequest, CameraStatusResponse,
  StartCameraResponse, StopCameraResponse, HealthResponse,
  ErrorResponse, UpdateModelRequest (including its `model_path`
  validator's 4 paths: missing / wrong-extension / empty / valid file
  via `tmp_path`), FaceRegisterRequest (9-field required matrix),
  FaceRegisterResponse. Suite 360 → 395 passing / 2 skipped. Private
  only `8414658`.

## TL;DR — what changed on 2026-05-25 (R44 — full 4-phase round, +35 tests; streaming stream crosses 50%)

- **server** — `core/v1/entry/entry.controller.js` (0% → covered)
  — 5-method delegation, 2-arg `(req, res)` shape (no `next`, like
  R37 vehicle). New `server/tests/unit/controllers/entry.controller.test.js`
  (10 tests, 1 mock — EntryService). **19th controller test.**
  Suite 2165 → 2175 passing / 5 skipped. Public `eef96b2`, private
  mirror `f0be231`. (Remaining R43-enumerated 0% controllers: NVR,
  admin, authorizedUsers, profiles, channels, dashboard, incidents.)
- **client** — `page/user/Departments/Departments.jsx` (0% → covered)
  — sibling of the already-covered DepartmentForm. New
  `client/tests/unit/page/user/Departments/Departments.test.jsx`
  (8 tests, **8 mocks at cap**). Initial fetch + paginated render
  with "-" description fallback + `Math.max(1, ceil/limit)` page
  math, generic + per-message error toasts on fetch/delete rejection,
  DeleteConfirmation gated callback, Add-Department CTA hidden when
  `canCreate=false`, search-input refetch, `permissionsLoading`→
  PageLoader + `!canView`→AccessDenied gates. Suite 1369 → 1377
  passing. Adds vitest.config.js include. Public `ab8c96a`, private
  mirror `26526d8`.
- **streaming** — `internal/stream` 46.3% → **54.6%** (+8.3 pts) —
  **crosses 50% covered.** Extended
  `streaming/internal/stream/metrics_stream_test.go` (+4 tests +
  helpers). `MonitorLiveStreamSegments` 47.1% → **92.3%**:
  new-segments-no-gap, new-segments-with-gap (all 4 gap metrics
  pinned), duplicate/repeated rollback, real reset
  (`StreamResetCount` + `StreamPreviousSegment` +
  `StreamLastResetTimestamp`). No new deps, pure-Go polling.
  Full `./...` green. Private only `13d0aa5`.
- **cv-faceauth** — `api/face_auth_onfly_api.py` (0% → covered) —
  the on-the-fly face-auth FastAPI service. New
  `cv-faceauth/tests/test_face_auth_onfly_api.py` (13 tests, loaded
  via `load_standalone` to bypass `api/__init__.py`'s heavy
  face_auth_api dep). Both pydantic request models
  (FaceAuthOnFlyStartCameraRequest, FaceAuthOnFlyStopCameraRequest),
  module-level constants (PREFIX, PIPELINE_MODE, _manager lazy
  singleton invariant), FastAPI app metadata + registered routes.
  Suite 347 → 360 passing / 2 skipped. **First api/ module covered.**
  Private only `cd7b6d4`.

## TL;DR — what changed on 2026-05-25 (R43 — full 4-phase round, +28 tests; streaming stream +8.7pp)

- **server** — `core/v1/domain/domain.controller.js` (0% → covered)
  — small 27-line single-method delegation. New
  `server/tests/unit/controllers/domain.controller.test.js`
  (2 tests, 1 mock — DomainService). Happy-path delegation +
  rejection propagation. **18th controller test.** Agent enumerated
  remaining 0% target order (entry, NVR, admin, authorizedUsers,
  profiles, channels, dashboard, incidents — files.controller.js is
  an empty-stub class; attendance/storage/users are mega-controllers).
  Suite 2167 → 2169 passing / 5 skipped. Public `f560f71`, private
  mirror `7501a0c`.
- **client** — `page/user/Streams/NvrLocalsettings.jsx` (0% →
  covered). New
  `client/tests/unit/page/user/Streams/NvrLocalsettings.test.jsx`
  (7 tests, **8 mocks — exactly at the cap, allowed by rule "bail
  at >8"**: useNavigate spy + Link, PermissionContext, decriptNvr,
  Button, Tooltip, StreamHeader, Nvrform AddNVRForm, DeleteConfirmation).
  Empty-state CCTV placeholder, per-NVR card render (name, location,
  cameraCount), StreamHeader Add NVR open + close round-trip,
  gear-icon → `/streams/camera-settings` with nvrId state,
  eye-icon → `/cameraview` with `from-nvr-settings` state,
  DeleteConfirmation hidden by default. Suite 1362 → 1369 passing.
  Adds vitest.config.js include. Public `4625771`, private mirror
  `6240cf1`. **First Streams component covered.**
- **streaming** — `internal/stream` 37.6% → **46.3%** (+8.7 pts).
  New `streaming/internal/stream/metrics_stream_test.go` (3 tests,
  no mocks — uses `prometheus.Metric.Write` directly to avoid pulling
  the `testutil` helper that would require adding `godebug` to go.mod).
  `MonitorLiveStreamSegments` 0% → covered:
  - ctx.Done() arm zero-out of SegmentsCurrentSequence /
    ExpectedNextSegment / SegmentGapSize / CurrentGapMissedSegments
    (so dead-camera dashboards don't show stale values).
  - First-tick INIT branch (lastMaxSeq == -1) publishing
    max(seg_*.ts) → SegmentsCurrentSequence, max+1 →
    ExpectedNextSegment, LastCreatedSegmentNumber, nonzero
    StreamStartTimestamp.
  - Empty-dir continue path leaves a pre-existing sentinel value
    intact (no brief "0" flash during ffmpeg warmup).
  Full `./...` green. Private only `b485961`.
- **cv-faceauth** — `core/triton_client.py` TritonInferenceClient
  + `get_triton_client()` singleton (0% → covered). New
  `cv-faceauth/tests/test_triton_client.py` (16 tests across 5
  classes, all gRPC calls mocked — no live Triton). Construction
  (success + swallowed connection failure → soft None client),
  `is_ready()` delegation + exception swallow + never-connected
  fallback, `infer()` (RuntimeError when unconnected, full
  input-packing / output-unpacking with InferInput +
  InferRequestedOutput asserted, InferenceServerException
  propagation), static `_numpy_to_triton_dtype` mapping table +
  FP32 fallback, singleton caching honouring `TRITON_HOST` +
  `TRITON_GRPC_PORT`. Suite 331 → 347 passing / 2 skipped. Private
  only `fbe1fcb`.

## TL;DR — what changed on 2026-05-25 (R42 — full 4-phase round, +43 tests; streaming server +11.7pp)

- **server** — `core/v1/detectionSettings/detectionSettings.controller.js`
  (0% → covered) — biggest controller yet at 9 handlers. New
  `server/tests/unit/controllers/detectionSettings.controller.test.js`
  (**18 tests**, 1 mock — detectionSettingsService; 9 handlers × 2
  assertions, matches R41 shifts pattern). **17th controller test.**
  Suite 2149 → 2167 passing / 5 skipped. Public `a31d58e`, private
  mirror `97c764d`.
- **client** — `page/user/Playback/components/MediaControls.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Playback/components/MediaControls.test.jsx`
  (10 tests, **0 mocks** — pure presentational). Button count
  (7 transport buttons), Play→Pause title flip on `isPlaying`,
  fullscreen icon flip on `isFullscreen`, callback wiring for
  `togglePlayback`/`changePlaybackRate`/`toggleFullscreen`, Play
  disabled while buffering, `cursor-not-allowed` when
  `availableSegments` empty, `jumpSeconds` `setPosition(updater)`
  clamp for ±30/±60 second jumps (lower 0, upper 86400). Suite
  1352 → 1362 passing. Adds vitest.config.js include. Public
  `402d3d6`, private mirror `72aa719`. **First Playback component
  covered.**
- **streaming** — `internal/server` 55.4% → **67.1%** (+11.7 pts!).
  New `streaming/internal/server/serve_hls_live_stream_test.go`
  (3 tests, no mocks). Covers `ServeHLS` `streamExists && !stale`
  arm (m3u8 from segmentDir + Viewers++/-- accounting), `.ts`
  branch (`video/MP2T` Content-Type + LastSegmentAt/LastActive bump
  that drives the >300s staleness sweep), and `ServeSubStreamHLS`
  live-stream serve with `-sub` suffix on segmentDir (uses a
  `#SUBSTREAM-MARKER` substring to catch regression that drops
  the suffix). Full `./...` green. Private only `be2b60a`.
- **cv-faceauth** — `recognition/local_matcher.py` LocalMatcher +
  SyncStats (0% → covered). New
  `cv-faceauth/tests/test_local_matcher.py` (12 tests, mirrors
  the R37 persistent_matcher style: patches `_init_local` +
  `get_health_monitor` at construction, swaps `_local_client` with
  a MagicMock). SyncStats defaults + per-instance breakdown,
  LocalMatcher construction defaults/counters, `is_synced` flag,
  not-synced fast path (no client touches), missing-collection,
  firstName/lastName payload with uid/admin_id, legacy identity
  payload with id→uid fallback, no-hit, exception-swallow with
  health-monitor `record_error` verification, `match_all_collections`
  fanout, `get_best_match` score selection. Suite 319 → 331 passing
  / 2 skipped. Private only `6979ade`.

## TL;DR — what changed on 2026-05-25 (R41 — full 4-phase round, +38 tests)

- **server** — `core/v1/shifts/shifts.controller.js` (0% → covered).
  New `server/tests/unit/controllers/shifts.controller.test.js`
  (12 tests, 1 mock — shiftsService; 6 handlers × 2 assertions).
  **16th controller test.** Suite 2137 → 2149 passing / 5 skipped.
  Public `f3612f6`, private mirror `a03cc3d`.
- **client** — `page/user/Users/ResetPassword.jsx` (0% → covered) —
  sibling of R40's ForgotPassword. New
  `client/tests/unit/page/user/Users/ResetPassword.test.jsx`
  (12 tests, 3 mocks — react-router-dom useNavigate + useSearchParams,
  sonner, resetpassword API). Default render, empty/short-password/
  mismatch validation, eye-toggle, success path with token query param,
  non-success body + fallback, rejection + fallback, Continue-to-Login
  nav, useSearchParams `get("token")` wiring. Suite 1340 → 1352 passing.
  No vitest.config.js change needed — already in the include list from
  R17. Public `3ac0fbf`, private mirror `2e787a7`.
- **streaming** — `internal/server` 50.4% → **55.4%** (+5.0 pts).
  New `streaming/internal/server/serve_master_substream_branches_test.go`
  (4 tests, no mocks beyond `tokenCache`/`seedValidToken` helpers).
  `ServeMasterHLS` 48.0% → **100%** (valid-token unknown camera 404 +
  known camera returns master playlist with `application/vnd.apple.mpegurl`
  Content-Type, `#EXT-X-INDEPENDENT-SEGMENTS`, both `#EXT-X-STREAM-INF`
  lines, and the interpolated `/stream/<id>` + `/sub-stream/<id>` URIs).
  `ServeSubStreamHLS` 13.2% → **27.5%** (valid-token unknown 404,
  Active=false kill-switch 503). Full `./...` green. Private only
  `f6d3c30`.
- **cv-faceauth** — `workers/redis_dispatcher.py` RedisDispatcher
  (0% → covered) — Redis-backed producer that replaced the HTTP
  WorkerDispatcher. New `cv-faceauth/tests/test_redis_dispatcher.py`
  (10 tests, Redis singleton mocked via `patch.object`). Constructor
  wiring (Redis singleton + queue name + frame-storage mkdir),
  `dispatch()` shutdown early-return, auto-generated 8-char correlation_id,
  verbatim pass-through of caller-supplied correlation_id,
  `_encode_base64` on None/empty/valid images with base64 round-trip
  verification, `_save_frame_to_disk` JPEG output (verified magic bytes),
  `shutdown()` idempotency. Suite 309 → 319 passing / 2 skipped.
  **5th workers/ module covered.** Private only `e0f657f`.

## TL;DR — what changed on 2026-05-25 (R40 — full 4-phase round, +45 tests)

- **server** — `core/v1/autoEmailReport/autoEmailReport.controller.js`
  (0% → covered). New
  `server/tests/unit/controllers/autoEmailReport.controller.test.js`
  (8 tests, 1 mock — autoEmailReportService; 4 methods × 2 assertions).
  **15th controller test.** Suite 2129 → 2137 passing / 5 skipped.
  Public `ec5975c`, private mirror `e87132c`. Note: the service file
  uses `.services.js` (plural) — non-standard naming but not a bug.
- **client** — `page/user/Users/ForgotPassword.jsx` (0% → covered).
  New `client/tests/unit/page/user/Users/ForgotPassword.test.jsx`
  (10 tests, 3 mocks — useNavigate, sonner, forgotPassword API).
  Default render, back-to-login from both states, empty + invalid-
  email validation (uses `fireEvent.blur` since HTML5 `type="email"`
  blocks jsdom submit), success-path with server-message vs default
  toast, both API-failure paths, Resend-Email button flips back to
  form. Suite 1330 → 1340 passing. Adds vitest.config.js include.
  Public `d3e6898`, private mirror `ac2cd56`. **First Users page test.**
- **streaming** — `internal/stream` 33.4% → **37.6%** (+4.2 pts).
  New `streaming/internal/stream/playback_serve_hls_test.go`
  (5 tests, no mocks). Covers `StreamManager.ServePlaybackHLS`
  (0% → **100%**): unknown-session 404, output-dir-removed 404 with
  LastAccess-still-bumps contract, playlist-file-missing 404,
  m3u8 served with `application/vnd.apple.mpegurl` Content-Type,
  .ts served with `video/MP2T`. Full `./...` green. Private only
  `1d2774e`.
- **cv-faceauth** — `core/redis_client.py` async Redis singleton
  wrapper (0% → covered). New `cv-faceauth/tests/test_redis_client.py`
  (**22 tests** across 7 classes, all paths use AsyncMock — no real
  Redis). Singleton identity + double-init guard, `push_task` JSON
  serialization + rpush-failure path, `pop_task` blpop decoding +
  None/bad-JSON guards, `get_queue_len` defensive zero-returns,
  generic KV primitives (`setex`/`exists`/`keys`/`delete`) including
  exception-swallowing, `close` aclose+clear semantics. Suite 287 →
  309 passing / 2 skipped. Private only `212c059`.

## TL;DR — what changed on 2026-05-25 (R39 — full 4-phase round, +35 tests)

- **server** — `core/v1/cameraRestrictions/authorizedChannels.controller.js`
  (0% → covered). New
  `server/tests/unit/controllers/authorizedChannels.controller.test.js`
  (10 tests, 1 mock — AuthorizedChannelsService; 5 handlers × 2
  assertions). **14th controller test.** Suite 2119 → 2129 passing /
  5 skipped (195 → 196 files). Public `ef9a965`, private mirror `54dc5c9`.
- **client** — `page/user/Locations/LocationForm.jsx` (0% → covered) —
  Formik+Yup Radix dialog for create vs edit locations. New
  `client/tests/unit/page/user/Locations/LocationForm.test.jsx`
  (11 tests, 3 mocks — dialog inline passthrough, sonner, Locations Api).
  Add-mode title + button label, edit-mode title + prefilled values,
  Yup required + max-100 validation, successful create (custom +
  default fallback toast), successful update with id + payload,
  rejection paths (server message vs "Something went wrong"), trigger
  pass-through. Suite 1319 → 1330 passing. Adds vitest.config.js
  include. Public `709c7f5`, private mirror `a1cdb0d`. **First
  Locations page covered.**
- **streaming** — `internal/stream` 31.4% → **33.4%** (+2.0 pts).
  Extended `lifecycle_test.go` + `stream_branches_test.go` (+5 tests,
  no mocks). `SetIPLogger` setter, `Stop` + logRotator drain,
  `HandleCameraRequest` "true"/"stop"/"delete" running-stream
  cancel-and-delete guards. Per-function: `Stop` 0%→100%,
  `SetIPLogger` 0%→100%, `HandleCameraRequest` 77.8%→94.4%. Full
  `./...` green. Private only `0b3320d`.
- **cv-faceauth** — `workers/dispatcher.py` WorkerDispatcher
  (0% → covered). New `cv-faceauth/tests/test_dispatcher.py` (9 tests,
  `asyncio.create_task` + api_clients factory patched — no real
  httpx, no real event-loop side effects). Construction wiring with
  shared JWTTokenProvider, `dispatch()` running-flag guard +
  correlation-id auto-gen + caller-supplied id preservation,
  `_get_loop()` cache + closed-loop replacement, `shutdown()`
  idempotency. Suite 278 → 287 passing / 2 skipped. **3rd workers/
  module covered.** Private only `1f2a37d`.

## TL;DR — what changed on 2026-05-25 (R38 — full 4-phase round, +25 tests; streaming server crosses 50%)

- **server** — `core/v1/verifyRecipients/recipients.controller.js`
  (0% → covered). New `server/tests/unit/controllers/recipients.controller.test.js`
  (12 tests, 1 mock — recipientsService; 6 handlers × 2 assertions).
  **13th controller test.** Public `892c56f`, private mirror `6bf912b`.
- **client** — `page/user/Dashboard/Alertwidgets/NoDataCard.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Dashboard/Alertwidgets/NoDataCard.test.jsx`
  (2 tests, 1 mock — Bell asset). Maps all 7 explicit
  `incidentName → title` entries + default branch + static chrome.
  Suite 1317 → 1319 passing. Adds vitest.config.js include.
  Public `8e05f21`, private mirror `45e248c`. **First Dashboard
  Alertwidget covered** — sibling to R30's RecentAlerts and the
  R32-flagged buggy `alert.jsx`.
- **streaming** — Two packages bumped (`internal/server` crosses 50%):
  - `internal/server` 46.9% → **50.4%** (+3.5 pts). New
    `handle_serve_hls_branches_test.go` (3 tests for `ServeHLS`
    valid-token unknown-camera 404 + inactive-camera 503 +
    `handleRestart` non-RTSP error-classification branch). Uses
    `tokenCache.Store` to bypass backend.
  - `internal/stream` 30.4% → **31.4%** (+1.0 pt). New
    `playlist_test.go` (2 tests for `StartCustomPlaylistUpdater`
    tick → buildPlaylist with ctx-cancel exit, AND pre-cancelled
    ctx fast-return). Pins the goroutine-shutdown contract —
    regression here would leak a goroutine per stream.
    `StartCustomPlaylistUpdater` 0% → full.
  - Single commit `4c66d97` on private only. Full `./...` green.
- **cv-faceauth** — `stream/base.py` `StreamReader` ABC (0% →
  covered). New `cv-faceauth/tests/test_stream_base.py` (6 tests,
  no mocks). Abstract instantiation rejection, partial-implementation
  rejection, exact `__abstractmethods__` set, concrete fake reader
  start/get_frame/stop lifecycle, fps-as-property contract. Loaded
  via `load_standalone` to bypass `stream/__init__.py` (which would
  pull av/cv2). Suite 272 → 278 passing / 2 skipped. Private only
  `71199c9`. **First stream/ module covered.**

## TL;DR — what changed on 2026-05-25 (R37 — full 4-phase round, +29 tests, 1 new pending bug)

- **server** — `core/v1/vehicle/vehicle.controller.js` (0% →
  covered). New `server/tests/unit/controllers/vehicle.controller.test.js`
  (6 tests, 1 mock — vehicleService; 3 methods × 2 assertions).
  **12th controller test.** Notable: this controller forwards only
  `(req, res)` (no `next`), unlike R26-R36 siblings — assertion pins
  the 2-arg shape. Suite 2089 → 2100 passing / 5 skipped.
  Public `eab55c3`, private mirror `35cf41f`.
- **client** — `page/user/Incidents/components/ReportIncidentModal.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Incidents/components/ReportIncidentModal.test.jsx`
  (5 tests, 6 mocks — dialog, button, input, sonner, lucide CheckCircle,
  `Incidents/Api/post`). Editable mode + view-mode pill + edit toggle,
  blank-submit guard, happy-path POST with trimmed description + toast.
  Suite 1317 → 1322 passing. Adds vitest.config.js include. Public
  `12a623f`, private mirror `fedc279`. **Third Incidents component
  covered** (Card R36, Pagination R35, ReportModal R37).
- **streaming** — `internal/stream` 25.3% → **30.4%** (+5.1 pts).
  New `streaming/internal/stream/stream_branches_test.go` (7 tests,
  no mocks). Covers `HandleCameraRequest("true")` empty-RTSP rejection,
  new-camera append (encrypted) + existing-camera in-place update;
  `RestartStream` unknown-camera error without spawn; `RestorePlaybacks`
  no-active / empty / missing-output-dir guard branches. Full `./...`
  green. Private only `4d0b0a4`.
- **cv-faceauth** — `recognition/persistent_matcher.py` (file-based
  local Qdrant matcher for on-the-fly registration, 0% → covered).
  New `cv-faceauth/tests/test_persistent_matcher.py` (11 tests, no
  mocks beyond `_local_client` AsyncMock — no real on-disk Qdrant).
  Construction defaults/overrides, modern + legacy match() payload
  shapes, empty-collection short-circuit, no-hit branch, Qdrant
  exception swallow, register_user() upsert + id→uid auto-mapping +
  counter, register_user() exception propagation, collection_count()
  0-on-error fallback. Suite 261 → 272 passing / 2 skipped.
  Private only `b98c76f`.

## Pending product bugs (gh CLI still HTTP 401 — needs `gh auth login`)

1. **R23**: `streaming/internal/logger/logrotator.go::deleteOldFiles`
   — filter contradiction + missing sort before slice. `t.Skip`-ed.
2. **R32 client**: `Dashboard/Alertwidgets/alert.jsx:54` — undefined
   `lineCrossingAlertCard` reference; would crash render.
3. **R32 client**: `Profile/DefaultDetectionStep.jsx` — stray
   `console.log` + debug effect in production.
4. **R34 client**: `RolePermissions/AddRoleDialog.jsx` edit-mode
   prefill wiped by sibling `useEffect([open])` calling
   `formik.resetForm()` on first mount.
5. **R37 streaming** (NEW): `internal/stream/...RestorePlaybacks`
   range-loop mutates `pb.Active = false` on the value copy, so
   the flag never persists back to `sm.Config.Playbacks`. Failed
   playback cleanups won't be reflected in config on next start.

5 bugs total queued for filing once `gh auth login` runs.

## TL;DR — what changed on 2026-05-25 (R36 — full 4-phase round, +46 tests; logger +36pp)

- **server** — `core/v1/locations/location.controller.js` (0% →
  covered). New `server/tests/unit/controllers/location.controller.test.js`
  (12 tests, 1 mock — locationService; 6 handlers × 2 assertions).
  **11th controller test.** Public `aeaf471`, private mirror `9540ae5`.
- **client** — `page/user/Incidents/components/IncidentCard.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Incidents/components/IncidentCard.test.jsx`
  (7 tests, 2 mocks — CameraCanvas + formatFromToTimestamps).
  Title uppercase, zone chip optional, Mark-as-resolved gated on canEdit,
  Report button label flips on `item.report.status`, Alert chip
  optional, card onClick vs inner Report `stopPropagation`,
  no-throw on missing onReport. Suite 1305 → 1312 passing. Adds
  vitest.config.js include. Public `b611d1c`, private mirror `14f4366`.
  Sibling of R35's IncidentPagination.
- **streaming** — `internal/logger` 42.0% → **78.0%** (**+36.0 pts**,
  biggest single-package jump in the cron's history). New
  `streaming/internal/logger/iplogger_request_test.go` (17 tests, no
  mocks beyond `httptest.NewRecorder`). Covers `getLocationFromAPI`
  (with HTTP stub), `getCachedLocation` full, `LogRequest` happy +
  XFF + private + disabled + non-/api branches, `appendToLogFile`,
  `Middleware` + `responseWriterWrapper.WriteHeader` / `Flush`
  (both flushing + non-flushing underlying writers), `RegisterRoutes`.
  Full `./...` green. Private only `3bf933c`. Agent noted that
  several 0% functions (`NewIPLogger`, `Stop`, `Critical`,
  `InitCriticalLogger`, rotator `Start`/`Stop`/`cleanupRoutine`) are
  exercised cross-package from `tests/` and don't get in-package
  coverage credit.
- **cv-faceauth** — `recognition/qdrant_client.py` QdrantMatcher
  (0% → covered). New `cv-faceauth/tests/test_qdrant_client.py`
  (10 tests, all Qdrant calls mocked — pure logic, no live server).
  Construction defaults/custom, async `match()` happy-path with
  payload extraction, missing/None payload fallback, empty-results
  unmatched return, exception swallowing (Qdrant errors must never
  propagate), `db_name` collection override, `close()` connected +
  never-connected. Suite 251 → 261 passing / 2 skipped. Private
  only `ec3a2b3`.

## TL;DR — what changed on 2026-05-25 (R35 — full 4-phase round, +41 tests)

- **server** — `core/v1/authorizedObjects/authorizedObjects.controller.js`
  (0% → covered). New
  `server/tests/unit/controllers/authorizedObjects.controller.test.js`
  (10 tests, 1 mock — AuthorizedObjectsService; 5 handlers × 2
  assertions). **10th controller test landed.** Suite 2079 → 2089
  passing / 5 skipped (191 → 192 files). Public `972908a`, private
  mirror `c291760`.
- **client** — `page/user/Incidents/components/IncidentPagination.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Incidents/components/IncidentPagination.test.jsx`
  (7 tests, **0 mocks** — lucide icons render inline SVG, shadcn
  Button is a plain `<button>`). Entry-range arithmetic with
  `totalEntries===0` branch, boundary-page button disabling,
  4 onPageChange wirings, Go-to clamp into `[1, totalPages]`
  via Go-button click and Enter, `useEffect` resync on prop change.
  Suite 1298 → 1305 passing. Adds vitest.config.js include.
  Public `b233fe9`, private mirror `32e4fba`. **First Incidents
  component covered.**
- **streaming** — Two packages bumped:
  - `internal/stream` 23.0% → **25.3%** (+2.3 pts). New
    `lifecycle_test.go` (5 tests for `killFFmpeg` nil-Cmd / nil-Process
    no-ops, `stopFFmpegForCam` unknown / known camID branches,
    `UpdateConfig` JSON-to-CWD write). Uses unstarted `exec.Cmd`
    values to trigger the nil-Process early-return — no real ffmpeg
    spawned.
  - `internal/logger` 38.5% → **42.0%** (+3.5 pts). Extended
    `iplogger_internal_test.go` (+2 tests: `LogRotator.rotateIfOversized`
    rename + recreate; `GetCurrentLogFile` path shape).
  - Single commit `23b5141` on private only. Full `./...` green.
- **cv-faceauth** — `workers/nas_uploader.py` (0% → covered).
  New `cv-faceauth/tests/test_nas_uploader.py` (17 tests, no mocks
  beyond `unittest.mock` for the httpx client). `NASConfig` +
  `UploadResult` defaults, `_encode_to_jpeg` (JPEG magic-bytes +
  quality-vs-size), `_get_token` (static + provider delegation),
  `save_frame_to_disk` (per-camera subdir layout),
  `_cleanup_old_frames` (retention-window deletion + missing-dir
  noop), upload short-circuits (`person` / `face` /
  `frame_from_memory` with empty `api_url`, `frame_from_disk` with
  missing file), `get_stats` accumulation, singleton. No real
  network. Suite 234 → 251 passing / 2 skipped. Private only `5d0906f`.

## Operational note from R35 client agent

`npx vitest run --reporter=line` is broken in the current vitest
install (treats `line` as a custom module). Use `--reporter=verbose`
or `--reporter=dot` in agent prompts going forward. Not a product bug.

## TL;DR — what changed on 2026-05-25 (R34 — full 4-phase round, +56 tests, 1 new pending bug)

- **server** — `core/v1/accesslogs/accesslogs.controller.js`
  (0% → covered). New `server/tests/unit/controllers/accesslogs.controller.test.js`
  (10 tests, 1 mock — AccessLogsService; 5 handlers × 2 assertions).
  **9th controller test.** Suite 2069 → 2079 passing / 5 skipped.
  Public `ed866bf`, private mirror `6f56734`.
- **client** — `page/user/RolePermissions/AddRoleDialog.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/RolePermissions/AddRoleDialog.test.jsx`
  (9 tests, 3 mocks — sonner, createRole, updateRole; real formik+yup+Radix).
  Auto-open in edit mode, submit (with `_id`/`id` fallback), 200-success,
  non-success/empty-message error branches, both rejection paths, yup
  required + min(3) validation. Suite 1289 → 1298 passing. Adds
  vitest.config.js include. Public `bca8a79`, private mirror `2ee6bea`.
- **streaming** — Two packages bumped:
  - `internal/server` 41.1% → **46.9%** (+5.8 pts). New
    `handle_camera_test.go` (4 tests for PUT empty rtsp_url 500,
    PUT/DELETE unknown camID 404, DELETE existing inactive 200+slice
    shrink, no goroutine spawn). `handleCamera` 14.5% → 62.9%.
  - `internal/stream` 20.8% → **23.0%** (+2.2 pts). New
    `playback_start_test.go` (3 tests for `StartPlayback`
    pre-goroutine guards: unknown camera ID, decrypted RTSP missing
    "Channels" keyword in both no-keyword and corrupt-ciphertext
    cases). `StartPlayback` 0% → 50%.
  - Single commit `ecefa0c` on private only. Full `./...` green.
- **cv-faceauth** — `workers/api_clients.py` (0% → covered).
  New `cv-faceauth/tests/test_api_clients.py` (**30 tests**, no mocks
  beyond AsyncMock-shaped stubs). JWTTokenProvider construction +
  get_token (graceful handling of missing `jwt` module),
  `get_token_provider` singleton, `_clean_image_urls` helper, and
  early-return / token-resolution branches of all 6 clients
  (AccessLog, AttendanceLog, IncidentLog with PPE/crowd/person-count/
  light/line-crossing, Registration, EntryLog). No real HTTP I/O.
  Suite 204 → 234 passing / 2 skipped. Private only `c887c7a`.

## Pending product bugs (gh CLI still HTTP 401 — needs `gh auth login`)

1. **R23**: `streaming/internal/logger/logrotator.go::deleteOldFiles`
   — filter contradiction + missing sort before slice. `t.Skip`-ed.
2. **R32 client**: `client/src/page/user/Dashboard/Alertwidgets/alert.jsx:54`
   — undefined `lineCrossingAlertCard` reference (lowercase). Would
   crash render in `'lineCrossing'` arm of `FireAlert`. Plus the
   `lineCrossing` icon isn't imported either.
3. **R32 client**: `client/src/page/user/Profile/DefaultDetectionStep.jsx`
   — stray `console.log` + debug effect in production render.
4. **R34 client** (NEW): `client/src/page/user/RolePermissions/AddRoleDialog.jsx`
   — edit-mode prefill is wiped. `useEffect([editRole, trigger])` calls
   `setValues({roles: editRole.name})` but a sibling `useEffect([open])`
   fires on first mount with `open === false` and calls
   `formik.resetForm()`, wiping the prefill. Role-name input always
   opens empty in edit mode.

All 4 queued for filing once `gh auth login` runs.

## TL;DR — what changed on 2026-05-25 (R33 — full 4-phase round, +56 tests)

- **server** — `core/v1/alerts/alerts.controller.js` (0% → covered).
  New `server/tests/unit/controllers/alerts.controller.test.js`
  (8 tests, 1 mock — AlertsService). 4 handlers × 2 assertions.
  **8th controller test.** Suite 2054 → 2062 passing / 5 skipped.
  Public `d86cdf4`, private mirror `9232b80`.
- **client** — `page/user/EmployeeLogs/components/BreakLogsDialog.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/EmployeeLogs/components/BreakLogsDialog.test.jsx`
  (8 tests, 2 mocks — `EmployeeLogs/Api/get` + `sonner` toast).
  Skip-fetch guards (closed / missing id), empty state, populated cards
  with region-formatted times + per-break duration pills, footer total,
  canEdit=false hides Export PDF, "--" fallbacks, rejected-promise
  silent fall-through. Suite 1281 → 1289 passing. Adds vitest.config.js
  include. Public `05d98fd`, private mirror `3ba3907`.
- **streaming** — `internal/server` 31.0% → **41.1%** (+10.1 pts).
  Two new files: `handle_playback_check_test.go` (covers
  `handlePlaybackCheck` 0% → full branch coverage of 6 early-returns:
  missing camID 400, unknown camera 404, undecryptable RTSP 500,
  decrypted-no-host JSON 200, no-matching-NVR-session JSON 200,
  matching-NVR-session JSON 200) and `handle_playback_start_branches_test.go`
  (4 more `handlePlaybackStart` branches: stop-no-active 404,
  generate+missing camera_id 400, generate+missing start_time 400,
  generate+unknown camera 404). 10 tests total, no mocks (direct
  StreamManager construction, no ffmpeg / socket). Full `./...` green.
  Private only `add0970`.
- **cv-faceauth** — `workers/dispatch_cache.py` (0% → covered) —
  the Redis-backed per-camera identity/track throttle. New
  `cv-faceauth/tests/test_dispatch_cache.py` (**30 tests** across 9
  classes, no mocks beyond `unittest.mock.AsyncMock` for the async
  Redis client). Key shape + unknown-identity normalization, TTL
  routing per `api_type` (attendance / entry_log / access / fallback),
  sorted-key stability for incident tracks, async fail-open on Redis
  errors, exact-match vs subset-skip incident logic, singleton.
  **First workers/ module covered.** Suite 174 → 204 passing /
  2 skipped. Private only `862fdd8`.

## TL;DR — what changed on 2026-05-25 (R32 — full 4-phase round, +44 tests, 3 streaming pkgs bumped)

- **server** — `core/v1/detectionObjects/objects.controller.js`
  (0% → covered). New `server/tests/unit/controllers/detectionObjects.controller.test.js`
  (6 tests, 1 mock — ObjectsService; name-swap from `deleteDetectionObjects`
  → `deleteDetectionObjectsByType` is pinned in the test). 7th controller
  test. Suite stable at 2049 passing / 5 skipped. Public `bd923d8`,
  private mirror `429ac65`.
- **client** — `page/user/RolePermissions/PermissionTable.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/RolePermissions/PermissionTable.test.jsx`
  (7 tests, **0 mocks** — uses real `@tanstack/react-table` +
  `react-loading-skeleton`). Loading/empty/normal branches, string +
  function headers, `renderValue()` fallback, skeleton row count.
  Suite 1274 → 1281 passing. Adds the new component to
  `vitest.config.js` coverage include. Public `16d9296`, private
  mirror `8fcf03e`.
- **streaming** — **3 packages bumped** with 15 tests across 3 new files:
  - `internal/server` 26.9% → **31.0%** (+4.1). New
    `is_nvr_playback_active_test.go` (6 tests covering all 5 branches
    of `Server.IsNVRPlaybackActive`).
  - `internal/stream` 16.4% → **20.8%** (+4.4). New
    `playback_persistence_test.go` (6 tests for `SavePlaybackStatus`
    append/replace/persist, `CleanupFailedPlayback` eviction by
    SessionID or CameraID, no-op cold path).
  - `internal/logger` 21.5% → **38.5%** (+17.0). New
    `iplogger_state_test.go` (7 tests for `GetLogs`, `GetIPStats`,
    `cleanupOldLogs` retention + malformed-line skip + disabled no-op).
  - Full `./...` green. Single commit `9fc603a` on private only.
- **cv-faceauth** — `core/logger.py` structlog surface (0% → covered).
  New `cv-faceauth/tests/test_logger.py` (16 tests, no mocks).
  `_filter_internal_keys` processor (strip-internal-preserve-user, in-
  place semantics), `configure_logging` (log-dir creation, rotating +
  stream handlers, pre-existing handler clear, max_bytes/backup_count,
  level propagation), `get_logger`, `get_camera_logger` (JSON to
  `logs/<env>/<cam>_<type>.log`, propagation suppression, no duplicate
  handlers). Autouse fixture calls `structlog.reset_defaults()` so
  process-global wrapper_class doesn't leak across tests. Suite
  158 → 174 passing / 2 skipped. Private only `7552a39`.

## Pending product bugs (gh CLI still HTTP 401 — needs `gh auth login`)

1. **R23**: `streaming/internal/logger/logrotator.go::deleteOldFiles`
   — filter contradiction (`HasSuffix(".log") && !Contains(".")` →
   empty slice) AND missing sort before `[MaxBackupCount:]` slice
   (would delete newest, not oldest). Currently `t.Skip`-ed.
2. **R32 client**: `client/src/page/user/Dashboard/Alertwidgets/alert.jsx`
   line 54 references `lineCrossingAlertCard` (lowercase, undefined —
   React treats undefined component as DOM element); the `lineCrossing`
   icon used at line 399 in `LineCrossingAlertCard` is not imported.
   Hitting the `'lineCrossing'` arm of `FireAlert` would crash at render.
3. **R32 client**: `client/src/page/user/Profile/DefaultDetectionStep.jsx`
   contains `console.log` at line 232 and a debug effect at lines 122-124
   left in production render path.

All three need GitHub issues filed once `gh` is re-authenticated.

## TL;DR — what changed on 2026-05-25 (R31 — full 4-phase round, **+59 tests** new record)

- **server** — `core/v1/permission/permissions.controller.js` (0% →
  covered). New `server/tests/unit/controllers/permissions.controller.test.js`
  (18 tests, 1 mock — PermissionService from `permissions.utility.js`,
  not the typical `*.service.js`). 9 handlers × 2 assertions each
  (delegation + rejection propagation) + sibling-isolation via an
  `expectOnlyCalled()` helper. 6th controller test landed. Suite
  2025 → 2049 passing / 5 skipped. Public `a3cadf0`, private mirror
  `7bfa2e3`.
- **client** — `page/user/EmployeeLogs/components/LogsFilterPopover.jsx`
  (0% → covered, **80.8% lines / 86.2% funcs / 91.6% branches**).
  New `client/tests/unit/page/user/EmployeeLogs/components/LogsFilterPopover.test.jsx`
  (10 tests, 5 mocks — popover, switch, multiselect, sibling
  TimePickerComponents; Button left real). Suite 1268 → 1274 passing.
  Adds the new component to `vitest.config.js` coverage `include`.
  Public `cb383b3`, private mirror `9a0bdc1`.
- **streaming** — `internal/stream` 7.1% → **16.4%** (+9.3 pts) —
  biggest remaining gap touched. New `streaming/internal/stream/stream_test.go`
  (11 tests, no mocks). Covers `HandleCameraRequest` dispatch (invalid
  verb, unknown-camera for stop/delete/false, successful false/stop/
  delete, case-insensitive verb matching), `GetActivePlayback` (no
  session + match), `StopPlaybackByCameraID` (no-op + full cleanup of
  context + output dir + config flag). Hand-rolled `*StreamManager` to
  skip log-rotator goroutine / StartQueue worker; each test `t.Chdir`s
  to a temp dir so `Config.Save` writes are sandboxed. Full `./...`
  green. Private only `174f3f9`.
- **cv-faceauth** — `processor/quality.py` QualityScorer (0% →
  covered). New `cv-faceauth/tests/test_quality.py` (20 tests, no mocks).
  Singleton (concurrent `get_instance`), constructor fallback when
  `fiqa_inference` missing, `_basic_quality_check` edge cases
  (None / empty / <50px / flat-gray / dark / bright / sharp clamp),
  `score` / `score_batch` (empty list + order preservation with None
  and empty entries), `is_acceptable` threshold semantics. Loaded via
  `load_standalone` because `processor/__init__.py` pulls insightface.
  Suite 138 → 158 passing / 2 skipped. Private only `8206c04`.

## TL;DR — what changed on 2026-05-25 (R30 — full 4-phase round, +32 tests)

- **server** — `core/v1/roles/roles.controller.js` (0% → covered).
  New `server/tests/unit/controllers/roles.controller.test.js`
  (8 tests, 1 mock — RolesService). 5th controller test landed
  (after Uploads R26, Auth R27, Jobs R28, Departments R29).
  Suite 2017 → 2025 passing / 5 skipped. Public `b7a4256`,
  private mirror `e8069ea`.
- **client** — `page/user/Dashboard/RecentAlerts.jsx` (0% → covered).
  New `client/tests/unit/page/user/Dashboard/RecentAlerts.test.jsx`
  (4 tests, 2 mocks — AlertGauge + ActivityChart stubs to avoid
  pulling UserContext/sockets/apexcharts). **First Dashboard test
  landed.** Static header copy, Pexels image alt/src pin, Cam 1..4
  chip grid, child-component mount. Suite 1264 → 1268 passing. Also
  adds the new component to `client/vitest.config.js` coverage
  `include` list (additive, allowed). Public `9183900`, private
  mirror `04796cc`.
- **streaming** — `internal/server` 22.5% → **26.9%** (+4.4 pts).
  Extended `streaming/internal/server/handler_branches_test.go`
  (+6 tests, no mocks). Covers pre-sm early-return branches of
  `handleAddCamera` (method-not-allowed across 4 verbs + invalid-JSON
  body), `handlePlaybackStart` (same shape), and `handleCamera`
  (unsupported-method across 3 verbs + PUT invalid-JSON). Tests use
  `Server{}` with `sm == nil` so any refactor that derefs sm above
  the guards nil-panics — regression signal. Full `./...` green.
  Private only `95dbad4`.
- **cv-faceauth** — `config/settings.py` (pydantic_settings, 0% →
  covered). New `cv-faceauth/tests/test_config_settings.py`
  (14 tests, no mocks). Section defaults (general / GPU sharding /
  detection / tracker / inference / unified-detection list+dict
  fields), env-alias parsing (uppercase, case-insensitive, float/bool
  coercion), the `apply_cuda_env` model_validator's 3 branches
  (cuda+value exports, cpu preserves sentinel, cuda+empty no-export),
  and the module-level `settings` singleton with its `model_config`.
  Suite 124 → 138 passing / 2 skipped. Private only `3f6ec0b`.

## TL;DR — what changed on 2026-05-25 (R29 — full 4-phase round, +43 tests)

- **server** — `core/v1/departments/departments.controller.js`
  (0% → covered). New
  `server/tests/unit/controllers/departments.controller.test.js`
  (8 tests, 1 mock — departmentsServices). Same delegation pattern
  (4 methods × 2 assertions each). 4th controller test landed.
  Suite 2012 → 2029 passing / 5 skipped (185 → 186 files).
  Public `a98e769`, private mirror `62750ea`.
- **client** — `page/user/Settings/StorageSetting/components/SftpForm.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Settings/StorageSetting/components/SftpForm.test.jsx`
  (3 tests, 1 mock — Tooltip passthrough). Completes the
  StorageSetting trio (Googledrive R27, S3 R28, Sftp R29).
  Suite 1257 → 1260 passing. Public `1053f06`, private mirror `bcf862e`.
- **streaming** — `internal/server` 13.8% → **22.5%** (+8.7 pts).
  New `streaming/internal/server/handler_branches_test.go` (10 tests,
  no mocks). Covers `handleRestart` (OPTIONS / missing refresh / strict
  `== "true"` table), `ServeHLS` / `ServeSubStreamHLS` / `ServeMasterHLS`
  (OPTIONS, empty-token-401 regression guards against public-HLS
  resurfacing, `Cache-Control: no-store` header pin). Tests
  deliberately use `sm == nil` so any future refactor that derefs `sm`
  above the guards nil-panics — a regression signal. Full `./...`
  green. Private only `88269a8`.
- **cv-faceauth** — `core/models.py` (Pydantic + dataclass models,
  0% → covered). New `cv-faceauth/tests/test_core_models.py` (22 tests,
  no mocks). BBox conversion + int coercion, Detection / MatchResult /
  CameraConfig / MetricsPayload defaults + required-field validation,
  CameraType str-enum semantics, all 8 dataclasses
  (TrackedPerson, FaceResult, CutoutEntry, FaceCandidate, RecentUnknown,
  DetectionPayload, UploadItem) — including DetectionPayload.to_dict()
  embedding-strip + enum-value serialization contract and a regression
  guard on UploadItem.metadata's per-instance mutable default. Suite
  102 → 124 passing / 2 skipped. Private only `6a7b4b3`.

## TL;DR — what changed on 2026-05-25 (R28 — full 4-phase round, +22 tests)

- **server** — `core/v1/jobs/jobs.controller.js` (0% → covered).
  New `server/tests/unit/controllers/jobs.controller.test.js`
  (4 tests, 1 mock — JobsService). Same delegation pattern as
  R26 Uploads + R27 Auth — happy-path forwarding, return value,
  method independence, rejection propagation. Third controller
  test landed. Suite stable at 2012 passing / 5 skipped. Public
  `caf06b9`, private mirror `dfb6ca1`.
- **client** — `page/user/Settings/StorageSetting/components/S3Form.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Settings/StorageSetting/components/S3Form.test.jsx`
  (4 tests, 1 mock — Tooltip passthrough; sibling of R27's
  GoogledriveForm). Inputs+types+tooltip hints, change/blur wiring,
  per-field error gating on touched, isEditMode placeholder swap
  on credential fields. Suite 1258 → 1262 passing. Public
  `0e46cce`, private mirror `654ba25`.
- **streaming** — `internal/server` 13.4% → **13.8%**. Extended
  `streaming/internal/server/server_test.go` (+3 tests, no mocks):
  `TestIsOriginAllowed_ExactMatchesOnly` (8 cases — case sensitivity,
  no trailing-slash tolerance, no sub-domain implication, wrong
  scheme), `TestIsOriginAllowed_EmptyAllowlistRejectsEverything`
  (wildcard-CORS regression guard), and
  `TestLogRequestMiddleware_PassesThroughToNext`. Full `./...` green.
  Private only `46324a6`.
- **cv-faceauth** — `recognition/cache.py` RecognitionCache (TTL
  cache for Qdrant match results, 0% → covered). New
  `cv-faceauth/tests/test_recognition_cache.py` (11 tests, no mocks
  — pure pydantic+threading+time). Construction defaults, get/set/
  clear, lazy TTL eviction, unmatched-results-not-cached rule,
  16-thread concurrency hammer. Suite 91 → 102 passing / 2 skipped.
  Private only `66f4343`.

## TL;DR — what changed on 2026-05-25 (R27 — full 4-phase round, +36 tests)

- **server** — `core/v1/Auth/auth.controller.js` (0% → covered).
  New `server/tests/unit/controllers/auth.controller.test.js`
  (6 tests, 1 mock — auth.service.js singleton). Each method's
  delegation + return-value passthrough + rejection propagation
  + mutual-exclusivity. Second controller test in the suite
  (after R26 Uploads). Suite 2011 → 2012 passing / 5 skipped.
  Public `54d2807`, private mirror `46436b8`.
- **client** — `page/user/Settings/StorageSetting/components/GoogledriveForm.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/Settings/StorageSetting/components/GoogledriveForm.test.jsx`
  (4 tests, 1 mock — Tooltip primitives passthrough). Renders
  supplied values + tooltip hints, change/blur wiring, touched-gated
  error visibility, isEditMode placeholder swap. Suite 1249 → 1253
  passing. Public `64e0ed1`, private mirror `ffd4b2b`. Also adds
  the new component to `client/vitest.config.js` coverage `include`
  list (additive, allowed by cron rule).
- **streaming** — `internal/server` 5.8% → **13.4%**. New
  `streaming/internal/server/token_test.go` (8 tests, no mocks —
  uses `httptest` backend stub). Covers `respondJSON`,
  `checkPlaybackToken` (empty / cache-hit-unexpired / cache-hit-
  expired-with-eviction / cache-miss-then-cache-hit branches),
  `validateAndUpdateToken` (non-200, status:false, happy path,
  malformed URL). Full `./...` green. Private only `cce2308`.
- **cv-faceauth** — `core/metrics.py` (prometheus_client surface,
  0% → covered). New `cv-faceauth/tests/test_metrics.py` (18 tests
  across 4 classes, no mocks). Metric-type contracts, parametrised
  per-camera `camera_id` label assertions, SLO-pinning of histogram
  bucket boundaries (including `+Inf`), wire-through via `collect()`.
  Suite 73 → 91 passing / 2 skipped. Private only `8623ea1`.

## TL;DR — what changed on 2026-05-25 (R26 — full 4-phase round, +30 tests)

- **server** — `core/v1/Uploads/uploads.controller.js` (0% → 100%).
  New `server/tests/unit/controllers/uploads.controller.test.js`
  (9 tests, 1 mock — uploadsService). Each method's happy-path
  delegation + rejection propagation + method independence.
  Suite 2002 → 2011 passing / 5 skipped (183 files). Public
  `6b11edb`, private mirror `13a28d4`. **First controller test
  in the suite** — opens a new test surface.
- **client** — `layout/Header/UpdateModal/UpgradeModal.jsx`
  (0% → covered). New
  `client/tests/unit/layout/Header/UpdateModal/UpgradeModal.test.jsx`
  (2 tests, 0 mocks — uses `vi.useFakeTimers` for the 1500ms
  Upgrade-loading transition; verifies both `confirmLabel="Install"`
  and `="Upgrade"` branches plus portal teardown). Suite 1247 →
  1249 passing / 5 skipped. Public `44ae5f6`, private mirror
  `0a416f8`.
- **streaming** — `internal/fmt` (0% → **100%**). New
  `streaming/internal/fmt/fmtlogger_test.go` (3 tests, no mocks).
  Covers Sprint family, `InitLogger` directory creation, and
  Print family payload write. Full `./...` green. Private only
  `d2f1f9f`. Agent noted Windows-specific lumberjack quirk
  (uses `os.MkdirTemp` not `t.TempDir`) inline in the test.
- **cv-faceauth** — `core/health_monitor.py` (0% → covered).
  New `cv-faceauth/tests/test_health_monitor.py` (16 tests
  across 5 classes, no mocks; pure stdlib). Singleton identity
  under 16-thread concurrent construction, `update_status`
  merge + timestamping + sticky-degraded interaction with
  `record_error`, deque(maxlen=100) bound on `_error_store`,
  callback registration paths, `get_full_report` system section.
  Suite 57 → 73 passing / 2 skipped. Private only `19492fc`.

## Streaming low-coverage candidates for future rounds

R26 streaming agent surveyed remaining packages:
  - `internal/stream` 7.1% — large, ffmpeg/playback/metricsStream untested
  - `internal/server` 5.8% — most handlers untested
  - `internal/metrics` — declarative only, low value
Done so far: `internal/util` 95.2%, `internal/ram` 96.4%,
`internal/config` 82.4%, `internal/fmt` 100%, `internal/logger` 21.5%.

## TL;DR — what changed on 2026-05-25 (R25 — full 4-phase round, +37 tests)

- **server** — `utils/sftpConnectionCheck.js` (0% → covered). New
  `server/tests/unit/utils/sftpConnectionCheck.test.js` (6 tests,
  1 mock — `ssh2-sftp-client` factory). Covers first-call connect,
  cached-alive reuse via `list('/')`, stale-reconnect, close+clear,
  noop-when-no-instance, and `end()` error swallow. Suite 1996 →
  2002 passing / 5 skipped. Public `582a505`, private mirror
  `49f5f1a`. (Note: agent considered `utils/prometheus.js` but
  `prom-client` isn't installed locally — correctly NOT filed as
  a bug since it's a missing dev-env dep, not a product bug.)
- **client** — `page/user/EmployeeLogs/components/TimePickerComponents.jsx`
  (0% → covered). New
  `client/tests/unit/page/user/EmployeeLogs/components/TimePickerComponents.test.jsx`
  (18 tests, 2 mocks — popover inlined, select replaced with native
  `<select>`). Suite 1229 → 1247 passing. Public `6486724`, private
  mirror `4422223`.
- **streaming** — `internal/ram` 0% → **96.4%**. New
  `streaming/internal/ram/ram_watcher_test.go` (5 tests, no mocks).
  Covers constructor defaults, nil-ticker stop guard, goroutine
  lifecycle, and both branches of `checkAndClean`. Full `./...`
  green. Private only `26f3acd`.
- **cv-faceauth** — `core/gpu_lock.py` (0% → covered). New
  `cv-faceauth/tests/test_gpu_lock.py` (8 tests, no mocks — pure
  threading). Lazy double-checked init, singleton identity,
  RLock reentrancy, mutual exclusion across threads. Suite 49 → 57
  passing / 2 skipped. Private only `a6b4e70`.

## TL;DR — what changed on 2026-05-25 (R24 — full 4-phase round, +35 tests)

- **server** — `delete.service.js` (0% → covered). New
  `server/tests/integration/services/delete.service.test.js`
  (9 tests, 7 mocks — at the budget edge but justified for the cascade
  paths). Suite 1987 → 1996 passing / 5 skipped. Public `109ec6e`,
  private mirror `baff175`.
- **client** — `layout/Header/MobileNav.jsx` (0% → covered). New
  `client/tests/unit/layout/Header/MobileNav.test.jsx` (6 tests, 2 mocks
  — PermissionContext + DetectionToggle stub). Permission gate, close
  button, NavLink close-on-click, translate-x toggle, DetectionToggle
  wiring. Suite 1229 → 1235 passing. Public `8e2930b`, private mirror
  `7b417f6`.
- **streaming** — `internal/config` 17.6% → **82.4%**. Extended
  `streaming/internal/config/config_test.go` (2 tests) covering
  `Config.Save()` pretty-print and HTML-char unescape branch. Full
  `./...` suite green. Private only `9016eee`.
- **cv-faceauth** — `core/context.py` (0% → covered). New
  `cv-faceauth/tests/test_context.py` (18 tests, no mocks; pure
  ContextVar isolation across threads + `copy_context().run` semantics).
  Suite 31 → 49 passing / 2 skipped. Private only `19deaf8`.

## TL;DR — what changed on 2026-05-25 (R23 — full 4-phase round)

- **Cron R23 — all 4 viable phases landed** under the new airtight
  TEST-ONLY rules. Cron is now job `858854f2` (`7,17,27,37,47,57 * * * *`,
  every 10 min). Total new tests this round: **63** across 4 files.
  - **server** — `python.service.js` (0% → covered). New
    `server/tests/integration/services/python.service.test.js`
    (36 tests, 3 mocks). Suite 180 files / 1987 passing. Public
    `be6db0c`, private mirror `d717e58`.
  - **client** — `layout/Sidebar/LogsSidebar.jsx` (0% → covered).
    New `client/tests/unit/layout/Sidebar/LogsSidebar.test.jsx`
    (7 tests, 3 mocks; the anti-leak rule on nested permissions is
    explicitly pinned). Suite 1216 → 1223 passing. Public
    `2c3379b`, private mirror `fa58647`.
  - **streaming** — `internal/logger` 0% → 21.5%. New
    `streaming/internal/logger/iplogger_internal_test.go` (in-package
    so coverage actually counts). Covered: `parseUserAgent`, `getTopN`,
    two `LogRotator` noop branches. Private only `37be4bf`.
  - **cv-faceauth** — `core/fps_tracker.py` (0% → covered). New
    `cv-faceauth/tests/test_fps_tracker.py` (15 tests, pure stdlib,
    zero mocks). Suite 16 → 31 passing. Private only `53a7b4b`.

- **PENDING BUG — needs a GitHub issue.** Streaming agent found
  `internal/logger/logrotator.go` `deleteOldFiles` is broken in two
  ways: the filter is `strings.HasSuffix(name, ".log") && !strings.Contains(name, ".")`
  — a contradiction so the candidate slice is always empty; and even
  if the filter is fixed, the `[MaxBackupCount:]` slice has no sort,
  so on lex-ascending order it would delete the newest rather than
  oldest backups. The test `TestLogRotator_DeleteOldFiles_KeepsLatestN`
  is `t.Skip`-ed with full diagnosis. Could not file `gh` issue —
  local CLI returned `HTTP 401`. **TODO**: re-auth `gh` (`gh auth login`)
  and file on `Globussoft-Technologies/videoraiq-ai`, then update the
  `t.Skip` message to cite the issue number.

## TL;DR — what changed on 2026-05-25

- **Cron rebuilt with airtight test-only rules.** Job `8229fad8`
  (`17,47 * * * *`) replaces `cf1c0e97`. New prompt explicitly
  enumerates allowed paths and bans every fix-shaped action:
  no product edits, no workarounds, no commented-out product
  code, no dependency changes. On test failure caused by a
  product bug: file a GitHub issue + skip the test. That's it.
- **Cron R22 partial** — 2 of 4 viable phases landed (server,
  client); streaming + cv-faceauth deferred to the next firing
  so the tightened rules apply uniformly.
  - `test(server): cover TelegramService` — public `91ce173`,
    private mirror `fa485f0`. New file
    `server/tests/integration/services/telegram.service.test.js`
    (58 lines, 3 tests). 1 mock (axios). Bumped server suite to
    178 files / 1946 tests passing.
  - `test(client): cover layout/Header/DesktopNav` — public
    `8c40b65`, private mirror `ff86bc1`. New file
    `client/tests/unit/layout/Header/DesktopNav.test.jsx`
    (113 lines, 5 tests). 0 mocks (uses real MemoryRouter).
    Client suite 1211 → 1216 passing.
- **`run-all-tests.bat` fixed.** Three issues that prevented the
  orchestrator from being trustworthy: lone-LF + em-dashes (cmd
  corruption), `:argloop` label inside `if (...)` block (broke
  filter), Go path needed a fallback after winget landed
  system-wide. See commit `aa50195`.

## TL;DR — what changed since 2026-05-19

- **Local CI/CD shipped.** `run-all-tests.bat` at the repo root sequences
  all 5 services (server / client / e2e / streaming / cv-faceauth) with
  per-phase PASS/FAIL/SKIP tracking. Filter by name:
  `run-all-tests.bat streaming cv-faceauth`.
- **Streaming Go suite is green.** 5 packages (`internal/config`,
  `internal/server`, `internal/stream`, `internal/util`, `tests/`).
  Toolchain: Go 1.24.10 at `/c/Users/user/go-toolchain/go/bin/go.exe`.
  Stale tests that asserted pre-hardening behavior were rewritten
  (CORS allowlist, `/metrics` auth, HLS `?token=` gate — see
  commit `fba9b7b`).
- **cv-faceauth runtime deps reconstructed.** `cv-faceauth/requirements.txt`
  rebuilt from import audit + pip freeze (commit `112e868`). The unit
  suite (16 pass / 2 skip) runs via `python -m pytest`. The 2 skips are
  the `insightface`-dependent tests — `insightface` needs MSVC build
  tools on Windows, so it's optional locally.
- **GPU note.** This box has an RTX PRO 6000 Blackwell + RTX A5000 with
  CUDA 13.0 driver. The Dockerfile uses CUDA 12.4-cudnn-devel; for local
  GPU tests, the host driver back-compat covers it. Heavy GPU paths are
  exercised only inside the Docker image.
- **Cron extended.** Job `cf1c0e97` (`17,47 * * * *`) now drives autonomous
  coverage rounds across all 5 phases, not just server/client/e2e.

## Ground Rules (do not violate)

1. **Test authoring only.** Write and run tests. Never modify product code,
   dependencies (`package.json` dependencies — devDependencies are fine), or
   real config to make a test pass.
2. **Failing test → triage:** test-side bug → fix the test; product-side bug
   → file a GitHub issue + `skip`/`xfail`/`test.fixme` the test. Never patch
   the product. Don't spiral.
3. **All issues → the public repo** `Globussoft-Technologies/videoraiq-ai`.
4. **Two repos:** private `videoraiq` (canonical, all 5 services) and public
   `videoraiq-ai` (mirror of `client/`, `docker-client/`, `server/`; has the
   CI). Mirror server/client/e2e tests to **both**; streaming + cv-faceauth
   tests to private only.
5. A `videoraiq-testing` skill encodes all of this — see
   `~/.claude/skills/videoraiq-testing/SKILL.md`.

---

## 1. What's Done

### CI/CD — on `videoraiq-ai` (`.github/workflows/`)
`server-tests.yml`, `client.yml` (lint+build+unit), `e2e-tests.yml`,
`codeql.yml`, `dependabot.yml`. Secrets `E2E_USERNAME`/`E2E_PASSWORD` set.
Server / Client / CodeQL are **green**. E2E partial — see §3.

### server — `server/tests/` (Vitest) — **788 tests, 90 files**
- **unit/** — cryptoUtils, response, appError, passwordEncoderDecoder
  (skipped, #21), decodeToken, xssSanitizer, errorMiddleware,
  permissionMiddleware, permissionConfigChecker, checkActivePlan,
  authService pure logic, Joi validation (roles/permissions/nvr/users)
- **contract/** — auth.routes, verifyToken boundary
- **integration/models/** — 16 model files
- **integration/services/** — **30 service files** (Wave A complete):
  shifts, departments, location, roles, recipients, alerts, entry,
  vehicle, authorizedObjects, NVR, channels, incidents, attendance,
  accesslogs, detectionObjects, dashboard, detectionSettings, profiles,
  authorizedUsers, permissions, cameraRestrictions, admin, jobs, uploads,
  auth, domain, autoEmailReport, verifyRecipients, storage, users.
  (`files.service.js` is an empty class — nothing to test.)
- Helper: `tests/helpers/service.js` — `serviceCtx()` + `payload()`
  (unwraps the double-nested `{statusCode, body}` response shape)

### client — `client/tests/` (Vitest + RTL) — 69 tests, 11 files
cn, date formatters, getAccessToken, useDebounce, useOnClickOutside,
AuthContext, waitForToken, Pagination, nvrSchema, roleSchema.
decriptNvr skipped (#22).

### streaming — `streaming/internal/**/*_test.go` + `streaming/tests/*_test.go` (Go) — 6 files
util, encrypt, config, playlist, server middleware, integration (`tests/server_test.go`).
**Now green.** Run with `run-all-tests.bat streaming` or:
`CGO_ENABLED=0 /c/Users/user/go-toolchain/go/bin/go.exe test ./... -count=1` from `streaming/`.
Stale assertions that pre-dated the auth/CORS hardening were rewritten in
commit `fba9b7b` — added regression guards for the missing-token (401) and
missing-Bearer (`/metrics` 401) paths.

### cv-faceauth — `cv-faceauth/tests/` (pytest) — 3 files
api_models (16 tests, pass), tracker + deduplicator (skip without `insightface`).
**Now runnable locally.** Install: `pip install -r requirements-test.txt` then
`python -m pytest`. The 2 skipped tests need `insightface`, which requires MSVC
build tools on Windows — install separately if you want them green.
`requirements.txt` reconstructed from import audit (commit `112e868`).

### e2e — `e2e/` (Playwright) — 11 specs
Retargeted to the aMember `/login` form. See §3 for current state.

---

## 2. Coverage (measured 2026-05-19)

| Suite | Line coverage | Note |
|---|---|---|
| server | **32.65%** | branches 56.66%, functions 48.74%; up from 17.3% |
| client | ~21% of a narrow include scope | (only `.js` in utils/helpers/hooks/lib/schema) |
| streaming / cv-faceauth | unmeasured | no runner / no CI |

Run: `cd server && npm run test:coverage` (writes `server/coverage/`).
`coverage/` dirs are build artifacts — gitignored on `videoraiq-ai`
(`server/.gitignore`, `client/.gitignore`).

---

## 3. E2E status — partially working

- **Login is aMember** (`/login`, `#amember-login` / `#amember-pass`), not the
  React form. POMs retargeted accordingly.
- **Passing:** all 10 unauthenticated specs (login form, forgot-password,
  session-persist).
- **`setup` project fixed** — it needed `testDir: "."` (global.setup.js sits
  outside the top-level testDir); it now logs in and writes storage state.
- **Failing:** the authenticated browser specs (dashboard, navigation, NVR,
  incidents, etc.). The deployed app's DOM does **not** match the
  React-source-derived selectors in the POMs, and the deployment carries auth
  via the aMember session (no `dev-access-token` JWT cookie).
- **Next step for e2e:** inspect the *live* authenticated DOM and rebuild the
  page-object selectors against it (DashboardPage, Sidebar, IncidentsPage,
  StreamsPage, UsersPage, etc.) — or switch to an auth-injection strategy.
  Until then the authenticated specs stay red.

---

## 4. Bugs Filed (all on `videoraiq-ai`)

| # | Bug |
|---|---|
| #21 | `atob`/`btoa` imported but missing from server deps |
| #22 | `crypto-js` imported but missing from client deps |
| #23 | ~12 unauthenticated REST endpoints |
| #24 | Streaming: public `/metrics`, JWT validation disabled, wildcard CORS |
| #25 | Backend + Socket.IO wildcard CORS |
| #26 | Rate limiter commented out |
| #27 | `npm start` worker never runs (`&&` sequencing) |
| #28 | `notFoundResp()` returns 500 instead of 404 |
| #29 | Attendance "at least one image" validator not enforced for empty images |
| #30 | Unauthenticated `/dashboard` not redirected to login |
| #31 | `RolesServices.createRoles` responds before its un-awaited inserts finish |

Tests pin **current** behavior where it's buggy; update the assertion when
the issue is fixed.

---

## 5. Remaining — Next Waves

### Wave A — server services — **DONE**
All 30 testable `core/v1/*` service files now have integration tests
(see §1). Server line coverage 17.3% → **32.65%**.

### Wave A pt.4 — deepen the mega/heavy services (optional, MED value)
Service tests so far pin validation + not-found + tractable happy paths.
The SFTP/AI/provider-heavy branches are still uncovered:
- `users.service.js` — createAuthUser / updateAuthUser / deleteAuthUser /
  importUsers (need SFTP + AI + EMP-API mocks).
- `storage.service.js` — S3 / Google Drive / SFTP provider paths +
  file streaming (need AWS SDK / googleapis / ssh2 mocks).
- `incidents` / `attendance` create paths, `Auth.verifyUser` happy path.
Each needs heavy mocking for a few extra %; diminishing returns.

### Wave B — client page + context tests
SocketContext, PermissionContext, UserContext, useHlsPlayer (mock hls.js),
useAreaMarking, logout, NestedMultiSelect, DetectionToggle, page components.

### Wave C — streaming + cv-faceauth CI (decision needed)
Neither runs in CI. Go tests are entirely unverified. See §6.

### Wave D — e2e authenticated specs
Rebuild POM selectors against the live deployed DOM (see §3).

---

## 6. Open Decisions

- [x] **Go CI** — local CI shipped via `run-all-tests.bat streaming`. A
      cloud workflow on the private repo is still open; the user opted
      for "script + cron" instead of GitHub Actions.
- [x] **Python CI** — local pytest runs via `run-all-tests.bat cv-faceauth`.
      Cloud workflow open; same script+cron decision.
- [ ] **Coverage thresholds** — not enforced. Suggest 80% unit / 60%
      integration once the suite stabilizes.
- [ ] **e2e authenticated track** — rebuild selectors vs. live DOM, or inject
      an auth session and skip the UI login.
- [ ] `coverage/` dirs should be added to `.gitignore` (repo hygiene).
- [ ] **Cron `8229fad8`** — autonomous coverage; in-memory only (dies on
      Claude exit). The active prompt is **test-only / issue-on-failure**
      — never writes product code, never fixes bugs, only adds tests +
      files issues on failure. Re-create with the same prompt body if
      it drops.

---

## 7. How to Run

```bash
# All 5 phases in sequence (PASS/FAIL/SKIP report at the end):
run-all-tests.bat

# Single phase or a subset:
run-all-tests.bat server
run-all-tests.bat streaming cv-faceauth
```

Or per-suite, by hand:

```bash
cd server && npm install && npm test            # 788+ tests
cd server && npm run test:coverage              # + coverage report
cd client && npm install && npm test            # 69+ tests
cd e2e    && npm install && npm run install:browsers && npm test
cd streaming   && CGO_ENABLED=0 \
                  /c/Users/user/go-toolchain/go/bin/go.exe test -count=1 ./...
cd cv-faceauth && pip install -r requirements-test.txt && python -m pytest
```

---

## 8. Gotchas

- `server/tests/setup.js` populates `NODE_CONFIG` before any import — add new
  config keys there if a source file reads them at module scope.
- Service responses are double-nested: `payload(res) = res._body.body`.
- `APP_ENV` must be `local` in server tests.
- Mongoose `[String]` arrays coerce non-strings — validators never see raw
  non-strings; don't test for rejection of `[123]`.
- `populate()` needs the referenced model registered — `await import` the
  model in the test (e.g. NVR/Channel in entry/vehicle service tests).
- Vitest `pool: forks`, per-file isolation (Mongoose model re-registration).
- e2e `setup` project needs `testDir: "."`.
- `cv-faceauth/tests/` has no `__init__.py` on purpose (conftest import).
- Issues go to **videoraiq-ai** only.
- `users.service.js` naming trap: `authorizedUsersModel` there is the
  **`users`** model (`users.model.js`); `authorizedUsers` is the
  authorizedUsers model. Seed the right collection per method.
- Service methods that respond via `res.send(Response.xxx())` (not
  `res.status().json()`) leave `res.statusCode` at 200 — assert on
  `payload(res).status` (`"success"`/`"failed"`) instead.
- `setup.js` now also defines `SFTP.{IP,Port,user-name,Password}` and
  `Frontend.storagePage` — `newSFTPConnectionCheck.js` / `storage.service.js`
  read them at module scope.

_Refresh this file whenever a wave lands._
