const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { User, USER_HOOK_TYPES } = require("../../entities/user/user");
const UserManager = require("../../data-managers/user-manager");
const UserService = require("../user-service");
const MembershipManager = require("../../data-managers/membership-manager");
const TenantManager = require("../../data-managers/tenant-manager");
const CompanyManager = require("../../data-managers/company-manager");
const CompanyMemberManager = require("../../data-managers/company-member-manager");
const CompanyMediaManager = require("../../data-managers/company-media-manager");
const CompanyBranchManager = require("../../data-managers/company-branch-manager");
const MemberInvitationManager = require("../../data-managers/member-invitation-manager");
const TaxonomyTermManager = require("../../data-managers/taxonomy-term-manager");
const { CompanyRoleService } = require("./company-role-service");
const MailController = require("../../mail-service/mail-controller");
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

async function setUserSuspended(userId, suspended) {
  const user = await UserManager.getUserBy({ id: userId }, true);
  if (!user) {
    return;
  }
  user.isSuspended = suspended;
  await UserManager.updateUser(user);
}

async function findBranchOrThrow(tenantId, companyId, branchId) {
  const branch = await CompanyBranchManager.getBranch(tenantId, branchId);
  if (!branch || branch.companyId !== companyId) {
    throw { message: "Branch not found", status: 404 };
  }
  return branch;
}

function buildLocation(lat, lng) {
  const toCoord = (value) => {
    if (typeof value !== "number" && typeof value !== "string") {
      return NaN;
    }
    if (typeof value === "string" && value.trim() === "") {
      return NaN;
    }
    return Number(value);
  };
  const latNum = toCoord(lat);
  const lngNum = toCoord(lng);
  if (
    !Number.isFinite(latNum) ||
    !Number.isFinite(lngNum) ||
    latNum < -90 ||
    latNum > 90 ||
    lngNum < -180 ||
    lngNum > 180
  ) {
    throw { message: "Invalid coordinates", status: 400 };
  }
  return { type: "Point", coordinates: [lngNum, latNum] };
}

function normalizeBranch(payload, existing) {
  const base = existing || {};

  const name = String(
    payload.name !== undefined ? payload.name : base.name || "",
  ).trim();
  if (!name || name.length > 200) {
    throw { message: "Branch name is required (max 200)", status: 400 };
  }

  const city = String(
    payload.city !== undefined ? payload.city : base.city || "",
  ).trim();
  if (!city) {
    throw { message: "City is required", status: 400 };
  }

  const postalCode = String(
    payload.postalCode !== undefined
      ? payload.postalCode
      : base.postalCode || "",
  ).trim();
  if (postalCode && !/^\d{5}$/.test(postalCode)) {
    throw { message: "Postal code must be 5 digits", status: 400 };
  }

  const hasLat =
    payload.lat !== undefined && payload.lat !== null && payload.lat !== "";
  const hasLng =
    payload.lng !== undefined && payload.lng !== null && payload.lng !== "";
  let location;
  if (hasLat || hasLng) {
    if (!(hasLat && hasLng)) {
      throw { message: "Both lat and lng are required", status: 400 };
    }
    location = buildLocation(payload.lat, payload.lng);
  } else {
    location = base.location !== undefined ? base.location : null;
  }

  return {
    name,
    street: String(
      payload.street !== undefined ? payload.street : base.street || "",
    ).trim(),
    postalCode,
    city,
    districtId:
      payload.districtId !== undefined
        ? payload.districtId
        : base.districtId || "",
    location,
  };
}

function toBranchDto(branch) {
  const coords =
    branch.location && Array.isArray(branch.location.coordinates)
      ? branch.location.coordinates
      : null;
  return {
    id: branch.id,
    companyId: branch.companyId,
    name: branch.name,
    street: branch.street,
    postalCode: branch.postalCode,
    city: branch.city,
    districtId: branch.districtId,
    lat: coords ? coords[1] : null,
    lng: coords ? coords[0] : null,
    logoUrl: branch.logoUrl,
    created: branch.created,
  };
}

