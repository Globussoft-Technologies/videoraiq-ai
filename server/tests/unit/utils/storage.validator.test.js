/**
 * Unit tests for core/v1/storage/storage.validator.js
 *
 * Pure Joi schema-bundle (93 LOC) exporting three validators used by
 * StorageService to gate POST bodies:
 *   - `googleDriveBodySchema` — name / clientId / clientSecret /
 *     redirectUri (URI) / storageType ("google_drive_oauth") / note (opt).
 *   - `s3Validator` — name / accessKeyId / secretAccessKey / bucketName /
 *     region / storageType ("s3") / note (opt).
 *   - `sftpValidator` — name / host / port (1-65535 int) / username /
 *     password / storageType ("sftp") / path (opt) / note (opt).
 *
 * Pure data + Joi → no mocks. Pin every custom message + branch so any
 * silent message rename or constraint relaxation in the storage admin
 * flow gets flagged.
 *
 * R102 — server phase (test-only).
 */
import { describe, it, expect } from "vitest";

const {
  googleDriveBodySchema,
  s3Validator,
  sftpValidator,
} = await import("../../../core/v1/storage/storage.validator.js");

// Helper: assert the first Joi error message for a given body.
function firstError(schema, body) {
  const { error } = schema.validate(body);
  expect(error).toBeTruthy();
  return error.details[0].message;
}

describe("googleDriveBodySchema — happy path", () => {
  const valid = {
    name: "drive-1",
    clientId: "abc123",
    clientSecret: "shh",
    redirectUri: "https://app.example.com/oauth/callback",
    storageType: "google_drive_oauth",
  };

  it("accepts a minimal valid payload", () => {
    const { error, value } = googleDriveBodySchema.validate(valid);
    expect(error).toBeUndefined();
    expect(value.name).toBe("drive-1");
  });

  it("trims string fields", () => {
    const { error, value } = googleDriveBodySchema.validate({
      ...valid,
      name: "  drive-1  ",
      clientId: " abc123 ",
    });
    expect(error).toBeUndefined();
    expect(value.name).toBe("drive-1");
    expect(value.clientId).toBe("abc123");
  });

  it("accepts optional empty note", () => {
    const { error, value } = googleDriveBodySchema.validate({
      ...valid,
      note: "",
    });
    expect(error).toBeUndefined();
    expect(value.note).toBe("");
  });

  it("accepts a populated note", () => {
    const { error, value } = googleDriveBodySchema.validate({
      ...valid,
      note: "first drive",
    });
    expect(error).toBeUndefined();
    expect(value.note).toBe("first drive");
  });
});

describe("googleDriveBodySchema — required + format errors", () => {
  const valid = {
    name: "drive-1",
    clientId: "abc123",
    clientSecret: "shh",
    redirectUri: "https://app.example.com/oauth/callback",
    storageType: "google_drive_oauth",
  };

  it("rejects missing name with custom message", () => {
    const { name, ...rest } = valid;
    expect(firstError(googleDriveBodySchema, rest)).toBe(
      "Storage name is required"
    );
  });

  it("rejects empty-string name with custom message", () => {
    expect(
      firstError(googleDriveBodySchema, { ...valid, name: "" })
    ).toBe("Storage name cannot be empty");
  });

  it("rejects missing clientId", () => {
    const { clientId, ...rest } = valid;
    expect(firstError(googleDriveBodySchema, rest)).toBe(
      "Client ID is required"
    );
  });

  it("rejects empty clientId", () => {
    expect(
      firstError(googleDriveBodySchema, { ...valid, clientId: "" })
    ).toBe("Client ID cannot be empty");
  });

  it("rejects missing clientSecret", () => {
    const { clientSecret, ...rest } = valid;
    expect(firstError(googleDriveBodySchema, rest)).toBe(
      "Client Secret is required"
    );
  });

  it("rejects empty clientSecret", () => {
    expect(
      firstError(googleDriveBodySchema, { ...valid, clientSecret: "" })
    ).toBe("Client Secret cannot be empty");
  });

  it("rejects missing redirectUri", () => {
    const { redirectUri, ...rest } = valid;
    expect(firstError(googleDriveBodySchema, rest)).toBe(
      "Redirect URI is required"
    );
  });

  it("rejects non-URI redirectUri with custom message", () => {
    expect(
      firstError(googleDriveBodySchema, {
        ...valid,
        redirectUri: "not-a-url",
      })
    ).toBe("Redirect URI must be a valid URL");
  });

  it("rejects missing storageType", () => {
    const { storageType, ...rest } = valid;
    expect(firstError(googleDriveBodySchema, rest)).toBe(
      "Storage type is required"
    );
  });

  it("rejects wrong storageType value", () => {
    expect(
      firstError(googleDriveBodySchema, {
        ...valid,
        storageType: "s3",
      })
    ).toBe("Storage type must be 'google_drive'");
  });
});

