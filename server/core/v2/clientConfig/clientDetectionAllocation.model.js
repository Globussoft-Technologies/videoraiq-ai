// v2: re-exports from v1 - same collection, no duplication.
// Written only by server-superadmin; this backend reads it to enforce the
// per-detection camera allocation. See detectionLicense.service.js.
export * from "../../v1/clientConfig/clientDetectionAllocation.model.js";
export { default } from "../../v1/clientConfig/clientDetectionAllocation.model.js";
