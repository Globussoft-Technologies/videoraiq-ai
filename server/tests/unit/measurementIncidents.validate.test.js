import { describe, expect, it } from "vitest";
import {
  createQrMeasurementSchema,
  dsMeasurementResponseSchema,
  measurementDataUpdateSchema,
  measurementIncidentListSchema,
  measurementSkuSchema,
  measurementStatusSchema,
  processMeasurementSchema,
} from "../../core/v2/measurementIncidents/measurementIncidents.validate.js";

describe("measurement incident validation", () => {
  it("accepts QR metadata before depth measurements are available", () => {
    const result = createQrMeasurementSchema.validate({
      stationId: "88:a2:9e:d0:95:ec",
      qrImagePath: "http://backend:5055/api/v2/measurements/captures/qr.jpg",
      qrMetadata: { ref_no: "AK3984", sku: "G_OK8478", length: 78, breadth: 78, height: 6 },
    });
    expect(result.error).toBeUndefined();
  });

  it("accepts the request contract", () => {
    const result = processMeasurementSchema.validate({
      stationId: "L2-QC-01",
      qrImagePath: "/measurement-qr/qr.png",
      operatorId: "1234",
      payload: { batchId: "batch-1" },
    });
    expect(result.error).toBeUndefined();
  });

  it("requires the uploaded QR path and station", () => {
    const result = processMeasurementSchema.validate({ payload: {} }, { abortEarly: false });
    expect(result.error?.details).toHaveLength(2);
  });

  it("only allows accepted and rejected decisions", () => {
    expect(measurementStatusSchema.validate({ status: "accepted" }).error).toBeUndefined();
    expect(measurementStatusSchema.validate({ status: "pending" }).error).toBeDefined();
  });

  it("requires both DS response sections to be non-empty", () => {
    expect(
      dsMeasurementResponseSchema.validate({ qrMetadata: { sku: "A" }, measuredData: { length: 72 } }).error,
    ).toBeUndefined();
    expect(
      dsMeasurementResponseSchema.validate({ qrMetadata: {}, measuredData: {} }).error,
    ).toBeDefined();
  });

  it("requires non-empty measured data in DS updates", () => {
    expect(measurementDataUpdateSchema.validate({
      measuredData: { length: 77.9 },
      measurementImage: "http://192.168.0.33:8000/results/G_OK8478.jpg",
    }).error).toBeUndefined();
    expect(measurementDataUpdateSchema.validate({ measuredData: {} }).error).toBeDefined();
  });

  it("accepts a non-empty SKU lookup value", () => {
    expect(measurementSkuSchema.validate("G_OK8478").error).toBeUndefined();
    expect(measurementSkuSchema.validate(" ").error).toBeDefined();
  });

  it("validates and converts Measurement Incident list pagination", () => {
    const result = measurementIncidentListSchema.validate({
      stationId: "88:a2:9e:d0:95:ec",
      status: "accepted",
      page: "2",
      limit: "25",
    });
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({ page: 2, limit: 25, status: "accepted" });
    expect(measurementIncidentListSchema.validate({ limit: 101 }).error).toBeDefined();
  });
});
