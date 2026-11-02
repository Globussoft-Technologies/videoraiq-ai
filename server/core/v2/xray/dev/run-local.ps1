# Run the real backend locally, with every outbound call sandboxed.
#
# WHY THIS SCRIPT EXISTS
#
# The development config is a DEVELOPMENT config, not a LOCAL one: it names a
# shared MongoDB and nine live HTTPS services. Booting the server against it
# verbatim makes this laptop a participant in shared infrastructure, and some of
# the code paths a request can take are not read-only:
#
#   * middlewares/checkActivePlan.js, with APP_ENV "local" and a token whose
#     plan has expired, calls revokeDetectionService + revokeAttendanceService.
#     Those POST to PythonService.detectionUrl / attendanceUrl -- in the shipped
#     config, the live Meet-Greet services.
#   * utils/rtspStream.js buildStreamingUrl, with APP_ENV "cloud", POSTs
#     /api/add-camera to RTSPStream.host and REGISTERS the camera with the
#     streaming server. Resolving a camera is not a lookup in that mode.
#   * detectionLicense.reconcileAddedCameraLicenses runs at boot and writes to
#     the admin collection (a no-op only while LICENSING_ENABLED is false).
#
# So: the real config supplies secrets and settings, and this script overrides
# the database and every outbound host. Nothing here can reach production, by
# construction rather than by being careful.
#
# The config file itself is kept OUTSIDE the git repo, because
# `config/development.json` is NOT in .gitignore -- a careless `git add -A` would
# publish every credential in it.
#
# USAGE -- from the server/ directory. Use `powershell`, not `pwsh`: pwsh is not
# installed on the dev box.
#
#   1. a local mongod (the cached mongodb-memory-server binary works fine):
#        $m = "node_modules\.cache\mongodb-memory-server\mongod-x64-win32-7.0.24.exe"
#        Start-Process $m -ArgumentList "--dbpath","<a-dir>","--port","27017","--bind_ip","127.0.0.1"
#   2. a Redis stand-in and a fake X-ray service:
#        node core/v2/xray/dev/fakeRedis.js
#        node core/v2/xray/dev/fakeXrayService.js --port 8130 --api-key dev-key --jwt-secret dev-secret
#   3. this script. Detached, with logs OUTSIDE the config directory:
#        $logs = 'C:\\Users\\Admin\\face_auth\\videoraiq-xray-logs'
#        Start-Process powershell -WindowStyle Hidden `
#          -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','core/v2/xray/dev/run-local.ps1' `
#          -RedirectStandardOutput "$logs/relay.log" -RedirectStandardError "$logs/relay.err"
#
#      Two deliberate details there:
#
#      DETACHED. Run it as a child of an agent's tool shell and a harness
#      cleanup reaps it, taking down anything that depends on it. That happened
#      once: this relay died mid-session while another session's browser pass
#      depended on it, and the log showed a normal scheduler tick then nothing.
#
#      LOGS OUTSIDE $ConfigDir. That directory holds development.json and its
#      live credentials for nine services. Nothing in this relay's log is a
#      secret -- they are reported as 'set'/'(unset)', verified against a real
#      log -- so the content is harmless. The hazard is the DIRECTORY starting
#      to look like a log directory: the instruction given under pressure is
#      'zip the logs and send them', and at that moment nobody re-reads the
#      listing. Keeping logs elsewhere removes the category of mistake rather
#      than lowering its odds. Raised by session F, who moved theirs first.
#
#      For a foreground run (logs to the console, nothing written):
#        powershell core/v2/xray/dev/run-local.ps1              # X-ray ON,  port 5099
#        powershell core/v2/xray/dev/run-local.ps1 -XrayOff     # X-ray OFF, port 5098
#
# Run from the server/ directory.
#
# KEEP THIS FILE ASCII-ONLY. Windows PowerShell 5.1 (the only PowerShell on the
# dev box -- `pwsh` is not installed) reads a BOM-less .ps1 as cp1252. A UTF-8
# em dash (E2 80 94) then decodes to three characters, the last of which is
# U+201D RIGHT DOUBLE QUOTATION MARK -- and PowerShell accepts U+201D as a
# string terminator. So an em dash inside a Write-Host string closes the string
# early, the next straight quote opens a new one, and the enclosing block never
# closes. The error it produces points at a brace several lines away
# ("Missing closing '}' in statement block", line 83) and tells you nothing
# about the real cause. Found by session F, who hit it trying to run this.

