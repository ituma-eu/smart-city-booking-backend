const { v4: uuidv4 } = require("uuid");
const ApplicationManager = require("../../data-managers/application-manager");
const OfferManager = require("../../data-managers/offer-manager");
const StudentManager = require("../../data-managers/student-manager");
const UserManager = require("../../data-managers/user-manager");
const CompanyBranchManager = require("../../data-managers/company-branch-manager");
const CompanyManager = require("../../data-managers/company-manager");
const TaxonomyTermManager = require("../../data-managers/taxonomy-term-manager");
const PlatformSettingsService = require("../platform-settings-service");
const { NextcloudManager } = require("../../data-managers/file-manager");

const MOTIVATION_MAX = 5000;

function deriveAge(birthDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || "")) {
    return null;
  }
  const born = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) {
    return null;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - born.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function toDocDto(tenantId, applicationId, doc) {
  return {
    id: doc.id,
    type: doc.type,
    name: doc.originalName,
    size: doc.size,
    created: doc.created,
    downloadUrl: `${process.env.BACKEND_URL}/api/${tenantId}/applications/${applicationId}/documents/${doc.id}/download`,
  };
}

function toListDto(tenantId, application, offer) {
  return {
    id: application.id,
    offerId: application.offerId,
    status: application.status,
    createdAt: application.created,
    offer: offer
      ? {
          id: offer.id,
          title: offer.title,
          city: offer.city,
          companyId: offer.companyId,
        }
      : null,
    documents: (application.documents || []).map((doc) =>
      toDocDto(tenantId, application.id, doc),
    ),
  };
}

function toCompanyDto(tenantId, application, offer, branchName) {
  return {
    id: application.id,
    offerId: application.offerId,
    offerTitle: offer ? offer.title : null,
    branchId: application.branchId,
    branchName: branchName || null,
    applicant: {
      firstName: application.firstName,
      lastName: application.lastName,
      email: application.email,
      phone: application.phone,
      birthDate: application.birthDate,
      age: deriveAge(application.birthDate),
    },
    motivation: application.motivation,
    status: application.status,
    createdAt: application.created,
    documents: (application.documents || []).map((doc) =>
      toDocDto(tenantId, application.id, doc),
    ),
  };
}

function isDeadlinePassed(deadline) {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return false;
  }
  return deadline < new Date().toISOString().slice(0, 10);
}

class ApplicationService {
  static async submitApplication(tenantId, userId, offerId, payload) {
    const data = payload || {};

    const student = await StudentManager.getStudentByUser(userId);
    if (!student) {
      throw { message: "Only students can apply", status: 403 };
    }

    if (data.consent !== true) {
      throw { message: "Consent is required", status: 400 };
    }

    const motivation = String(data.motivation || "").trim();
    if (motivation.length > MOTIVATION_MAX) {
      throw {
        message: `Motivation must be at most ${MOTIVATION_MAX} characters`,
        status: 400,
      };
    }

    const offer = await OfferManager.getOffer(tenantId, offerId);
    if (!offer || offer.status !== "Online") {
      throw { message: "Offer not found", status: 404 };
    }
    const company = await CompanyManager.getCompany(tenantId, offer.companyId);
    if (!company || company.status === "blocked") {
      throw { message: "Offer not found", status: 404 };
    }
    if (isDeadlinePassed(offer.applicationDeadline)) {
      throw {
        message: "The application deadline for this offer has passed",
        status: 409,
      };
    }

    const existing = await ApplicationManager.getByOfferAndUser(
      tenantId,
      offerId,
      userId,
    );
    if (existing) {
      throw {
        message: "You have already applied to this offer",
        status: 409,
      };
    }

    const user = await UserManager.getUserBy({ id: userId }, false);
    if (!user) {
      throw { message: "User not found", status: 404 };
    }

    const settings = await PlatformSettingsService.getSettings(tenantId);
    const initialStatus = settings.defaultApplicationStatus || "Neu";

    const now = Date.now();
    let application;
    try {
      application = await ApplicationManager.storeApplication({
        id: uuidv4(),
        tenantId,
        offerId,
        companyId: offer.companyId,
        branchId: offer.branchId || "",
        studentUserId: userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.id,
        phone: user.phone,
        birthDate: student.birthDate,
        motivation,
        consent: true,
        consentAt: now,
        status: initialStatus,
        documents: [],
        created: now,
      });
    } catch (err) {
      // Concurrent submits can both pass the read above and collide on the
      // unique {tenantId, offerId, studentUserId} index; surface the same 409
      // as the pre-check rather than leaking the raw driver error.
      if (err && err.code === 11000) {
        throw {
          message: "You have already applied to this offer",
          status: 409,
        };
      }
      throw err;
    }

    return { id: application.id };
  }

