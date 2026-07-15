const bunyan = require("bunyan");
const AuditLogManager = require("../data-managers/audit-log-manager");

const logger = bunyan.createLogger({
  name: "audit-log-service.js",
  level: process.env.LOG_LEVEL,
});

const ACTIONS = ["create", "update", "delete"];

class AuditLogService {
  // Fire-and-forget: the write is kicked off but not awaited, so a slow or
  // failing audit insert never adds latency to — or breaks — the business
  // action that triggered it.
  static record(tenantId, action, message) {
    if (!tenantId || !ACTIONS.includes(action) || !message) {
      return;
    }
    AuditLogManager.append({ tenantId, action, message }).catch((error) => {
      logger.error("Could not write audit-log entry", error);
    });
  }

  static async list(tenantId, params) {
    return AuditLogManager.list(tenantId, params);
  }
}

module.exports = AuditLogService;
