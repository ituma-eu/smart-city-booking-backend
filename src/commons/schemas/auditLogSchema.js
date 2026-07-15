const auditLogSchemaDefinition = {
  tenantId: { type: String, required: true },
  action: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Number, default: () => Date.now() },
};

module.exports = auditLogSchemaDefinition;