describe("s3Validator — happy path", () => {
  const valid = {
    name: "s3-prod",
    accessKeyId: "AKIA...",
    secretAccessKey: "secret",
    bucketName: "my-bucket",
    region: "us-east-1",
    storageType: "s3",
  };

  it("accepts a minimal valid payload", () => {
    const { error, value } = s3Validator.validate(valid);
    expect(error).toBeUndefined();
    expect(value.bucketName).toBe("my-bucket");
  });

  it("trims whitespace from string fields", () => {
    const { error, value } = s3Validator.validate({
      ...valid,
      bucketName: "  my-bucket  ",
      region: " us-east-1 ",
    });
    expect(error).toBeUndefined();
    expect(value.bucketName).toBe("my-bucket");
    expect(value.region).toBe("us-east-1");
  });

  it("accepts optional note", () => {
    const { error, value } = s3Validator.validate({
      ...valid,
      note: "backup target",
    });
    expect(error).toBeUndefined();
    expect(value.note).toBe("backup target");
  });
});

describe("s3Validator — required errors", () => {
  const valid = {
    name: "s3-prod",
    accessKeyId: "AKIA...",
    secretAccessKey: "secret",
    bucketName: "my-bucket",
    region: "us-east-1",
    storageType: "s3",
  };

  it("rejects missing name", () => {
    const { name, ...rest } = valid;
    expect(firstError(s3Validator, rest)).toBe(
      "Storage name is required"
    );
  });

  it("rejects empty name", () => {
    expect(firstError(s3Validator, { ...valid, name: "" })).toBe(
      "Storage name cannot be empty"
    );
  });

  it("rejects missing accessKeyId", () => {
    const { accessKeyId, ...rest } = valid;
    expect(firstError(s3Validator, rest)).toBe(
      "Access Key ID is required"
    );
  });

  it("rejects missing secretAccessKey", () => {
    const { secretAccessKey, ...rest } = valid;
    expect(firstError(s3Validator, rest)).toBe(
      "Secret Access Key is required"
    );
  });

  it("rejects missing bucketName", () => {
    const { bucketName, ...rest } = valid;
    expect(firstError(s3Validator, rest)).toBe(
      "Bucket Name is required"
    );
  });

  it("rejects missing region", () => {
    const { region, ...rest } = valid;
    expect(firstError(s3Validator, rest)).toBe("Region is required");
  });

  it("rejects missing storageType", () => {
    const { storageType, ...rest } = valid;
    expect(firstError(s3Validator, rest)).toBe(
      "Storage type is required"
    );
  });

  it("rejects wrong storageType value", () => {
    expect(
      firstError(s3Validator, { ...valid, storageType: "sftp" })
    ).toBe("Storage type must be 's3'");
  });
});

