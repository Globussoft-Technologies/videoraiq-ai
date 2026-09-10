import mongoose from "mongoose";
import logger from "../../../utils/logger.js";
import Response from "../../../utils/response.js";
import { sendMeasurement, sendPayloadToUser } from "../../../socket.js";
import MeasurementIncident from "./measurementIncidents.model.js";
import { MeasurementDsError, processWithDs } from "./measurementDs.client.js";
import {
  createQrMeasurementSchema,
  dsMeasurementResponseSchema,
  measurementBySkuUpdateSchema,
  measurementBySkuQuerySchema,
  measurementIncidentListSchema,
  measurementDataUpdateSchema,
  measurementSkuSchema,
  measurementStatusSchema,
  processMeasurementSchema,
  validationMessages,
} from "./measurementIncidents.validate.js";

function identityFrom(req) {
  const user = req.verified?.userData || {};
  return {
    system: user.system === true,
    adminId: String(user.adminId || user.admin_id || "").trim(),
    userId: String(user.user_id || user.userId || "").trim(),
    actorId: String(user.memberId || user.userId || user.user_id || user.adminId || "").trim(),
    stationId: String(user.stationId || "").trim().toLowerCase(),
  };
}

function ownedDocumentFilter(id, identity) {
  const filter = { _id: id };
  if (identity.system) return filter;

  const ownerClauses = [];
  if (identity.adminId) ownerClauses.push({ adminId: identity.adminId });
  if (identity.userId) ownerClauses.push({ userId: identity.userId });
  if (identity.stationId) ownerClauses.push({ stationId: identity.stationId });
  return ownerClauses.length ? { ...filter, $or: ownerClauses } : null;
}

function normalizedSku(value) {
  return String(value || "").trim().toUpperCase();
}

function isMacStationId(value) {
  return /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(String(value || "").trim());
}

function normalizedMeasurementImage(value) {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(value.url || value.storagePath || "").trim() || null;
  }
  return null;
}

function relativeCapturePath(value) {
  const source = String(value || "").trim();
  if (!source) return source;
  try {
    const parsed = new URL(source, "http://measurement.local");
    if (parsed.pathname.startsWith("/api/v2/measurements/captures/")) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Validation handles malformed values. Keep non-capture references intact.
  }
  return source;
}

function relativeQrImage(image, fallbackPath) {
  if (!image || typeof image !== "object" || Array.isArray(image)) {
    return { url: fallbackPath };
  }
  const normalized = { ...image };
  if (normalized.url) normalized.url = relativeCapturePath(normalized.url);
  return normalized;
}

function ownerClauses(identity) {
  const clauses = [];
  if (identity.adminId) clauses.push({ adminId: identity.adminId });
  if (identity.userId) clauses.push({ userId: identity.userId });
  if (identity.stationId) clauses.push({ stationId: identity.stationId });
  return clauses;
}

class MeasurementIncidentsService {
  async createFromQr(req, res) {
    const validation = createQrMeasurementSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (validation.error) {
      return res.status(400).json(
        Response.validationFailResp("Invalid QR measurement payload", validationMessages(validation.error)),
      );
    }

    const identity = identityFrom(req);
    const requestedAdminId = identity.adminId;
    if (!requestedAdminId) {
      return res.status(400).json(
        Response.validationFailResp("Unable to resolve measurement owner", "adminId is required"),
      );
    }
    if (identity.stationId && identity.stationId !== validation.value.stationId.toLowerCase()) {
      return res.status(403).json(
        Response.accessDeniedResp("stationId does not match the approved station token"),
      );
    }

    try {
      const input = validation.value;
      const qrImagePath = relativeCapturePath(input.qrImagePath);
      const incident = await MeasurementIncident.create({
        adminId: requestedAdminId,
        userId: identity.userId || null,
        operatorId: input.operatorId || null,
        stationId: input.stationId.toLowerCase(),
        qrImagePath,
        qrImage: relativeQrImage(input.qrImage, qrImagePath),
        requestPayload: { qrResponse: input.qrResponse || {} },
        qrSku: normalizedSku(input.qrMetadata.sku),
        qrMetadata: input.qrMetadata,
        measuredData: {},
        dsProcessedAt: null,
      });
      const socketPayload = incident.toObject();
      logger.info(
        `[MEASUREMENT_INCIDENT] QR incident created id=${socketPayload._id} sku=${socketPayload.qrSku} station=${socketPayload.stationId}`,
      );
      if (identity.userId) await sendPayloadToUser(identity.userId, "measurement", socketPayload);
      sendMeasurement(input.stationId, socketPayload);
      return res.status(201).json(
        Response.userSuccessResp("QR measurement incident created", socketPayload),
      );
    } catch (error) {
      logger.error(`QR measurement incident creation failed: ${error.message}`);
      return res.status(500).json(
        Response.errorResp("Failed to create QR measurement incident", error.message),
      );
    }
  }

