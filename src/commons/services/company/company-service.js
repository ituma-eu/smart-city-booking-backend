const { v4: uuidv4 } = require("uuid");
const { User, USER_HOOK_TYPES } = require("../../entities/user/user");
const UserManager = require("../../data-managers/user-manager");
const UserService = require("../user-service");
const MembershipManager = require("../../data-managers/membership-manager");
const TenantManager = require("../../data-managers/tenant-manager");
const CompanyManager = require("../../data-managers/company-manager");
const CompanyMemberManager = require("../../data-managers/company-member-manager");
const CompanyMediaManager = require("../../data-managers/company-media-manager");
const TaxonomyTermManager = require("../../data-managers/taxonomy-term-manager");
const { CompanyRoleService } = require("./company-role-service");
const { isEmail } = require("validator");

async function assertTaxonomyRef(tenantId, id, type, label) {
  if (!id) {
    return;
  }
  const term = await TaxonomyTermManager.getTerm(tenantId, id);
  if (!term || term.type !== type || !term.active) {
    throw { message: `Invalid ${label}`, status: 400 };
  }
}

class CompanyService {
  static async registerCompany(tenantId, payload) {
    const owner = payload.owner || {};
    const companyData = payload.company || {};
    const consents = payload.consents || {};

    const email = String(owner.id || "")
      .trim()
      .toLowerCase();

    if (!email || !owner.password || !companyData.name) {
      throw { message: "Missing required parameters", status: 400 };
    }
    if (String(owner.password).length < 8) {
      throw { message: "Password must be at least 8 characters", status: 400 };
    }
    if (
      !consents.privacyConsent ||
      !consents.authorizedToRepresent ||
      !consents.consent
    ) {
      throw { message: "All consents are required", status: 400 };
    }

    const tenant = await TenantManager.getTenant(tenantId);
    if (!tenant) {
      throw { message: "Tenant not found", status: 404 };
    }

    await assertTaxonomyRef(
      tenantId,
      companyData.districtId,
      "district",
      "Kreis",
    );
    await assertTaxonomyRef(
      tenantId,
      companyData.industryId,
      "industry",
      "Branche",
    );
    await assertTaxonomyRef(
      tenantId,
      companyData.sizeId,
      "company_size",
      "Unternehmensgröße",
    );

    const existingUser = await UserManager.getUserBy({ id: email });
    if (existingUser) {
      throw { message: "Email already in use", status: 409 };
    }

    const existingMembership =
      await MembershipManager.getMembershipByTenantAndUserID(tenantId, email);
    if (existingMembership) {
      throw { message: "User already registered in this tenant", status: 409 };
    }

    const user = new User({
      id: email,
      secret: undefined,
      firstName: owner.firstName,
      lastName: owner.lastName,
      company: companyData.name,
    });
    user.setPassword(owner.password);
    await UserService.singUpUser(user, payload.nextUrl);

    await MembershipManager.addMembership(tenantId, {
      userId: email,
      source: "public",
      status: "pending",
      owner: false,
    });

    const company = await CompanyManager.storeCompany({
      id: uuidv4(),
      tenantId,
      name: companyData.name,
      slug: companyData.slug,
      status: "unverified",
      mail: companyData.mail,
      phone: companyData.phone,
      website: companyData.website,
      street: companyData.street,
      postalCode: companyData.postalCode,
      city: companyData.city,
      districtId: companyData.districtId,
      industryId: companyData.industryId,
      sizeId: companyData.sizeId,
      logoUrl: companyData.logoUrl,
      description: companyData.description,
    });

    await CompanyMemberManager.storeMember({
      id: uuidv4(),
      tenantId,
      companyId: company.id,
      userId: email,
      isOwner: true,
    });

    return company;
  }

  static async resendVerification(tenantId, email, nextUrl) {
    const normalized = String(email || "")
      .trim()
      .toLowerCase();
    if (!normalized) {
      throw { message: "Missing email", status: 400 };
    }

    const member = await CompanyMemberManager.getMemberByUser(
      tenantId,
      normalized,
    );
    if (!member) {
      return;
    }

    const user = await UserManager.getUserBy({ id: normalized }, true);
    if (!user || user.isVerified) {
      return;
    }

    const hook = user.addHook(USER_HOOK_TYPES.VERIFY, { nextUrl });
    await UserManager.updateUser(user);

    const MailController = require("../../mail-service/mail-controller");
    await MailController.sendVerificationRequest(user.id, hook.id);
  }

