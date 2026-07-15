const AuditLogModel = require("./models/auditLogModel");
const { escapeRegex } = require("../utilities/regexUtils");

class AuditLogManager {
  static async append(entry) {
    // Best-effort: if the connection is not ready, skip rather than queue the
    // write in mongoose's command buffer (which would otherwise resolve or time
    // out long after the request that triggered it has finished).
    if (AuditLogModel.db.readyState !== 1) {
      return;
    }
    await AuditLogModel.create(entry);
  }

  static async list(tenantId, { q, action, limit = 100, offset = 0 } = {}) {
    const filter = { tenantId };
    if (action) {
      filter.action = action;
    }
    if (q) {
      filter.message = { $regex: escapeRegex(String(q)), $options: "i" };
    }
    const rows = await AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);
    return rows.map((doc) => ({
      id: String(doc._id),
      action: doc.action,
      message: doc.message,
      createdAt: doc.createdAt,
    }));
  }
}

module.exports = AuditLogManager;