  async process(req, res) {
    const requestValidation = processMeasurementSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (requestValidation.error) {
      return res.status(400).json(
        Response.validationFailResp(
          "Invalid measurement payload",
          validationMessages(requestValidation.error),
        ),
      );
    }
    const identity = identityFrom(req);
    // Service callers do not carry tenant claims, so they must provide the
    // owner in their internal payload. Browser callers always use token claims.
    const requestedAdminId = identity.system
      ? String(req.body?.payload?.adminId || "").trim()
      : identity.adminId;
    if (!requestedAdminId) {
      return res.status(400).json(
        Response.validationFailResp(
          "Unable to resolve measurement owner",
          "adminId is required",
        ),
      );
    }

    try {
      const input = requestValidation.value;
      const dsResponse = await processWithDs({
        ...input.payload,
        stationId: input.stationId,
        qrImagePath: input.qrImagePath,
        operatorId: input.operatorId,
      });

      const responseValidation = dsMeasurementResponseSchema.validate(dsResponse, {
        abortEarly: false,
        stripUnknown: false,
      });
      if (responseValidation.error) {
        return res.status(502).json(
          Response.userFailResp(
            "Measurement DS API returned an invalid response",
            validationMessages(responseValidation.error),
          ),
        );
      }

      const processed = responseValidation.value;
      const incident = await MeasurementIncident.create({
        adminId: requestedAdminId,
        userId: identity.userId || null,
        operatorId: input.operatorId || null,
        stationId: input.stationId,
        qrImagePath: input.qrImagePath,
        requestPayload: input.payload,
        qrSku: normalizedSku(processed.qrMetadata?.sku || processed.qrMetadata?.skuCode),
        qrMetadata: processed.qrMetadata,
        measuredData: processed.measuredData,
        measurementImage: normalizedMeasurementImage(processed.measurementImage),
        dsProcessedAt: processed.processedAt || new Date(),
      });

      const socketPayload = incident.toObject();
      if (identity.userId) await sendPayloadToUser(identity.userId, "measurement", socketPayload);
      sendMeasurement(input.stationId, socketPayload);

      return res.status(201).json(
        Response.userSuccessResp(
          "Measurement incident created successfully",
          socketPayload,
        ),
      );
    } catch (error) {
      const status = error instanceof MeasurementDsError ? error.statusCode : 500;
      logger.error(`Measurement incident processing failed: ${error.message}`);
      return res.status(status).json(
        status === 500
          ? Response.errorResp("Failed to process measurement", error.message)
          : Response.userFailResp("Failed to process measurement", error.message),
      );
    }
  }

  async updateStatus(req, res) {
    const validation = measurementStatusSchema.validate(req.body, {
      abortEarly: false,
    });
    if (validation.error) {
      return res.status(400).json(
        Response.validationFailResp(
          "Invalid measurement status",
          validationMessages(validation.error),
        ),
      );
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json(
        Response.validationFailResp("Invalid measurement incident id", req.params.id),
      );
    }

    try {
      const identity = identityFrom(req);
      const filter = ownedDocumentFilter(req.params.id, identity);
      if (!filter) {
        return res.status(403).json(
          Response.accessDeniedResp("Measurement incident access denied"),
        );
      }

      const incident = await MeasurementIncident.findOneAndUpdate(
        filter,
        {
          $set: {
            status: validation.value.status,
            statusUpdatedAt: new Date(),
            statusUpdatedBy: identity.actorId || null,
          },
        },
        { new: true, runValidators: true },
      ).lean();

      if (!incident) {
        return res.status(404).json(
          Response.notFoundResp("Measurement incident not found"),
        );
      }

      return res.status(200).json(
        Response.userSuccessResp("Measurement incident status updated", incident),
      );
    } catch (error) {
      logger.error(`Measurement incident status update failed: ${error.message}`);
      return res.status(500).json(
        Response.errorResp("Failed to update measurement incident", error.message),
      );
    }
  }

  async updateMeasurement(req, res) {
    const validation = measurementDataUpdateSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
      return res.status(400).json(
        Response.validationFailResp("Invalid measured data payload", validationMessages(validation.error)),
      );
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json(
        Response.validationFailResp("Invalid measurement incident id", req.params.id),
      );
    }