  static async listMyApplications(tenantId, userId) {
    const all = await ApplicationManager.listByUser(tenantId, userId);
    const blocked = new Set(
      await CompanyManager.getBlockedCompanyIds(tenantId),
    );
    const applications = all.filter((a) => !blocked.has(a.companyId));
    if (applications.length === 0) {
      return [];
    }
    const offers = await OfferManager.getOffersByIds(
      tenantId,
      applications.map((application) => application.offerId),
    );
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    return applications.map((application) =>
      toListDto(tenantId, application, byId.get(application.offerId) || null),
    );
  }

  static async listCompanyApplications(tenantId, companyId, branchScope) {
    let applications = await ApplicationManager.getByCompany(
      tenantId,
      companyId,
    );
    if (branchScope !== null && branchScope !== undefined) {
      applications = applications.filter((a) => a.branchId === branchScope);
    }
    if (applications.length === 0) {
      return [];
    }
    const offers = await OfferManager.getOffersByIds(
      tenantId,
      applications.map((a) => a.offerId),
    );
    const offerById = new Map(offers.map((offer) => [offer.id, offer]));
    const branches = await CompanyBranchManager.getBranchesByCompany(
      tenantId,
      companyId,
    );
    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
    return applications.map((application) =>
      toCompanyDto(
        tenantId,
        application,
        offerById.get(application.offerId) || null,
        application.branchId
          ? branchNameById.get(application.branchId) || null
          : null,
      ),
    );
  }

  static async updateApplicationStatus(
    tenantId,
    companyId,
    applicationId,
    status,
    branchScope,
  ) {
    const statusTerms = await TaxonomyTermManager.getTerms(tenantId, {
      type: "application_status",
    });
    if (!statusTerms.some((term) => term.name === status)) {
      throw { message: "Invalid status", status: 400 };
    }
    const application = await ApplicationManager.getById(
      tenantId,
      applicationId,
    );
    if (!application || application.companyId !== companyId) {
      throw { message: "Application not found", status: 404 };
    }
    if (
      branchScope !== null &&
      branchScope !== undefined &&
      application.branchId !== branchScope
    ) {
      throw { message: "Out of branch scope", status: 403 };
    }
    await ApplicationManager.updateStatus(tenantId, applicationId, status);
    return { id: applicationId, status };
  }

  static async getApplicationById(tenantId, id) {
    const application = await ApplicationManager.getById(tenantId, id);
    if (!application) {
      throw { message: "Application not found", status: 404 };
    }
    return application;
  }

  static async addDocumentRef(tenantId, applicationId, ref) {
    await ApplicationManager.addDocument(tenantId, applicationId, ref);
    return ref;
  }

  static async removeDocumentRef(tenantId, applicationId, documentId) {
    await ApplicationManager.removeDocument(
      tenantId,
      applicationId,
      documentId,
    );
    return { removed: documentId };
  }

  // Completely removes every application for an offer, including the uploaded
  // document files on Nextcloud. Used when a company deletes a praktikum.
  static async deleteByOffer(tenantId, offerId) {
    const applications = await ApplicationManager.getByOffer(tenantId, offerId);
    await ApplicationService._deleteDocumentFiles(tenantId, applications);
    await ApplicationManager.removeByOffer(tenantId, offerId);
    return { removed: applications.length };
  }

  // Same, for every application belonging to a company (owner account deletion).
  static async deleteByCompany(tenantId, companyId) {
    const applications = await ApplicationManager.getByCompany(
      tenantId,
      companyId,
    );
    await ApplicationService._deleteDocumentFiles(tenantId, applications);
    await ApplicationManager.removeByCompany(tenantId, companyId);
    return { removed: applications.length };
  }

  // Every application a student submitted, across ALL tenants: deleting the
  // global user account must not leave PII (documents included) in any tenant.
  static async deleteByStudent(studentUserId) {
    const applications =
      await ApplicationManager.getAllByStudent(studentUserId);
    for (const application of applications) {
      await ApplicationService._deleteDocumentFiles(application.tenantId, [
        application,
      ]);
    }
    await ApplicationManager.removeByStudentAllTenants(studentUserId);
    return { removed: applications.length };
  }

  static async _deleteDocumentFiles(tenantId, applications) {
    for (const application of applications) {
      for (const doc of application.documents || []) {
        try {
          await NextcloudManager.deleteFile(tenantId, doc.fileName);
        } catch {
          // Best effort: a missing or unreachable file must not abort the
          // deletion cascade; the database records are the source of truth.
        }
      }
    }
  }

  static documentDtos(tenantId, applicationId, documents) {
    return (documents || []).map((doc) =>
      toDocDto(tenantId, applicationId, doc),
    );
  }
}

module.exports = ApplicationService;
