# Admin integration keys

For Attendance Logs, summary-card fields, filters, curl examples using the installation's IP and port, and JavaScript integration, see [the attendance integration guide](../../../../docs/attendance-api-key-integration.md).

Open `/admin/api-keys` in the VideoraIQ 2.0 client while logged in as the account admin. The route has no sidebar entry. Members, station tokens, employee registration invites and API keys cannot manage keys.

Choose an integration name, a positive whole number of days or calendar years, read-only or full access, and API modules. Copy the generated secret immediately; only its SHA-256 hash is persisted. Expired or revoked keys stop authenticating immediately. Rotation means creating a replacement, switching the integration, then revoking the previous key.

Send `x-api-key: YOUR_API_KEY` to the existing `/api/v2` business endpoints (supported modules also work under `/api/v1`). `x-access-token` accepts the opaque key for compatibility. Keys are never accepted through URL parameters or Bearer authentication. Use HTTPS and keep the secret in the integration server's secret configuration.

Example: `GET /api/v2/incidents/solder-line`, with the `x-api-key` header. Existing endpoint filters, request bodies, pagination and response envelopes still apply.

Read-only permits GET/HEAD except legacy mutation routes, plus the explicit POST query/export allowlist in `apiKey.policy.js`. Full access permits business mutations within selected modules. Authentication, key/session management, licensing grants, admin permission rewrites, global mock jobs, and the UI assistant are excluded. Station-only measurement capture APIs retain their separate approved-station authentication; an admin key does not impersonate a station.

The account's persisted subscription snapshot is checked on every request. Key validity does not extend the subscription. If the snapshot is absent, sign in again with an active subscription before issuing a key. Owner identity comes from the database; supplied admin and supported resource references must match that owner. Legacy globally public media routes retain their existing public access behavior.

Management endpoints, requiring an admin session:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v2/api-keys/options` | Available scopes |
| GET | `/api/v2/api-keys?skip=0&limit=20` | Own key metadata, maximum limit 100 |
| POST | `/api/v2/api-keys` | `{ name, duration, unit: "days" or "years", access: "read" or "full", scopes: ["*"] or module IDs }` |
| DELETE | `/api/v2/api-keys/:id` | Revoke an owned key |

Accepted requests record last-use time, source IP, path without query values, status, and request count. Rate limits are 10 creations per admin per minute, 600 authenticated requests per key per minute, and 1,000 key attempts per source IP per minute. Counters use the existing process memory store; multi-process deployments multiply these limits. No secrets are returned by metadata endpoints.