  static async verifyCompany(tenantId, companyId) {
    const company = await CompanyManager.getCompany(tenantId, companyId);
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }

    const role = await CompanyRoleService.ensureUnternehmenRole(tenantId);
    const members = await CompanyMemberManager.getMembersByCompany(
      tenantId,
      companyId,
    );

    for (const member of members) {
      await MembershipManager.updateMembership(tenantId, member.userId, {
        status: "active",
      });
      await MembershipManager.addRoleToMembership(
        tenantId,
        member.userId,
        role.id,
      );
    }

    await CompanyManager.setStatus(tenantId, companyId, "verified");
    return CompanyManager.getCompany(tenantId, companyId);
  }

  static async blockCompany(tenantId, companyId) {
    const company = await CompanyManager.getCompany(tenantId, companyId);
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }

    const members = await CompanyMemberManager.getMembersByCompany(
      tenantId,
      companyId,
    );
    for (const member of members) {
      await MembershipManager.updateMembership(tenantId, member.userId, {
        status: "suspended",
      });
    }

    await CompanyManager.setStatus(tenantId, companyId, "blocked");
    return CompanyManager.getCompany(tenantId, companyId);
  }

  static async updateCompanyProfile(tenantId, companyId, payload) {
    const company = await CompanyManager.getCompany(tenantId, companyId);
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }

    const name = String(payload.name || "").trim();
    if (!name || name.length > 200) {
      throw { message: "Company name is required (max 200)", status: 400 };
    }
    const website =
      payload.website !== undefined
        ? String(payload.website).trim()
        : undefined;
    if (website && !/^https:\/\/\S+$/.test(website)) {
      throw { message: "Website must be a valid https:// URL", status: 400 };
    }
    if (payload.mail && !isEmail(String(payload.mail))) {
      throw { message: "Invalid contact email", status: 400 };
    }
    await assertTaxonomyRef(tenantId, payload.districtId, "district", "Kreis");
    await assertTaxonomyRef(
      tenantId,
      payload.industryId,
      "industry",
      "Branche",
    );
    await assertTaxonomyRef(
      tenantId,
      payload.sizeId,
      "company_size",
      "Unternehmensgröße",
    );

    const pick = (key) =>
      payload[key] !== undefined ? payload[key] : company[key];

    const updated = {
      ...company,
      name,
      slug: pick("slug"),
      mail: pick("mail"),
      phone: pick("phone"),
      website: website !== undefined ? website : company.website,
      street: pick("street"),
      postalCode: pick("postalCode"),
      city: pick("city"),
      districtId: pick("districtId"),
      industryId: pick("industryId"),
      sizeId: pick("sizeId"),
      description:
        payload.description !== undefined
          ? String(payload.description)
          : company.description,
    };

    await CompanyManager.storeCompany(updated);
    return CompanyManager.getCompany(tenantId, companyId);
  }

  static async setCompanyLogo(tenantId, companyId, logoUrl) {
    const company = await CompanyManager.getCompany(tenantId, companyId);
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }
    await CompanyManager.setLogo(tenantId, companyId, logoUrl);
    return CompanyManager.getCompany(tenantId, companyId);
  }

  static async removeCompanyLogo(tenantId, companyId) {
    return CompanyService.setCompanyLogo(tenantId, companyId, "");
  }

  static async getCompanyMedia(tenantId, companyId) {
    return CompanyMediaManager.getMediaByCompany(tenantId, companyId);
  }

  static async addCompanyMedia(tenantId, companyId, media) {
    const company = await CompanyManager.getCompany(tenantId, companyId);
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }
    return CompanyMediaManager.storeMedia({
      id: uuidv4(),
      tenantId,
      companyId,
      url: media.url,
      fileName: media.fileName,
      type: media.type,
    });
  }

  static async removeCompanyMedia(tenantId, companyId, mediaId) {
    const media = await CompanyMediaManager.getMedia(tenantId, mediaId);
    if (!media || media.companyId !== companyId) {
      throw { message: "Media not found", status: 404 };
    }
    await CompanyMediaManager.removeMedia(tenantId, mediaId);
    return media;
  }
}

module.exports = CompanyService;