    try {
      const identity = identityFrom(req);
      const filter = ownedDocumentFilter(req.params.id, identity);
      if (!filter) return res.status(403).json(Response.accessDeniedResp("Measurement incident access denied"));

      const incident = await MeasurementIncident.findOneAndUpdate(
        filter,
        {
          $set: {
            measuredData: validation.value.measuredData,
            measurementImage: normalizedMeasurementImage(validation.value.measurementImage),
            dsProcessedAt: validation.value.processedAt || new Date(),
          },
        },
        { new: true, runValidators: true },
      ).lean();
      if (!incident) return res.status(404).json(Response.notFoundResp("Measurement incident not found"));

      if (identity.userId) await sendPayloadToUser(identity.userId, "measurement", incident);
      sendMeasurement(incident.stationId, incident);
      logger.info(
        `[MEASUREMENT_INCIDENT] DS measurement stored id=${incident._id} sku=${incident.qrSku || "unknown"} station=${incident.stationId} source=id`,
      );
      return res.status(200).json(
        Response.userSuccessResp("Measurement data updated", incident),
      );
    } catch (error) {
      logger.error(`Measurement data update failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to update measurement data", error.message));
    }
  }

  async updateMeasurementBySku(req, res) {
    const skuValidation = measurementSkuSchema.validate(req.params.sku);
    const bodyValidation = measurementBySkuUpdateSchema.validate(req.body, { abortEarly: false });
    if (skuValidation.error || bodyValidation.error) {
      logger.warn(
        `[MEASUREMENT_INCIDENT] DS PATCH rejected validation sku=${req.params.sku || "missing"} payload=${JSON.stringify(req.body || {})}`,
      );
      return res.status(400).json(
        Response.validationFailResp(
          "Invalid SKU measurement payload",
          skuValidation.error
            ? validationMessages(skuValidation.error)
            : validationMessages(bodyValidation.error),
        ),
      );
    }

    try {
      const identity = identityFrom(req);
      logger.info(
        `[MEASUREMENT_INCIDENT] DS PATCH received sku=${normalizedSku(skuValidation.value)} payload=${JSON.stringify(bodyValidation.value)}`,
      );
      const filter = {
        qrSku: normalizedSku(skuValidation.value),
        status: "pending",
      };
      if (bodyValidation.value.stationId && isMacStationId(bodyValidation.value.stationId)) {
        filter.stationId = bodyValidation.value.stationId.toLowerCase();
      } else if (bodyValidation.value.stationId) {
        logger.warn(
          `[MEASUREMENT_INCIDENT] DS PATCH ignoring non-MAC station alias=${bodyValidation.value.stationId}; matching newest pending incident by SKU`,
        );
      }
      if (!identity.system) {
        const clauses = ownerClauses(identity);
        if (!clauses.length) {
          return res.status(403).json(Response.accessDeniedResp("Measurement incident access denied"));
        }
        filter.$or = clauses;
      }

      const incident = await MeasurementIncident.findOneAndUpdate(
        filter,
        {
          $set: {
            measuredData: bodyValidation.value.measuredData,
            measurementImage: normalizedMeasurementImage(bodyValidation.value.measurementImage),
            dsProcessedAt: bodyValidation.value.processedAt || new Date(),
          },
        },
        { new: true, runValidators: true, sort: { createdAt: -1 } },
      ).lean();
      if (!incident) {
        logger.warn(
          `[MEASUREMENT_INCIDENT] DS PATCH matched no pending incident sku=${normalizedSku(skuValidation.value)} station=${bodyValidation.value.stationId || "unspecified"}`,
        );
        return res.status(404).json(Response.notFoundResp("No pending Measurement Incident found for this SKU"));
      }

      if (identity.userId) await sendPayloadToUser(identity.userId, "measurement", incident);
      sendMeasurement(incident.stationId, incident);
      logger.info(
        `[MEASUREMENT_INCIDENT] DS PATCH response status=200 id=${incident._id} sku=${incident.qrSku} station=${incident.stationId} measuredData=${JSON.stringify(incident.measuredData)} measurementImage=${JSON.stringify(incident.measurementImage || null)}`,
      );
      return res.status(200).json(Response.userSuccessResp("Measurement data updated", incident));
    } catch (error) {
      logger.error(`SKU measurement data update failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to update measurement data", error.message));
    }
  }

