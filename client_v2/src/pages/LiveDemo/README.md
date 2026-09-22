# Live Demo — reference

Working notes for the Live Demo feature. This exists so the non-obvious
behaviour doesn't have to be re-derived from a ~3,700-line file every time.

**Keep this updated when you change Live Demo.** Prefer recording *why* over
*what* — the code already says what. Deliberately avoids line numbers and long
code excerpts, because those rot on the next edit.

---

## What it is

A self-serve demo: the user uploads a video clip, picks one detection type,
optionally draws a zone or line on the clip, and processes it. The DS
(data-science) pipeline analyses it asynchronously and pushes back a processed
video plus events, which are shown as an Event Log, analytics, and — for Face
Recognition only — an Attendance Log.

Everything the demo writes is tagged `liveDemoData: true` so it never mixes
with real tenant data.

---

## File map

| File | Role |
| --- | --- |
| `LiveDemo.jsx` | Everything: page shell, detection picker, video stage, drawing overlay, all panels. Large single file. |
| `SessionAnalyticsPanel.jsx` | Session analytics card. |
| `VideoProcessingLoader.jsx` | The countdown loader shown while DS works. |
| `liveDemoSession.js` | `sessionStorage` snapshot so a route change doesn't lose an in-flight run. |
| `liveDemoExport.js` | Attendance/session row building for export. |
| `api/{get,post,patch,delete}/` | API wrappers. Note: `updateVideoRecord` is a PATCH but lives in `api/post/`. |

---

## API surface

Base `HOST` is `VITE_BACKEND`. All calls send the `x-access-token` header.

| Function | Call |
| --- | --- |
| `getVideoRecords` | `GET /video-records` — history list, server-sorted `createdAt: -1` |
| `getVideoRecordVideos` | `GET /video-records/:id/videos` |
| `getVideoRecordAnalytics` | `GET /video-records/:id/analytics` — DS-pushed counters; often zero |
| `uploadDemoClip` | `POST /uploads/media` |
| `createVideoRecord` | `POST /video-records` |
| `updateVideoRecord` | `PATCH /video-records/:id` |
| `processVideoRecord` | `POST /video-records/:id/process` — kicks off DS |
| `getDemoIncidents` | `POST /incidents?skip=&limit=` with `liveDemoData: true` |
| `getLiveDemoAnalytics` | `POST /video-records/live-demo-analytics` — derived, populated as soon as events land |
| `getDemoAttendanceLogs` | `POST /accessLogs/get` — Face Recognition only |
| `deleteDemoMedia` | `DELETE /uploads/deleteMedia` |

`getDemoIncidents` is a POST only because the detection filter is a list — it
doesn't write anything.

**Prefer `getLiveDemoAnalytics` over `getVideoRecordAnalytics`.** The latter
returns only counters DS has pushed onto the record, which stay at zero for a
long time. The former is derived from the events themselves.

---

## Lifecycle

```
idle → uploading → uploaded → processing → awaiting-ds → ready
                                                    ↘ error
```

`awaiting-ds` is the important one: `processVideoRecord` returns as soon as DS
*accepts* the job, not when it finishes. The run is only actually complete when
the socket event below arrives.

`isClipBusy` = `uploading | processing | awaiting-ds`.

### Sockets

| Event | Purpose |
| --- | --- |
| `videoRecord_updated_${recordId}` | DS finished. Payload carries `videos[]`; the run is done once any video has a `dsVideoUrl`. |
| `accessLogs_${adminId}` | Live face matches. Shared with the real app — filter on `liveDemoData === true` **and** the current `videoId`, and drop `Unknown`. |

---

## Gotchas

These are the things that have actually bitten. Read before changing anything.

### `dsVideoUrl` is the readiness test

A record is processed if **any** of its videos has a non-null `dsVideoUrl`.
Nothing else is reliable — `createdAt`, presence of `zones`, and the DS-pushed
counters all exist long before the run completes.

Used in two places that must stay in agreement: the Recent Demos filter, and
the Processed/Pending badge.

### Fetch results *after* the socket event, not at process time

Incidents/analytics fetched when processing is kicked off come back empty — DS
hasn't emitted anything yet. The refetch inside the
`videoRecord_updated_` handler is what actually fills the Event Log. This was a
real bug: the data was fetched, stored, and silently discarded.

### `videoId`-scoped incident queries can come back empty

DS doesn't always stamp events with our `videoId`. Both incident fetch paths
fall back to the admin-wide demo feed when a scoped query returns nothing,
rather than showing an empty log.

### The incidents endpoint is not a complete feed

Server-side it **only returns incidents that have a snapshot image**, and
excludes some types outright. A detection that produces image-less events will
show fewer rows than analytics claims. Not a client bug.

### Face Recognition is the odd one out everywhere

It has no Event Log — it gets the Attendance Log, Matched Alerts and Reports
panels instead. Nearly every results-panel branch keys off
`selectedDetection === 'Face Recognition'` or
`settingType === 'faceAuthenticationSettings'`. Check both spellings when
searching.

### `analyticsSettingType()` exists for one alias

Maps `attendanceSettings` → `faceAuthenticationSettings`. Always route setting
types through it before calling analytics.

### StrictMode double-invokes updaters

Drawing state is held in refs (`pointsRef`, `draftZonesRef`, `savedZonesRef`)
and read there rather than inside `setState` updaters. React 18 StrictMode
double-invokes updater functions in dev, which previously pushed each completed
zone in twice. Don't move this logic back into an updater.