function toMemberInvitationDto(invitation) {
  return {
    userId: invitation.email,
    email: invitation.email,
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    phone: invitation.phone,
    branchId: invitation.branchId || "",
    isOwner: false,
    status: "pending",
  };
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
      await setUserSuspended(member.userId, false);
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
      await setUserSuspended(member.userId, true);
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

  static async getCompanyBranches(tenantId, companyId) {
    const branches = await CompanyBranchManager.getBranchesByCompany(
      tenantId,
      companyId,
    );
    return branches.map(toBranchDto);
  }

  static async getCompanyBranch(tenantId, companyId, branchId) {
    return toBranchDto(await findBranchOrThrow(tenantId, companyId, branchId));
  }

  static async createCompanyBranch(tenantId, companyId, payload) {
    const company = await CompanyManager.getCompany(tenantId, companyId);
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }
    const fields = normalizeBranch(payload);
    await assertTaxonomyRef(tenantId, fields.districtId, "district", "Kreis");
    const branch = await CompanyBranchManager.storeBranch({
      id: uuidv4(),
      tenantId,
      companyId,
      ...fields,
    });
    return toBranchDto(branch);
  }

  static async updateCompanyBranch(tenantId, companyId, branchId, payload) {
    const branch = await findBranchOrThrow(tenantId, companyId, branchId);
    const fields = normalizeBranch(payload, branch);
    await assertTaxonomyRef(tenantId, payload.districtId, "district", "Kreis");
    const updated = await CompanyBranchManager.storeBranch({
      ...branch,
      ...fields,
      id: branch.id,
      tenantId: branch.tenantId,
      companyId: branch.companyId,
      logoUrl: branch.logoUrl,
      created: branch.created,
    });
    return toBranchDto(updated);
  }

  static async removeCompanyBranch(tenantId, companyId, branchId) {
    const branch = await findBranchOrThrow(tenantId, companyId, branchId);
    const members = await CompanyMemberManager.getMembersByCompany(
      tenantId,
      companyId,
    );
    if (members.some((member) => member.branchId === branchId)) {
      throw {
        message:
          "Branch still has members assigned; reassign or remove them first",
        status: 409,
      };
    }
    const pendingInvitations =
      await MemberInvitationManager.getPendingByCompany(tenantId, companyId);
    if (
      pendingInvitations.some((invitation) => invitation.branchId === branchId)
    ) {
      throw {
        message:
          "Branch still has a pending invitation assigned; cancel it before deleting the branch",
        status: 409,
      };
    }
    const count = await CompanyBranchManager.countByCompany(
      tenantId,
      companyId,
    );
    if (count <= 1) {
      throw { message: "A company must keep at least one branch", status: 409 };
    }
    await CompanyBranchManager.removeBranch(tenantId, branchId);
    return branch;
  }

  static async setBranchLogo(tenantId, companyId, branchId, logoUrl) {
    const branch = await findBranchOrThrow(tenantId, companyId, branchId);
    await CompanyBranchManager.storeBranch({ ...branch, logoUrl });
    return toBranchDto({ ...branch, logoUrl });
  }

  static async removeBranchLogo(tenantId, companyId, branchId) {
    return CompanyService.setBranchLogo(tenantId, companyId, branchId, "");
  }

  static async inviteMember(tenantId, companyId, invitedBy, payload) {
    const company = await CompanyManager.getCompany(tenantId, companyId);
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }
    const email = String(payload.email || "")
      .trim()
      .toLowerCase();
    const firstName = String(payload.firstName || "").trim();
    const lastName = String(payload.lastName || "").trim();
    if (!email || !firstName || !lastName) {
      throw {
        message: "First name, last name and email are required",
        status: 400,
      };
    }
    if (!isEmail(email)) {
      throw { message: "Invalid email", status: 400 };
    }
    const branchId = payload.branchId || "";
    if (branchId) {
      const branch = await CompanyBranchManager.getBranch(tenantId, branchId);
      if (!branch || branch.companyId !== companyId) {
        throw { message: "Invalid branch", status: 400 };
      }
    }
    const existingMember = await CompanyMemberManager.getMemberByUser(
      tenantId,
      email,
    );
    if (existingMember) {
      throw { message: "This user already belongs to a company", status: 409 };
    }
    const pending = await MemberInvitationManager.getPendingByEmailInTenant(
      tenantId,
      email,
    );
    if (pending) {
      throw {
        message: "An invitation for this email is already pending",
        status: 409,
      };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const invitation = await MemberInvitationManager.store({
      id: uuidv4(),
      tenantId,
      companyId,
      token,
      email,
      firstName,
      lastName,
      phone: String(payload.phone || "").trim(),
      branchId,
      status: "pending",
      invitedBy,
    });

    try {
      await MailController.sendMemberInvitation({
        sendTo: email,
        companyName: company.name,
        token,
      });
    } catch {
      // mail is best-effort; the pending invitation can be re-sent or accepted via its link
    }

    return toMemberInvitationDto(invitation);
  }

  static async listCompanyMembers(tenantId, companyId) {
    const members = await CompanyMemberManager.getMembersByCompany(
      tenantId,
      companyId,
    );
    const active = [];
    for (const member of members) {
      const user = await UserManager.getUserBy({ id: member.userId });
      active.push({
        userId: member.userId,
        email: member.userId,
        firstName: user ? user.firstName : "",
        lastName: user ? user.lastName : "",
        phone: user ? user.phone : "",
        branchId: member.branchId || "",
        isOwner: member.isOwner === true,
        status: "active",
      });
    }
    const invitations = await MemberInvitationManager.getPendingByCompany(
      tenantId,
      companyId,
    );
    return [...active, ...invitations.map(toMemberInvitationDto)];
  }

  static async removeCompanyMember(tenantId, companyId, targetUserId) {
    const userId = String(targetUserId || "")
      .trim()
      .toLowerCase();
    const member = await CompanyMemberManager.getMemberByUser(tenantId, userId);
    if (member && member.companyId === companyId) {
      if (member.isOwner === true) {
        throw { message: "The company owner cannot be removed", status: 403 };
      }
      await CompanyMemberManager.removeMember(tenantId, companyId, userId);
      await MembershipManager.removeMembership(tenantId, userId);
      await UserManager.deleteUser(userId);
      return { removed: userId };
    }
    const pending = await MemberInvitationManager.getPendingByEmail(
      tenantId,
      companyId,
      userId,
    );
    if (pending) {
      await MemberInvitationManager.remove(tenantId, pending.id);
      return { removed: userId };
    }
    throw { message: "Member not found", status: 404 };
  }

  static async acceptMemberInvitation(tenantId, token, password) {
    const invitation = await MemberInvitationManager.getByToken(token);
    if (
      !invitation ||
      invitation.tenantId !== tenantId ||
      invitation.status !== "pending"
    ) {
      throw { message: "Invalid or expired invitation", status: 404 };
    }
    if (!password || String(password).length < 8) {
      throw { message: "Password must be at least 8 characters", status: 400 };
    }
    const email = invitation.email;
    const company = await CompanyManager.getCompany(
      tenantId,
      invitation.companyId,
    );
    if (!company) {
      throw { message: "Company not found", status: 404 };
    }

    const alreadyMember = await CompanyMemberManager.getMemberByUser(
      tenantId,
      email,
    );
    if (alreadyMember) {
      throw { message: "This user already belongs to a company", status: 409 };
    }

    const existingUser = await UserManager.getUserBy({ id: email }, true);
    if (!existingUser) {
      const user = new User({
        id: email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        phone: invitation.phone,
        company: company.name,
      });
      user.setPassword(password);
      user.isVerified = true;
      await UserManager.createUser(user);
    }

    const role = await CompanyRoleService.ensureUnternehmenRole(tenantId);
    const membership = await MembershipManager.getMembershipByTenantAndUserID(
      tenantId,
      email,
    );
    if (!membership) {
      await MembershipManager.addMembership(tenantId, {
        userId: email,
        source: "invite",
        status: "active",
        owner: false,
      });
    } else {
      await MembershipManager.updateMembership(tenantId, email, {
        status: "active",
      });
    }
    await MembershipManager.addRoleToMembership(tenantId, email, role.id);

    let branchId = invitation.branchId || "";
    if (branchId) {
      const branch = await CompanyBranchManager.getBranch(tenantId, branchId);
      if (!branch || branch.companyId !== invitation.companyId) {
        branchId = "";
      }
    }

    await CompanyMemberManager.storeMember({
      id: uuidv4(),
      tenantId,
      companyId: invitation.companyId,
      userId: email,
      isOwner: false,
      branchId,
    });

    await MemberInvitationManager.remove(tenantId, invitation.id);
    return { companyId: invitation.companyId, userId: email };
  }
}

module.exports = CompanyService;
