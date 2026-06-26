const { Role } = require("../../entities/role/role");
const { RoleManager } = require("../../data-managers/role-manager");

const UNTERNEHMEN_ROLE_ID = "unternehmen";

const OWN_MANAGE = {
  create: true,
  readOwn: true,
  readAny: false,
  updateOwn: true,
  updateAny: false,
  deleteOwn: true,
  deleteAny: false,
};

const READ_OWN = {
  create: false,
  readOwn: true,
  readAny: false,
  updateOwn: false,
  updateAny: false,
  deleteOwn: false,
  deleteAny: false,
};

class CompanyRoleService {
  static async ensureUnternehmenRole(tenantId) {
    const existing = await RoleManager.getRole(UNTERNEHMEN_ROLE_ID, tenantId);
    if (existing) {
      return existing;
    }

    const role = Role.create({
      id: UNTERNEHMEN_ROLE_ID,
      name: "Unternehmen",
      tenantId,
      adminInterfaces: [],
      manageBookables: { ...OWN_MANAGE },
      manageBookings: { ...READ_OWN },
    });

    return RoleManager.storeRole(role, tenantId);
  }
}

module.exports = { CompanyRoleService };