---

## Drawing: zones vs the line

Coordinates are **native video pixels** everywhere in state and in the saved
payload. Normalisation to a `0…1000` viewBox happens only at render time.

### Polygon zones (default)

3+ points, auto-commits into a draft zone when the point cap is reached. Point
count is adjustable via the stepper; Max/Min Area presets fill the frame.

### Line Crossing (`lineCrossingSettings`) — special-cased

Mirrors `page/user/Configure/DetectionZoneMarking.jsx`, which is the canonical
implementation. Its logic is inline and **not extractable** as a shared
component — it's coupled to that page's camera/NVR state — so Live Demo
reimplements the drawing but matches the identifiers and saved shape exactly.

**Three clicks, not two.** Points 1–2 are the tripwire; **point 3 is the inside
reference point** (green dot, labelled on the overlay) telling DS which side
counts as "in". The UI copy used to say "2 points", which was wrong and made
the feature look broken.

Line-only differences:

- Never auto-commits — a line stays in `points` until explicitly saved, because
  the 3rd click is a reference point, not a shape close.
- Max/Min Area and the point stepper are hidden; buttons read *Draw Line* /
  *Save Line*.
- Renders as an open polyline (first 2 points only) — never a filled polygon.
- Nouns switch Zone → Line throughout (modal title, headings, name field,
  overlay pill, defaults).
- Only extra field is **Mode** (Entry / Exit / Both). No capacity/threshold —
  it has no `ZONE_EXTRA_FIELDS` entry.

**Saved shape:** zone = the 2 endpoints; plus `inside_reference_point: [x, y]`,
`count_mode`, `videoResolution`.

**`both` maps to `all` on the wire**, and back to `both` on read. Sending
`both` gives the backend a value it doesn't understand.

**Two traps when re-saving a line:**

1. The server echoes a saved line back as 2 points only, so the reference point
   must be re-attached locally or it vanishes from the overlay on save.
2. `buildNewZones()` excludes already-saved zones, so re-saving an existing line
   (to change Mode/name) once failed validation with "Place at least 3 points".
   A line falls back to the saved one — and because there is only ever one line,
   it **replaces** rather than merges, or you get duplicates.

---

## Detections

Listed in the `detections` array with `{ name, subtitle, category, color,
settingType }`. **A missing `settingType` means the API doesn't support it yet**
— processing is blocked with a toast. Currently: Bag Detection and Fire & Smoke
Detection. Two further entries (Vehicle Traffic Obstruction, Oil Spillage) are
commented out of the array entirely.

`Zone Intrusion Detection` maps to `unauthorizedAccessSettings` in the list, but
`persistZones` rewrites it to `zoneIntrusionSettings` when saving.

---

## Recent Demos

Filtered client-side to processed records only (`dsVideoUrl` test above).

Because filtering happens *after* the `limit: 20` fetch, a user with many
pending runs sees fewer than 20 rows. Fine at current volumes; needs a
server-side filter to guarantee a full page.

---

## Related modules

| Path | Why it matters |
| --- | --- |
| `page/user/Configure/DetectionZoneMarking.jsx` | Canonical zone/line drawing. Match its behaviour and saved field names. |
| `pages/IncidentLogs/` | Canonical incident→row mapping. Reuse its field names. |
| `pages/RegisterUser/` | Face registration API and capture wizard, reused by Live Demo. |
| `lib/format.js` | `mediaUrl()` — prefixes `VITE_INCIDENT_URL` onto incident snapshot paths. |

### Incident fields

`Image` (snapshot, needs `mediaUrl()`), `incidentName`, `timeOfIncident`
(fall back to `createdAt`), `channelData.name` (camera), `nvrData.nvrName`,
`severity` (`low|moderate|high`), `zone`,
`ConfidenceScoreInPercentage` (already 0–100 — the legacy
`confidence`/`accuracy`/`score` fallbacks are 0–1 and need ×100).
Status is derived: `resolved` → Resolved, `report.status` → Reported, else New.

---

## Verifying changes

There is **no ESLint config** in `client_v2` (ESLint 10 dropped `.eslintrc`
support), so the practical check is:

```bash
cd client_v2 && npx vite build
```

A build pass only proves it compiles. Anything touching the DS round-trip —
drawing, processing, event panels — needs a real clip processed end to end,
because the socket event and DS payload can't be exercised any other way.

---

## Change log

Newest first.

### 2026-09-04

- **Event Log for non-face detections.** Incidents were being fetched and then
  discarded — nothing rendered them. Added the table, swapped it in for the
  Configure panel once `clipStatus === 'ready'`, refetched incidents after the
  socket event (the actual fix), raised the limit 10 → 50, added the
  admin-wide fallback.
- **Line Crossing drawing.** Replaced polygon marking with the 3-click
  line + reference point model; hid zone-only controls; Zone → Line nouns;
  added the Mode dropdown; wired `inside_reference_point` / `count_mode`
  (incl. `both` → `all`) into the save payload; gated processing on the
  reference point.
- **Fixed re-saving a line** failing with "Place at least 3 points", and the
  duplicate-line and lost-Mode bugs that the naive fix would have introduced.
- **Recent Demos** filtered to processed records only.
- **Face registration form** reduced to First/Last/Email + optional Vehicle
  Number; dropped Designation, Location, Department (all optional server-side)
  and the two dropdown fetches they needed.
