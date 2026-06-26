const bunyan = require("bunyan");
const PermissionService = require("../../../commons/services/permission-service");
const { RolePermission } = require("../../../commons/entities/role/role");
const CompanyService = require("../../../commons/services/company/company-service");
const CompanyManager = require("../../../commons/data-managers/company-manager");
const CompanyMemberManager = require("../../../commons/data-managers/company-member-manager");

const logger = bunyan.createLogger({
  name: "company-controller.js",
  level: process.env.LOG_LEVEL,
});

const COMPANY_STATUS_FILTERS = ["unverified", "verified", "blocked"];

class CompanyController {
  static async register(request, response) {
    try {
      const tenantId = request.params.tenant;
      const company = await CompanyService.registerCompany(
        tenantId,
        request.body,
      );
      return response
        .status(201)
        .send({ id: company.id, status: company.status });
    } catch (error) {
      logger.error("Could not register company", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not register company");
    }
  }

  static async resendVerification(request, response) {
    try {
      const tenantId = request.params.tenant;
      await CompanyService.resendVerification(
        tenantId,
        request.body.email,
        request.body.nextUrl,
      );
      return response.status(200).send({
        message:
          "If an unverified account exists for this email, a verification email has been sent.",
      });
    } catch (error) {
      logger.error("Could not resend verification", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not resend verification");
    }
  }

  static async getCompanies(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const filter = COMPANY_STATUS_FILTERS.includes(request.query.status)
        ? { status: request.query.status }
        : {};
      const companies = await CompanyManager.getCompanies(tenantId, filter);
      return response.status(200).send(companies);
    } catch (error) {
      logger.error(error);
      return response.sendStatus(500);
    }
  }

  static async getMyCompany(request, response) {
    try {
      const tenantId = request.params.tenant;
      const member = await CompanyMemberManager.getMemberByUser(
        tenantId,
        request.user.id,
      );
      if (!member) {
        return response.sendStatus(404);
      }
      const company = await CompanyManager.getCompany(
        tenantId,
        member.companyId,
      );
      if (!company) {
        return response.sendStatus(404);
      }
      return response.status(200).send(company);
    } catch (error) {
      logger.error(error);
      return response.sendStatus(500);
    }
  }

  static async getCompany(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;

      const company = await CompanyManager.getCompany(tenantId, companyId);
      if (!company) {
        return response.sendStatus(404);
      }

      const isAdmin = await CompanyController.isTenantAdmin(
        request.user.id,
        tenantId,
      );
      const member = await CompanyMemberManager.getMemberByUser(
        tenantId,
        request.user.id,
      );
      const isMember = member !== null && member.companyId === companyId;
      if (!isAdmin && !isMember) {
        return response.sendStatus(403);
      }
      return response.status(200).send(company);
    } catch (error) {
      logger.error(error);
      return response.sendStatus(500);
    }
  }

  static async verify(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const company = await CompanyService.verifyCompany(
        tenantId,
        request.params.id,
      );
      return response.status(200).send(company);
    } catch (error) {
      logger.error("Could not verify company", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not verify company");
    }
  }

  static async block(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const company = await CompanyService.blockCompany(
        tenantId,
        request.params.id,
      );
      return response.status(200).send(company);
    } catch (error) {
      logger.error("Could not block company", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not block company");
    }
  }

  static async isTenantAdmin(userId, tenantId) {
    return PermissionService._allowUpdateAny(
      userId,
      tenantId,
      RolePermission.MANAGE_USERS,
    );
  }
}

module.exports = CompanyController;
