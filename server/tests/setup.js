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
process.env.APP_ENV = "local";

// 32-byte hex (64 chars) = 256-bit key; 16-byte hex (32 chars) = 128-bit IV.
const TEST_ENCRYPTION_KEY = "0".repeat(64);
const TEST_IV = "0".repeat(32);

const testConfig = {
  port: 5000,
  APP_ENV: "local",

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
  RTSPStream: {
    host: "http://rtsp.test",
    token: "test-rtsp-token",
    terminateHost: "http://rtsp-terminate.test",
    terminateKey: "test-terminate-key",
  },
  aMember: {
    baseUrl: "http://amember.test",
    apiKey: "test-key",
    customPlanID: "9999",
    topUpPlanID: "9998",
  },
  detectionServiceRevokeSecretKey: "test-revoke-detection-secret",
  attendanceServiceRevokeSecretKey: "test-revoke-attendance-secret",
  DSAuthUsersAPI: "http://ds-auth-users.test",
  DSAuthUsersApiDB: "test-faces-db",
  backendDomain: "http://backend.test",
  SFTP: {
    Path: "/sftp/test",
    IP: "127.0.0.1",
    Port: 22,
    "user-name": "test-sftp-user",
    Password: "test-sftp-pass",
  },
  enablePhoneRecipients: false,
  allowed_users: [],

  // Infra
  redis: { host: "127.0.0.1", port: 6379 },
  Redis: {
    host: "127.0.0.1",
    port: 6379,
    username: "",
    password: "",
    db: 0,
    url: "redis://127.0.0.1:6379",
  },
  mongoURI: "mongodb://127.0.0.1:27017/videora-test",
  mongodb_uri: "mongodb://127.0.0.1:27017/videora-test",

  // Mail / SMS
  sendgrid: { apiKey: "SG.test", from: "noreply@test" },
  twilio: { accountSid: "AC_test", authToken: "test", from: "+15555550000" },
  telegram: { botToken: "test:bot" },
  // TelegramService reads these at module load via `config.get`.
  domainPoint: {
    botToken: "test:domain-bot",
    chatId: "test-chat-id",
    email: "domains@test",
  },

  // Misc
  Frontend: { storagePage: "http://frontend.test/storage" },
  // Lowercase alias used by users.service forgotPassword for the reset link.
  frontend: { baseUrl: "http://frontend.test" },
  ImageView: "http://imageview.test",
  accessLogsTimeDifference: 5,
  swagger: { user: "test", pass: "test" },
  empDomain: { url: "http://emp.test", apiKey: "test-key" },
  // EmpMonitor secret used by AdminService.getEmpEmployees /
  // UsersService.allOrgEmployee in their POST body to the EMP backend.
  emp_secret_key: "test-emp-secret",
  storage: {
    s3: { accessKey: "", secretKey: "", region: "us-east-1", bucket: "" },
    googleDrive: { clientId: "", clientSecret: "", redirectUri: "" },
    sftp: { host: "", port: 22, username: "", password: "" },
  },
  // Email Monitoring dashboard — standalone config credentials + its own
  // signing secret, deliberately different from token_secret.
  emailMonitoring: {
    username: "opsadmin",
    password: "test-email-pass",
    jwtSecret: "test-email-monitoring-secret",
  },
};

process.env.NODE_CONFIG = JSON.stringify(testConfig);

// Expose for tests that want to read the same fixtures.
globalThis.__TEST_CONFIG__ = testConfig;
