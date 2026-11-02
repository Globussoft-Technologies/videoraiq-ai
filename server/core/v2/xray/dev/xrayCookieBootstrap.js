/**
 * Plant the dev login cookies for the local frontend, from a port of our own.
 *
 * WHY THIS EXISTS
 *
 * client_v2's route guard (IsAuth.jsx) runs BEFORE you can open a console on
 * the page: with no access-token cookie it calls toLogin(), which does
 * `window.location.replace(VITE_AMEMBER_LOGIN_URL)` -- in this .env, the
 * Cloudflare-fronted dev host, whose tunnel is down. So the browser leaves
 * localhost before you can paste anything into it, and what you see is
 * Cloudflare's error page rather than anything of ours. Chicken and egg.
 *
 * Cookies are scoped by HOST, not by port: a cookie this page sets for
 * `localhost` is sent to `http://localhost:5173` as well. So a page served
 * here can authenticate the app over there without touching client_v2, which
 * is another session's lane.
 *
 * The token also carries `VITE_LOCAL_SETUP: true`, which is the claim
 * isLocalSetup() reads -- with it, toLogin() navigates to the in-app
 * /admin-login route instead of leaving the machine at all. So after one
 * visit here, that failure mode is gone even when a token expires.
 *
 * Usage (from server/):
 *   node core/v2/xray/dev/xrayCookieBootstrap.js --token <jwt> [--port 8141]
 *   then open http://localhost:8141
 */
import http from "node:http";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PORT = Number(argOf("port", 8141));
const TOKEN = argOf("token", process.env.XRAY_DEV_TOKEN || "");
const TAB = argOf("tab", "tab-alpha");
const APP = argOf("app", "http://localhost:5173");
// The X-Ray pill lives inside DetectionZoneMarking, which Detections.jsx
// mounts only once a detection card AND a camera are both chosen. The
// `detection` search param preselects the card (Header.jsx uses the same
// form); the camera still has to be clicked, so the steps are spelled out on
// the page rather than implied.
const DETECTION = argOf("detection", "unauthorizedAccessSettings");
const CAMERA_NAME = argOf("camera-name", "Gate camera");
const DEEP = `${APP}/detection-settings?detection=${encodeURIComponent(DETECTION)}`;
const CAMERA = argOf("camera", "");
const NVR = argOf("nvr", "");

if (!TOKEN) {
  console.error("--token is required (mint one against config jwt.secretKey)");
  process.exit(1);
}

const page = `<!doctype html>
<meta charset="utf-8">
<title>X-ray dev sign-in</title>
<style>
  body { font: 15px/1.6 system-ui, sans-serif; max-width: 46rem; margin: 3rem auto; padding: 0 1rem; color: #1c2434; }
  code { background: #f1f4f9; padding: .1rem .35rem; border-radius: 4px; }
  a.go { display: inline-block; margin-top: 1rem; padding: .7rem 1.1rem; background: #2563eb; color: #fff;
         border-radius: 8px; text-decoration: none; font-weight: 600; }
  .ok { color: #137333; font-weight: 600; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem 1rem; }
  dt { color: #556176; }
</style>
<h1>X-ray dev sign-in</h1>
<p id="status">setting cookies…</p>
<a class="go" href="${DEEP}">Open Detections, X-ray card preselected →</a>
<h2>Then, on that page</h2>
<ol>
  <li>The card list is filtered to <strong>Intrusion Detection</strong> (that is the
      <code>?detection=</code> param). Any card works — X-ray does not care which.</li>
  <li>Click the camera <strong>${CAMERA_NAME}</strong> in that card. The right-hand panel
      opens with the live video — this is the zone-marking stage.</li>
  <li>The <strong>X-Ray</strong> pill sits on that stage. If it is greyed out, its tooltip
      says why (no stream, snapshot only, stream still starting).</li>
  <li>Press it, wait for “Preparing X-Ray…” to clear, then click an object in the picture.</li>
</ol>
<h2>What you are looking at</h2>
<dl>
  <dt>video</dt><dd>real 1920×1080 25 fps camera footage, 2 s HLS segments, served where the Go streaming server would be</dd>
  <dt>masks</dt><dd><strong>synthetic</strong> — the service runs its fake backend, so the outline moves on its own and does not follow anything in the video</dd>
  <dt>cookie</dt><dd><code>dev-access-token</code> (because <code>VITE_ENV=dev</code>)</dd>
  <dt>tab</dt><dd><code>${TAB}</code>, sent as <code>x-session-id</code></dd>
  ${CAMERA ? `<dt>camera id</dt><dd><code>${CAMERA}</code></dd>` : ""}
  ${NVR ? `<dt>nvr id</dt><dd><code>${NVR}</code></dd>` : ""}
</dl>
<p>Two behaviours that look like bugs and are not: one object per session (a second
click earns <code>409 max_objects_reached</code>), and a session with no heartbeat for
45 s is reaped on purpose.</p>
<p>The token carries <code>VITE_LOCAL_SETUP: true</code>, so an expiry sends you to the
app's own <code>/admin-login</code> instead of the dev host behind Cloudflare.</p>
<script>
  // path=/ and no domain attribute: a host-only cookie for "localhost", which
  // the browser sends to every port on that host.
  document.cookie = "dev-access-token=${TOKEN}; path=/; SameSite=Lax";
  document.cookie = "vq_session_id=${TAB}; path=/; SameSite=Lax";
  const has = document.cookie.includes("dev-access-token");
  document.getElementById("status").innerHTML = has
    ? '<span class="ok">cookies set.</span> Click through to the app.'
    : 'could not set cookies — is this page on http://localhost?';
</script>
`;

http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(page);
  })
  .listen(PORT, "127.0.0.1", () =>
    console.log(`[xray-bootstrap] http://localhost:${PORT} -> sets cookies, links to ${APP}`),
  );
