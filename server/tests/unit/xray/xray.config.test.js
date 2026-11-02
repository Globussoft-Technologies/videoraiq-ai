/**
 * X-Ray configuration — every flag and tunable.
 *
 * This file is the written-down version of "the user is not a JS developer and
 * needs every piece of this switchable". It asserts, for each knob: the default
 * when nothing is set, that an environment variable overrides it, and that a
 * nonsense value falls back instead of propagating.
 *
 * xray.config.js reads the environment on every call rather than caching at
 * import, so these tests need no module resetting.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  isXrayEnabled,
  xrayServiceUrl,
  xrayApiKey,
  xrayJwtSecret,
  xrayJwtTtlSec,
  xrayServiceTimeoutMs,
  xrayIdleTimeoutSec,
  xrayReapIntervalSec,
  xrayWsPort,
  xrayWsPath,
  xrayWsPingSec,
  xrayLicenseCheckMode,
  xrayLicenseSettingType,
  xrayConfigProblems,
  xrayConfigSummary,
} from "../../../core/v2/xray/xray.config.js";

const XRAY_ENV_KEYS = [
  "XRAY_ENABLED",
  "XRAY_SERVICE_URL",
  "XRAY_API_KEY",
  "XRAY_JWT_SECRET",
  "JWT_SECRET_KEY",
  "XRAY_JWT_TTL_SEC",
  "XRAY_SERVICE_TIMEOUT_MS",
  "XRAY_IDLE_TIMEOUT_SEC",
  "XRAY_REAP_INTERVAL_SEC",
  "XRAY_WS_PORT",
  "XRAY_WS_PATH",
  "XRAY_WS_PING_SEC",
  "XRAY_LICENSE_CHECK",
  "XRAY_LICENSE_SETTING_TYPE",
];

const saved = {};
for (const key of XRAY_ENV_KEYS) saved[key] = process.env[key];

afterEach(() => {
  for (const key of XRAY_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const clearXrayEnv = () => {
  for (const key of XRAY_ENV_KEYS) delete process.env[key];
};

// ---------------------------------------------------------------------------
// The master flag — contract §3
// ---------------------------------------------------------------------------

describe("XRAY_ENABLED", () => {
  it("defaults to false with nothing set", () => {
    clearXrayEnv();
    expect(isXrayEnabled()).toBe(false);
  });

  it.each(["true", "1", "yes", "on", "TRUE", "True", " true "])("%s is on", (value) => {
    clearXrayEnv();
    process.env.XRAY_ENABLED = value;
    expect(isXrayEnabled()).toBe(true);
  });

  // A typo must not switch a feature on. Anything not explicitly truthy is off:
  // the failure mode of a wrong default here is a feature silently live in
  // production, which contract §3 exists to prevent.
  it.each(["false", "0", "no", "off", "", "maybe", "enabled", "yes please"])(
    "%s is off",
    (value) => {
      clearXrayEnv();
      process.env.XRAY_ENABLED = value;
      expect(isXrayEnabled()).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// Service connection
// ---------------------------------------------------------------------------

describe("service connection settings", () => {
  it("default to empty, so nothing is accidentally dialled", () => {
    clearXrayEnv();
    expect(xrayServiceUrl()).toBe("");
    expect(xrayApiKey()).toBe("");
    expect(xrayJwtSecret()).toBe("");
  });

  it("strip trailing slashes off the service URL", () => {
    clearXrayEnv();
    process.env.XRAY_SERVICE_URL = "http://gpu-box:8130///";
    expect(xrayServiceUrl()).toBe("http://gpu-box:8130");
  });

  // Contract §6 names the shared secret JWT_SECRET_KEY because that is what the
  // Python side already calls it (python config/settings.py:1472). A deployer
  // who sets only that must still get a working relay.
  it("fall back to JWT_SECRET_KEY when XRAY_JWT_SECRET is unset", () => {
    clearXrayEnv();
    process.env.JWT_SECRET_KEY = "shared-with-python";
    expect(xrayJwtSecret()).toBe("shared-with-python");
  });

  it("prefer XRAY_JWT_SECRET over JWT_SECRET_KEY", () => {
    clearXrayEnv();
    process.env.JWT_SECRET_KEY = "shared-with-python";
    process.env.XRAY_JWT_SECRET = "namespaced";
    expect(xrayJwtSecret()).toBe("namespaced");
  });
});

// ---------------------------------------------------------------------------
// Timeouts — contract §10
// ---------------------------------------------------------------------------

describe("timeouts and intervals", () => {
  it("match the contract defaults", () => {
    clearXrayEnv();
    expect(xrayServiceTimeoutMs()).toBe(15_000); // §10: Node -> service HTTP
    expect(xrayIdleTimeoutSec()).toBe(45); //       §10: idle reap
    expect(xrayJwtTtlSec()).toBe(120); //           §6: exp <= 5 min
    expect(xrayReapIntervalSec()).toBe(15);
  });

  it("are overridable", () => {
    clearXrayEnv();
    process.env.XRAY_SERVICE_TIMEOUT_MS = "9000";
    process.env.XRAY_IDLE_TIMEOUT_SEC = "90";
    expect(xrayServiceTimeoutMs()).toBe(9_000);
    expect(xrayIdleTimeoutSec()).toBe(90);
  });

  // Contract §6 caps the service token at 5 minutes. A deployer asking for an
  // hour gets 5 minutes, not an hour and not an error: the token is a detail of
  // a hop they cannot see, so failing their boot over it would be unhelpful.
  it("clamp the JWT TTL to the contract's 5-minute ceiling", () => {
    clearXrayEnv();
    process.env.XRAY_JWT_TTL_SEC = "3600";
    expect(xrayJwtTtlSec()).toBe(300);
  });

  it("clamp the JWT TTL up from an unusably short value", () => {
    clearXrayEnv();
    process.env.XRAY_JWT_TTL_SEC = "1";
    expect(xrayJwtTtlSec()).toBe(30);
  });

  it("fall back to the default on a non-numeric value", () => {
    clearXrayEnv();
    process.env.XRAY_SERVICE_TIMEOUT_MS = "soon";
    expect(xrayServiceTimeoutMs()).toBe(15_000);
  });
});

// ---------------------------------------------------------------------------
// WebSocket listener — contract §8
// ---------------------------------------------------------------------------

describe("WebSocket settings", () => {
  it("default to the contract's example endpoint", () => {
    clearXrayEnv();
    expect(xrayWsPort()).toBe(5055);
    expect(xrayWsPath()).toBe("/internal/xray/ws");
    expect(xrayWsPingSec()).toBe(20);
  });

  it("add a leading slash to a path given without one", () => {
    clearXrayEnv();
    process.env.XRAY_WS_PATH = "internal/xray/ws";
    expect(xrayWsPath()).toBe("/internal/xray/ws");
  });

  it("fall back on an out-of-range port", () => {
    clearXrayEnv();
    process.env.XRAY_WS_PORT = "99999";
    expect(xrayWsPort()).toBe(65_535);
  });
});

// ---------------------------------------------------------------------------
// Licensing — decision D1 in docs/xray/status_backend.md
// ---------------------------------------------------------------------------

describe("licensing", () => {
  it("defaults to following the platform's own licensing switch", () => {
    clearXrayEnv();
    expect(xrayLicenseCheckMode()).toBe("auto");
    expect(xrayLicenseSettingType()).toBe("xRayMode");
  });

  it.each(["on", "off", "auto"])("accepts %s", (mode) => {
    clearXrayEnv();
    process.env.XRAY_LICENSE_CHECK = mode;
    expect(xrayLicenseCheckMode()).toBe(mode);
  });

  it("falls back to auto on an unrecognised mode", () => {
    clearXrayEnv();
    process.env.XRAY_LICENSE_CHECK = "sometimes";
    expect(xrayLicenseCheckMode()).toBe("auto");
  });
});

// ---------------------------------------------------------------------------
// Misconfiguration reporting
// ---------------------------------------------------------------------------

describe("xrayConfigProblems", () => {
  it("reports nothing while the feature is off, however empty the rest is", () => {
    clearXrayEnv();
    expect(xrayConfigProblems()).toEqual([]);
  });

  it("names every missing setting once the feature is on", () => {
    clearXrayEnv();
    process.env.XRAY_ENABLED = "true";
    const problems = xrayConfigProblems();
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toContain("XRAY_SERVICE_URL");
    expect(problems.join(" ")).toContain("XRAY_API_KEY");
    expect(problems.join(" ")).toContain("XRAY_JWT_SECRET");
  });

  it("is silent once everything is set", () => {
    clearXrayEnv();
    process.env.XRAY_ENABLED = "true";
    process.env.XRAY_SERVICE_URL = "http://gpu-box:8130";
    process.env.XRAY_API_KEY = "k";
    process.env.XRAY_JWT_SECRET = "s";
    expect(xrayConfigProblems()).toEqual([]);
  });
});

describe("xrayConfigSummary", () => {
  it("never echoes a secret", () => {
    clearXrayEnv();
    process.env.XRAY_ENABLED = "true";
    process.env.XRAY_API_KEY = "super-secret-key";
    process.env.XRAY_JWT_SECRET = "super-secret-jwt";
    const summary = xrayConfigSummary();
    expect(summary.apiKey).toBe("set");
    expect(summary.jwtSecret).toBe("set");
    expect(JSON.stringify(summary)).not.toContain("super-secret");
  });

  it("marks unset secrets as unset rather than empty", () => {
    clearXrayEnv();
    const summary = xrayConfigSummary();
    expect(summary.enabled).toBe(false);
    expect(summary.apiKey).toBe("(unset)");
    expect(summary.serviceUrl).toBe("(unset)");
  });
});
