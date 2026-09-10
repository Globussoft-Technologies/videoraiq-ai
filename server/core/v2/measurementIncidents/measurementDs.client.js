import axios from "axios";
import config from "config";

export class MeasurementDsError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "MeasurementDsError";
    this.statusCode = statusCode;
  }
}

/**
 * Isolates the unfinished DS contract from the rest of the feature. Once DS
 * supplies its endpoint/auth/payload details, only this adapter should need to
 * change. For now it can be enabled with MeasurementService.url.
 */
export async function processWithDs(payload) {
  if (!config.has("MeasurementService.url")) {
    throw new MeasurementDsError(
      "Measurement DS API is not configured yet",
      503,
    );
  }

  const url = String(config.get("MeasurementService.url") || "").trim();
  if (!url) {
    throw new MeasurementDsError(
      "Measurement DS API is not configured yet",
      503,
    );
  }

  const headers = {};
  if (config.has("MeasurementService.token")) {
    const token = String(config.get("MeasurementService.token") || "").trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await axios.post(url, payload, {
      headers,
      timeout: config.has("MeasurementService.timeoutMs")
        ? Number(config.get("MeasurementService.timeoutMs"))
        : 30_000,
    });

    // Accommodate the two envelope styles already used by VideoraIQ services.
    return response.data?.body?.data ?? response.data?.data ?? response.data;
  } catch (error) {
    if (error instanceof MeasurementDsError) throw error;
    throw new MeasurementDsError(
      error.response?.data?.message || error.message || "Measurement DS API failed",
    );
  }
}
