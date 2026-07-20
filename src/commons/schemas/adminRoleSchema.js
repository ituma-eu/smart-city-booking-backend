const adminRoleSchemaDefinition = {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  name: { type: String, required: true },
  permissions: { type: [String], default: [] },
  // The built-in „Administrator" role: all permissions, cannot be edited or
  // deleted (lockout prevention).
  builtin: { type: Boolean, default: false },
  created: { type: Number, default: () => Date.now() },
};

module.exports = adminRoleSchemaDefinition;