param(
  [string]$ConfigDir = "C:\Users\Admin\face_auth\videoraiq-config",
  [string]$MongoUri  = "mongodb://127.0.0.1:27017/xray_dev",
  [int]$Port         = 0,
  [switch]$XrayOff,
  [string]$XrayServiceUrl = "http://127.0.0.1:8130"
)

if ($Port -eq 0) { $Port = if ($XrayOff) { 5098 } else { 5099 } }

# Port 9 is the standard discard port: a connection attempt fails instantly
# rather than hanging, so a stray outbound call surfaces as a fast, obvious
# error in the log instead of a timeout nobody notices.
$dead = "http://127.0.0.1:9"

$overrides = @{
  # --- the database: local, never the shared one ---------------------------
  mongodb_uri = $MongoUri

  # --- APP_ENV ------------------------------------------------------------
  # "local" keeps buildStreamingUrl on the string-concatenation path
  # (nvr.domain + channel.streamingPath) instead of the cloud path that
  # registers the camera with the streaming server. The trade-off is honest and
  # worth stating: the cloud resolution path is therefore NOT exercised here.
  APP_ENV = "local"

  port = $Port

  # --- every outbound host, pointed at the discard port -------------------
  PythonService = @{ detectionUrl = $dead; attendanceUrl = $dead }
  RTSPStream    = @{ host = $dead; terminateHost = $dead; token = "local-sandbox"; terminateKey = 0 }
  DSAuthUsersAPI     = $dead
  DSUserSyncAPI      = $dead
  CarModelCatalogAPI = $dead
  empDomain          = "$dead/"
  aMember            = @{ baseUrl = $dead }
  LLM_BASE_URL       = $dead
  backendDomain      = $dead

  # Licensing is false in the dev config. Left as the file has it so behaviour
  # matches the real deployment; use XRAY_LICENSE_CHECK=on to exercise the
  # X-ray licence gate regardless (see xray.config.js).
}

$env:NODE_ENV        = "development"
$env:NODE_CONFIG_DIR = $ConfigDir
$env:NODE_CONFIG     = ($overrides | ConvertTo-Json -Depth 6 -Compress)

if ($XrayOff) {
  Remove-Item Env:\XRAY_ENABLED     -ErrorAction SilentlyContinue
  Remove-Item Env:\XRAY_SERVICE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\XRAY_API_KEY     -ErrorAction SilentlyContinue
  Remove-Item Env:\XRAY_JWT_SECRET  -ErrorAction SilentlyContinue
  Write-Host "X-ray: OFF (flag unset) -- /api/v2/xray/* should 404" -ForegroundColor Yellow
} else {
  $env:XRAY_ENABLED     = "true"
  $env:XRAY_SERVICE_URL = $XrayServiceUrl
  $env:XRAY_API_KEY     = "dev-key"
  $env:XRAY_JWT_SECRET  = "dev-secret"
  # Set explicitly rather than inherited from the config file, because a local
  # run cannot satisfy the licence gate: the allocation row needs settingType
  # "xRayMode", which is absent from this backend's DETECTION_TYPES enum AND
  # from server-superadmin's own copy, so neither service can create it. With
  # the gate live, POST /sessions answers 403 not_licensed -- correct behaviour,
  # but it would end a local run before it started. Flip to "on" (and insert the
  # row straight into Mongo, see xray.license.js) to exercise the gate itself.
  $env:XRAY_LICENSE_CHECK = "off"
  Write-Host "X-ray: ON  -> $XrayServiceUrl" -ForegroundColor Green
  Write-Host "licence gate: OFF (see the comment in this script for why)" -ForegroundColor Yellow
}

Write-Host "config dir : $ConfigDir  (outside the git repo)"
Write-Host "mongo      : $MongoUri"
Write-Host "port       : $Port"
Write-Host "outbound   : every host overridden to $dead -- nothing can reach production"
if (-not $XrayOff) {
  Write-Host "x-ray ws   : ws://127.0.0.1:$Port/internal/xray/ws   (shares this port)"
}
Write-Host ""

# views/swagger-api*-view.json are generated artifacts the server reads at boot.
if (-not (Test-Path "views\swagger-api-view.json")) {
  Write-Host "generating swagger views first..." -ForegroundColor Cyan
  npm run swagger:all | Out-Null
}

node server.js
