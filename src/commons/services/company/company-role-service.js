const { Role } = require("../../entities/role/role");
const { RoleManager } = require("../../data-managers/role-manager");

const UNTERNEHMEN_ROLE_ID = "unternehmen";

class CompanyRoleService {
  static async ensureUnternehmenRole(tenantId) {
    const existing = await RoleManager.getRole(UNTERNEHMEN_ROLE_ID, tenantId);
    if (existing) {
      return existing;
    }

    // Company users are authorized through company_members + /me/context, not the
    // legacy booking RBAC, so this role grants no legacy permissions.
    const role = Role.create({
      id: UNTERNEHMEN_ROLE_ID,
      name: "Unternehmen",
      tenantId,
      adminInterfaces: [],
    });

    return RoleManager.storeRole(role, tenantId);
  }
}

module.exports = { CompanyRoleService };