describe("sftpValidator — happy path", () => {
  const valid = {
    name: "sftp-archive",
    host: "sftp.example.com",
    port: 22,
    username: "user",
    password: "pw",
    storageType: "sftp",
  };

  it("accepts a minimal valid payload", () => {
    const { error, value } = sftpValidator.validate(valid);
    expect(error).toBeUndefined();
    expect(value.port).toBe(22);
  });

  it("accepts the optional path field", () => {
    const { error, value } = sftpValidator.validate({
      ...valid,
      path: "/incoming",
    });
    expect(error).toBeUndefined();
    expect(value.path).toBe("/incoming");
  });

  it("accepts the optional note field", () => {
    const { error, value } = sftpValidator.validate({
      ...valid,
      note: "off-site backup",
    });
    expect(error).toBeUndefined();
    expect(value.note).toBe("off-site backup");
  });

  it("accepts boundary port values 1 and 65535", () => {
    const minPort = sftpValidator.validate({ ...valid, port: 1 });
    expect(minPort.error).toBeUndefined();
    const maxPort = sftpValidator.validate({ ...valid, port: 65535 });
    expect(maxPort.error).toBeUndefined();
  });
});

describe("sftpValidator — required + range errors", () => {
  const valid = {
    name: "sftp-archive",
    host: "sftp.example.com",
    port: 22,
    username: "user",
    password: "pw",
    storageType: "sftp",
  };

  it("rejects missing name", () => {
    const { name, ...rest } = valid;
    expect(firstError(sftpValidator, rest)).toBe(
      "Storage name is required"
    );
  });

  it("rejects missing host", () => {
    const { host, ...rest } = valid;
    expect(firstError(sftpValidator, rest)).toBe("Host is required");
  });

  it("rejects missing port", () => {
    const { port, ...rest } = valid;
    expect(firstError(sftpValidator, rest)).toBe("Port is required");
  });

  it("rejects port below 1", () => {
    expect(firstError(sftpValidator, { ...valid, port: 0 })).toBe(
      "Port must be at least 1"
    );
  });

  it("rejects port above 65535", () => {
    expect(firstError(sftpValidator, { ...valid, port: 70000 })).toBe(
      "Port must be at most 65535"
    );
  });

  it("rejects non-numeric port", () => {
    expect(
      firstError(sftpValidator, { ...valid, port: "abc" })
    ).toBe("Port must be a number");
  });

  it("rejects missing username", () => {
    const { username, ...rest } = valid;
    expect(firstError(sftpValidator, rest)).toBe(
      "Username is required"
    );
  });

  it("rejects missing password", () => {
    const { password, ...rest } = valid;
    expect(firstError(sftpValidator, rest)).toBe(
      "Password is required"
    );
  });

  it("rejects missing storageType", () => {
    const { storageType, ...rest } = valid;
    expect(firstError(sftpValidator, rest)).toBe(
      "Storage type is required"
    );
  });

  it("rejects wrong storageType value", () => {
    expect(
      firstError(sftpValidator, {
        ...valid,
        storageType: "google_drive_oauth",
      })
    ).toBe("Storage type must be 'sftp'");
  });
});

describe("cross-validator invariants", () => {
  it("all three validators share the same required-name + storageType pattern", () => {
    const validators = [googleDriveBodySchema, s3Validator, sftpValidator];
    for (const v of validators) {
      const { error } = v.validate({});
      expect(error).toBeTruthy();
      // The first failure should always come from `name` because it's
      // listed first in every schema body.
      expect(error.details[0].message).toBe("Storage name is required");
    }
  });

  it("each schema exports a distinct Joi schema instance", () => {
    expect(googleDriveBodySchema).not.toBe(s3Validator);
    expect(s3Validator).not.toBe(sftpValidator);
    expect(googleDriveBodySchema).not.toBe(sftpValidator);
  });

  it("stripUnknown=false by default: extra fields cause validation error", () => {
    const valid = {
      name: "drive-1",
      clientId: "abc123",
      clientSecret: "shh",
      redirectUri: "https://app.example.com/oauth/callback",
      storageType: "google_drive_oauth",
      extra: "not allowed",
    };
    const { error } = googleDriveBodySchema.validate(valid);
    expect(error).toBeTruthy();
    expect(error.details[0].message).toMatch(/extra/);
  });
});