  async findOne(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json(Response.validationFailResp("Invalid measurement incident id", req.params.id));
    }
    try {
      const filter = ownedDocumentFilter(req.params.id, identityFrom(req));
      if (!filter) return res.status(403).json(Response.accessDeniedResp("Measurement incident access denied"));
      const incident = await MeasurementIncident.findOne(filter).lean();
      if (!incident) return res.status(404).json(Response.notFoundResp("Measurement incident not found"));
      return res.status(200).json(Response.userSuccessResp("Measurement incident fetched", incident));
    } catch (error) {
      logger.error(`Measurement incident fetch failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to fetch measurement incident", error.message));
    }
  }

  async list(req, res) {
    const validation = measurementIncidentListSchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (validation.error) {
      return res.status(400).json(
        Response.validationFailResp("Invalid Measurement Incident list query", validationMessages(validation.error)),
      );
    }

    try {
      const identity = identityFrom(req);
      const requestedStationId = String(validation.value.stationId || "").trim().toLowerCase();
      if (identity.stationId && requestedStationId && identity.stationId !== requestedStationId) {
        return res.status(403).json(
          Response.accessDeniedResp("stationId does not match the approved station token"),
        );
      }

      const filter = {};
      const stationId = identity.stationId || requestedStationId;
      if (stationId) filter.stationId = stationId;
      if (validation.value.status) filter.status = validation.value.status;
      if (!identity.system) {
        const clauses = ownerClauses(identity);
        if (!clauses.length) {
          return res.status(403).json(Response.accessDeniedResp("Measurement incident access denied"));
        }
        filter.$or = clauses;
      }

      const page = validation.value.page;
      const limit = validation.value.limit;
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        MeasurementIncident.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        MeasurementIncident.countDocuments(filter),
      ]);
      return res.status(200).json(
        Response.userSuccessResp("Measurement incidents fetched", {
          items,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        }),
      );
    } catch (error) {
      logger.error(`Measurement incident list failed: ${error.message}`);
      return res.status(500).json(Response.errorResp("Failed to fetch measurement incidents", error.message));
    }
  }

  async findLatestBySku(req, res) {
    const skuValidation = measurementSkuSchema.validate(req.params.sku);
    const queryValidation = measurementBySkuQuerySchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (skuValidation.error || queryValidation.error) {
      return res.status(400).json(
        Response.validationFailResp(
          "Invalid Measurement Incident lookup",
          validationMessages(skuValidation.error || queryValidation.error),
        ),
      );
    }

    try {
      const identity = identityFrom(req);
      const requestedStationId = String(queryValidation.value.stationId || "").trim().toLowerCase();
      if (identity.stationId && requestedStationId && identity.stationId !== requestedStationId) {
        return res.status(403).json(
          Response.accessDeniedResp("stationId does not match the approved station token"),
        );
      }

      const filter = { qrSku: normalizedSku(skuValidation.value) };
      const stationId = identity.stationId || requestedStationId;
      if (stationId) filter.stationId = stationId;
      if (queryValidation.value.status) filter.status = queryValidation.value.status;

      if (!identity.system) {
        const clauses = ownerClauses(identity);
        if (!clauses.length) {
          return res.status(403).json(Response.accessDeniedResp("Measurement incident access denied"));
        }
        filter.$or = clauses;
      }

      const incident = await MeasurementIncident.findOne(filter).sort({ createdAt: -1 }).lean();
      if (!incident) {
        return res.status(404).json(
          Response.notFoundResp("Measurement incident not found for this SKU"),
        );
      }
      return res.status(200).json(
        Response.userSuccessResp("Latest Measurement Incident fetched by SKU", incident),
      );
    } catch (error) {
      logger.error(`SKU Measurement Incident fetch failed: ${error.message}`);
      return res.status(500).json(
        Response.errorResp("Failed to fetch Measurement Incident", error.message),
      );
    }
  }

  async reset(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json(
        Response.validationFailResp("Invalid measurement incident id", req.params.id),
      );
    }

    try {
      const identity = identityFrom(req);
      const filter = ownedDocumentFilter(req.params.id, identity);
      if (!filter) {
        return res.status(403).json(
          Response.accessDeniedResp("Measurement incident access denied"),
        );
      }

      const incident = await MeasurementIncident.findOneAndDelete(filter).lean();
      if (!incident) {
        return res.status(404).json(
          Response.notFoundResp("Measurement incident not found"),
        );
      }

      return res.status(200).json(
        Response.userSuccessResp("Measurement incident reset successfully", {
          id: String(incident._id),
        }),
      );
    } catch (error) {
      logger.error(`Measurement incident reset failed: ${error.message}`);
      return res.status(500).json(
        Response.errorResp("Failed to reset measurement incident", error.message),
      );
    }
  }
}

export { identityFrom, ownedDocumentFilter };
export default new MeasurementIncidentsService();
