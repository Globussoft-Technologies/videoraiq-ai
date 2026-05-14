/**
 * Vitest global setup.
 *
 * The `config` package reads ENV at module load time. Several server modules
 * call `config.get(...)` at module scope (crypto utils, auth service,
 * verifyToken middleware, etc.). We must populate NODE_CONFIG before any
 * test file imports from server code, so this file runs first.
 */
process.env.NODE_ENV = "test";
process.env.T = "test";
process.env.APP_ENV = "test";

// 32-byte hex (64 chars) = 256-bit key; 16-byte hex (32 chars) = 128-bit IV.
const TEST_ENCRYPTION_KEY = "0".repeat(64);
const TEST_IV = "0".repeat(32);

const testConfig = {
  port: 5000,
  APP_ENV: "test",

  // Crypto
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  IV: TEST_IV,

  // JWT
  jwt: {
    secretKey: "test-jwt-secret-do-not-use-in-prod",
    expiresIn: "24h",
    tokenExpiryTime: "24h",
  },

  // Service-to-service token (verifyToken accepts this for python-backend)
  Backend: { token: "test-backend-service-token" },

  // External services
  PythonService: {
    detectionUrl: "http://detection.test",
    attendanceUrl: "http://attendance.test",
  },
  RTSPStream: { host: "http://rtsp.test" },
  aMember: {
    baseUrl: "http://amember.test",
    apiKey: "test-key",
    customPlanID: "9999",
    topUpPlanID: "9998",
  },
  detectionServiceRevokeSecretKey: "test-revoke-detection-secret",
  attendanceServiceRevokeSecretKey: "test-revoke-attendance-secret",
  DSAuthUsersAPI: "http://ds-auth-users.test",
  enablePhoneRecipients: false,
  allowed_users: [],

  // Infra
  redis: { host: "127.0.0.1", port: 6379 },
  mongoURI: "mongodb://127.0.0.1:27017/videora-test",

  // Mail / SMS
  sendgrid: { apiKey: "SG.test", from: "noreply@test" },
  twilio: { accountSid: "AC_test", authToken: "test", from: "+15555550000" },
  telegram: { botToken: "test:bot" },

  // Misc
  swagger: { user: "test", pass: "test" },
  empDomain: { url: "http://emp.test", apiKey: "test-key" },
  storage: {
    s3: { accessKey: "", secretKey: "", region: "us-east-1", bucket: "" },
    googleDrive: { clientId: "", clientSecret: "", redirectUri: "" },
    sftp: { host: "", port: 22, username: "", password: "" },
  },
};

process.env.NODE_CONFIG = JSON.stringify(testConfig);

// Expose for tests that want to read the same fixtures.
globalThis.__TEST_CONFIG__ = testConfig;
