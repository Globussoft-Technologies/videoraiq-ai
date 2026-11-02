import service from "./agentActions.service.js";
const call = (method) => (req, res, next) => Promise.resolve(service[method](req, res)).catch(next);
export default {
  prepare: call("prepare"), decision: call("decision"), execute: call("execute"), get: call("get"), list: call("list"), auditEvents: call("auditEvents"), detectionStatus: call("detectionStatus"),
};
