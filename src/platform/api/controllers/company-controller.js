const bunyan = require("bunyan");
const PermissionService = require("../../../commons/services/permission-service");
const { RolePermission } = require("../../../commons/entities/role/role");
const CompanyService = require("../../../commons/services/company/company-service");
const CompanyManager = require("../../../commons/data-managers/company-manager");
const CompanyMemberManager = require("../../../commons/data-managers/company-member-manager");
const {
  NextcloudManager,
} = require("../../../commons/data-managers/file-manager");
const { v4: uuidv4 } = require("uuid");

const logger = bunyan.createLogger({
  name: "company-controller.js",
  level: process.env.LOG_LEVEL,
});

const COMPANY_STATUS_FILTERS = ["unverified", "verified", "blocked"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

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

  static async getMyContext(request, response) {
    try {
      const tenantId = request.params.tenant;
      const userId = request.user.id;

      if (await CompanyController.isTenantAdmin(userId, tenantId)) {
        return response.status(200).send({
          role: "admin",
          companyId: null,
          isOwner: false,
          branchId: "",
        });
      }

      const member = await CompanyMemberManager.getMemberByUser(
        tenantId,
        userId,
      );
      if (member) {
        return response.status(200).send({
          role: member.isOwner ? "company_owner" : "company_member",
          companyId: member.companyId,
          isOwner: member.isOwner === true,
          branchId: member.branchId || "",
        });
      }

      return response.status(200).send({
        role: "student",
        companyId: null,
        isOwner: false,
        branchId: "",
      });
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

  static async getPublicCompany(request, response) {
    try {
      const tenantId = request.params.tenant;
      const company = await CompanyManager.getCompany(
        tenantId,
        request.params.id,
      );
      if (!company || company.status !== "verified") {
        return response.sendStatus(404);
      }
      const media = await CompanyService.getCompanyMedia(
        tenantId,
        request.params.id,
      );
      return response.status(200).send({
        id: company.id,
        name: company.name,
        slug: company.slug,
        mail: company.mail,
        phone: company.phone,
        website: company.website,
        street: company.street,
        postalCode: company.postalCode,
        city: company.city,
        districtId: company.districtId,
        industryId: company.industryId,
        sizeId: company.sizeId,
        logoUrl: company.logoUrl,
        description: company.description,
        media: media.map((item) => ({
          id: item.id,
          url: item.url,
          type: item.type,
          created: item.created,
        })),
      });
    } catch (error) {
      logger.error(error);
      return response.sendStatus(500);
    }
  }

  static async updateProfile(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      if (
        !(await CompanyController.isOwnerOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const company = await CompanyService.updateCompanyProfile(
        tenantId,
        companyId,
        request.body,
      );
      return response.status(200).send(company);
    } catch (error) {
      logger.error("Could not update company profile", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not update company profile");
    }
  }

  static async uploadLogo(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      if (
        !(await CompanyController.isOwnerOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const file = request.files && request.files.file;
      if (
        !file ||
        !file.name ||
        file.name.includes("..") ||
        file.name.includes("/")
      ) {
        return response.status(400).send("Invalid or missing file.");
      }
      if (!file.mimetype || !file.mimetype.startsWith("image/")) {
        return response.status(400).send("Logo must be an image.");
      }
      if (file.data.length > MAX_IMAGE_BYTES) {
        return response.status(413).send("Logo file is too large (max 8 MB).");
      }
      const existing = await CompanyManager.getCompany(tenantId, companyId);
      if (!existing) {
        return response.sendStatus(404);
      }
      await CompanyController._deleteLogoFile(tenantId, existing.logoUrl);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${companyId}-${safeName}`;
      await NextcloudManager.createFile(
        tenantId,
        file.data,
        fileName,
        "public",
        "public/logos",
      );
      const logoUrl = `${process.env.BACKEND_URL}/api/${tenantId}/files/get?name=/public/logos/${encodeURIComponent(fileName)}`;
      const company = await CompanyService.setCompanyLogo(
        tenantId,
        companyId,
        logoUrl,
      );
      return response.status(200).send(company);
    } catch (error) {
      logger.error("Could not upload logo", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not upload logo");
    }
  }

  static async removeLogo(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      if (
        !(await CompanyController.isOwnerOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const existing = await CompanyManager.getCompany(tenantId, companyId);
      if (!existing) {
        return response.sendStatus(404);
      }
      await CompanyController._deleteLogoFile(tenantId, existing.logoUrl);
      const company = await CompanyService.removeCompanyLogo(
        tenantId,
        companyId,
      );
      return response.status(200).send(company);
    } catch (error) {
      logger.error("Could not remove logo", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not remove logo");
    }
  }

  static async listMedia(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      if (
        !(await CompanyController.isMemberOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const media = await CompanyService.getCompanyMedia(tenantId, companyId);
      return response.status(200).send(media);
    } catch (error) {
      logger.error(error);
      return response.sendStatus(500);
    }
  }

  static async uploadMedia(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      if (
        !(await CompanyController.isOwnerOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const file = request.files && request.files.file;
      if (
        !file ||
        !file.name ||
        file.name.includes("..") ||
        file.name.includes("/")
      ) {
        return response.status(400).send("Invalid or missing file.");
      }
      const isVideo = !!(file.mimetype && file.mimetype.startsWith("video/"));
      const isImage = !!(file.mimetype && file.mimetype.startsWith("image/"));
      if (!isImage && !isVideo) {
        return response.status(400).send("Media must be an image or video.");
      }
      if (file.data.length > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
        return response
          .status(413)
          .send("Media file is too large (max 8 MB image / 100 MB video).");
      }
      const existing = await CompanyManager.getCompany(tenantId, companyId);
      if (!existing) {
        return response.sendStatus(404);
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const bareName = `${companyId}-${uuidv4()}-${safeName}`;
      await NextcloudManager.createFile(
        tenantId,
        file.data,
        bareName,
        "public",
        "public/media",
      );
      const fileName = `public/media/${bareName}`;
      const url = `${process.env.BACKEND_URL}/api/${tenantId}/files/get?name=/${fileName}`;
      const type = isVideo ? "video" : "image";
      const media = await CompanyService.addCompanyMedia(tenantId, companyId, {
        url,
        fileName,
        type,
      });
      return response.status(201).send(media);
    } catch (error) {
      logger.error("Could not upload media", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not upload media");
    }
  }

  static async removeMedia(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      if (
        !(await CompanyController.isOwnerOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const media = await CompanyService.removeCompanyMedia(
        tenantId,
        companyId,
        request.params.mediaId,
      );
      if (media.fileName) {
        try {
          await NextcloudManager.deleteFile(tenantId, media.fileName);
        } catch (e) {
          logger.warn(`Could not delete media file: ${e.message}`);
        }
      }
      return response.status(200).send({ id: media.id });
    } catch (error) {
      logger.error("Could not remove media", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not remove media");
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

  static async listBranches(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      const access = await CompanyController.getBranchAccess(
        request.user.id,
        tenantId,
        companyId,
      );
      if (!access.isAdmin && !access.member) {
        return response.sendStatus(403);
      }
      const branches = await CompanyService.getCompanyBranches(
        tenantId,
        companyId,
      );
      return response.status(200).send(branches);
    } catch (error) {
      logger.error(error);
      return response.sendStatus(500);
    }
  }

  static async getBranch(request, response) {
    try {
      const { tenant: tenantId, id: companyId, branchId } = request.params;
      const access = await CompanyController.getBranchAccess(
        request.user.id,
        tenantId,
        companyId,
      );
      if (!access.isAdmin && !access.member) {
        return response.sendStatus(403);
      }
      const branch = await CompanyService.getCompanyBranch(
        tenantId,
        companyId,
        branchId,
      );
      return response.status(200).send(branch);
    } catch (error) {
      logger.error("Could not get branch", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not get branch");
    }
  }

  static async createBranch(request, response) {
    try {
      const { tenant: tenantId, id: companyId } = request.params;
      const access = await CompanyController.getBranchAccess(
        request.user.id,
        tenantId,
        companyId,
      );
      if (!access.isAdmin && !(access.member && access.member.isOwner)) {
        return response.sendStatus(403);
      }
      const branch = await CompanyService.createCompanyBranch(
        tenantId,
        companyId,
        request.body,
      );
      return response.status(201).send(branch);
    } catch (error) {
      logger.error("Could not create branch", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not create branch");
    }
  }

  static async updateBranch(request, response) {
    try {
      const { tenant: tenantId, id: companyId, branchId } = request.params;
      if (
        !(await CompanyController.canEditBranch(
          request.user.id,
          tenantId,
          companyId,
          branchId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const branch = await CompanyService.updateCompanyBranch(
        tenantId,
        companyId,
        branchId,
        request.body,
      );
      return response.status(200).send(branch);
    } catch (error) {
      logger.error("Could not update branch", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not update branch");
    }
  }

  static async removeBranch(request, response) {
    try {
      const { tenant: tenantId, id: companyId, branchId } = request.params;
      const access = await CompanyController.getBranchAccess(
        request.user.id,
        tenantId,
        companyId,
      );
      if (!access.isAdmin && !(access.member && access.member.isOwner)) {
        return response.sendStatus(403);
      }
      const branch = await CompanyService.removeCompanyBranch(
        tenantId,
        companyId,
        branchId,
      );
      await CompanyController._deleteLogoFile(tenantId, branch.logoUrl);
      return response.status(200).send({ id: branch.id });
    } catch (error) {
      logger.error("Could not remove branch", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not remove branch");
    }
  }

  static async uploadBranchLogo(request, response) {
    try {
      const { tenant: tenantId, id: companyId, branchId } = request.params;
      if (
        !(await CompanyController.canEditBranch(
          request.user.id,
          tenantId,
          companyId,
          branchId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const file = request.files && request.files.file;
      if (
        !file ||
        !file.name ||
        file.name.includes("..") ||
        file.name.includes("/")
      ) {
        return response.status(400).send("Invalid or missing file.");
      }
      if (!file.mimetype || !file.mimetype.startsWith("image/")) {
        return response.status(400).send("Logo must be an image.");
      }
      if (file.data.length > MAX_IMAGE_BYTES) {
        return response.status(413).send("Logo file is too large (max 8 MB).");
      }
      const existing = await CompanyService.getCompanyBranch(
        tenantId,
        companyId,
        branchId,
      );
      await CompanyController._deleteLogoFile(tenantId, existing.logoUrl);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${branchId}-${safeName}`;
      await NextcloudManager.createFile(
        tenantId,
        file.data,
        fileName,
        "public",
        "public/branch-logos",
      );
      const logoUrl = `${process.env.BACKEND_URL}/api/${tenantId}/files/get?name=/public/branch-logos/${encodeURIComponent(fileName)}`;
      const branch = await CompanyService.setBranchLogo(
        tenantId,
        companyId,
        branchId,
        logoUrl,
      );
      return response.status(200).send(branch);
    } catch (error) {
      logger.error("Could not upload branch logo", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not upload branch logo");
    }
  }

  static async removeBranchLogo(request, response) {
    try {
      const { tenant: tenantId, id: companyId, branchId } = request.params;
      if (
        !(await CompanyController.canEditBranch(
          request.user.id,
          tenantId,
          companyId,
          branchId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const existing = await CompanyService.getCompanyBranch(
        tenantId,
        companyId,
        branchId,
      );
      await CompanyController._deleteLogoFile(tenantId, existing.logoUrl);
      const branch = await CompanyService.removeBranchLogo(
        tenantId,
        companyId,
        branchId,
      );
      return response.status(200).send(branch);
    } catch (error) {
      logger.error("Could not remove branch logo", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not remove branch logo");
    }
  }

  static async inviteMember(request, response) {
    try {
      const { tenant: tenantId, id: companyId } = request.params;
      if (
        !(await CompanyController.isOwnerOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const invitation = await CompanyService.inviteMember(
        tenantId,
        companyId,
        request.user.id,
        request.body,
      );
      return response.status(201).send(invitation);
    } catch (error) {
      logger.error("Could not invite member", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not invite member");
    }
  }

  static async listMembers(request, response) {
    try {
      const { tenant: tenantId, id: companyId } = request.params;
      if (
        !(await CompanyController.isMemberOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const members = await CompanyService.listCompanyMembers(
        tenantId,
        companyId,
      );
      return response.status(200).send(members);
    } catch (error) {
      logger.error(error);
      return response.sendStatus(500);
    }
  }

  static async removeMember(request, response) {
    try {
      const { tenant: tenantId, id: companyId, userId } = request.params;
      if (
        !(await CompanyController.isOwnerOrAdmin(
          request.user.id,
          tenantId,
          companyId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const result = await CompanyService.removeCompanyMember(
        tenantId,
        companyId,
        userId,
      );
      return response.status(200).send(result);
    } catch (error) {
      logger.error("Could not remove member", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not remove member");
    }
  }

  static async acceptInvitation(request, response) {
    try {
      const tenantId = request.params.tenant;
      const result = await CompanyService.acceptMemberInvitation(
        tenantId,
        request.params.token,
        request.body.password,
      );
      return response.status(200).send(result);
    } catch (error) {
      logger.error("Could not accept invitation", error);
      return response
        .status(error.status || 500)
        .send(error.message || "Could not accept invitation");
    }
  }

  static async isTenantAdmin(userId, tenantId) {
    return PermissionService._allowUpdateAny(
      userId,
      tenantId,
      RolePermission.MANAGE_USERS,
    );
  }

  static async isOwnerOrAdmin(userId, tenantId, companyId) {
    if (await CompanyController.isTenantAdmin(userId, tenantId)) {
      return true;
    }
    const member = await CompanyMemberManager.getMemberByUser(tenantId, userId);
    return (
      member !== null &&
      member.companyId === companyId &&
      member.isOwner === true
    );
  }

  static async isMemberOrAdmin(userId, tenantId, companyId) {
    if (await CompanyController.isTenantAdmin(userId, tenantId)) {
      return true;
    }
    const member = await CompanyMemberManager.getMemberByUser(tenantId, userId);
    return member !== null && member.companyId === companyId;
  }

  static async getBranchAccess(userId, tenantId, companyId) {
    if (await CompanyController.isTenantAdmin(userId, tenantId)) {
      return { isAdmin: true, member: null };
    }
    const member = await CompanyMemberManager.getMemberByUser(tenantId, userId);
    const isMember = member !== null && member.companyId === companyId;
    return { isAdmin: false, member: isMember ? member : null };
  }

  static async canEditBranch(userId, tenantId, companyId, branchId) {
    const access = await CompanyController.getBranchAccess(
      userId,
      tenantId,
      companyId,
    );
    if (access.isAdmin) {
      return true;
    }
    const member = access.member;
    return (
      member !== null &&
      (member.isOwner === true ||
        member.branchId === "" ||
        member.branchId === branchId)
    );
  }

  static async _deleteLogoFile(tenantId, logoUrl) {
    if (!logoUrl) {
      return;
    }
    let path = null;
    try {
      path = new URL(logoUrl).searchParams.get("name");
    } catch {
      return;
    }
    if (!path) {
      return;
    }
    try {
      await NextcloudManager.deleteFile(tenantId, path);
    } catch (e) {
      logger.warn(`Could not delete logo file: ${e.message}`);
    }
  }
}

module.exports = CompanyController;
