const bunyan = require("bunyan");
const { v4: uuidv4 } = require("uuid");
const ApplicationService = require("../../../commons/services/student/application-service");
const PlatformSettingsService = require("../../../commons/services/platform-settings-service");
const OfferManager = require("../../../commons/data-managers/offer-manager");
const CompanyController = require("./company-controller");
const { sendError } = require("../../../commons/utilities/http-error");
const {
  NextcloudManager,
} = require("../../../commons/data-managers/file-manager");

const logger = bunyan.createLogger({
  name: "application-controller.js",
  level: process.env.LOG_LEVEL,
});

const DOCUMENT_TYPES = ["lebenslauf", "zeugnis", "weiteres", "other"];

function normalizeDocumentType(value) {
  const type = String(value || "")
    .trim()
    .toLowerCase();
  return DOCUMENT_TYPES.includes(type) ? type : "other";
}

function validateApplicationDocumentFile(file, settings) {
  if (
    !file ||
    !file.name ||
    file.name.includes("..") ||
    file.name.includes("/")
  ) {
    throw { status: 400, message: "Invalid or missing file." };
  }
  // The client-supplied mimetype is spoofable, so also require the PDF magic bytes.
  const isPdf =
    file.mimetype === "application/pdf" &&
    file.data &&
    file.data.slice(0, 5).toString("latin1") === "%PDF-";
  if (!isPdf) {
    throw { status: 400, message: "Only PDF documents are allowed." };
  }
  if (file.data.length > settings.maxDocSizeMb * 1024 * 1024) {
    throw {
      status: 413,
      message: `Document is too large (max ${settings.maxDocSizeMb} MB).`,
    };
  }
}

// Stores a (pre-validated) PDF for an application on Nextcloud and records its
// reference. Application documents live under their own root (not public/ or
// protected/) so the ownership-checked download endpoint is the only reader.
async function persistApplicationDocument(tenantId, applicationId, file, type) {
  const documentId = uuidv4();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const bareName = `${documentId}-${safeName}`;
  const subDirectory = `application-documents/${applicationId}`;
  await NextcloudManager.createFile({
    tenantID: tenantId,
    file: { name: bareName, data: file.data },
    subFolder: subDirectory,
  });
  const ref = {
    id: documentId,
    type: normalizeDocumentType(type),
    originalName: file.name,
    fileName: `${subDirectory}/${bareName}`,
    size: file.data.length,
    created: Date.now(),
  };
  await ApplicationService.addDocumentRef(tenantId, applicationId, ref);
  return ref;
}

async function canAccessApplication(request, application) {
  if (application.studentUserId === request.user.id) {
    return true;
  }
  if (
    await CompanyController.isTenantAdmin(
      request.user.id,
      request.params.tenant,
    )
  ) {
    return true;
  }
  const access = await CompanyController.getBranchAccess(
    request.user.id,
    request.params.tenant,
    application.companyId,
  );
  if (!access.isAdmin && access.member === null) {
    return false;
  }
  const branchScope = CompanyController._memberBranchScope(access);
  if (branchScope === null) {
    return true;
  }
  // Scope by the offer's CURRENT branch, not the value snapshotted on the
  // application at submission — otherwise moving an offer to another branch
  // leaves document access diverging from list/status visibility.
  const offer = await OfferManager.getOffer(
    request.params.tenant,
    application.offerId,
  );
  const branchId = (offer ? offer.branchId : application.branchId) || "";
  return branchScope === branchId;
}

class ApplicationController {
  static async submit(request, response) {
    try {
      const tenantId = request.params.tenant;
      const settings = await PlatformSettingsService.getSettings(tenantId);
      // The CV (Lebenslauf) is mandatory and is stored together with the
      // application: validate it up front, then roll the application back if the
      // file write fails, so a submit without its CV never persists.
      const cv = request.files && request.files.file;
      validateApplicationDocumentFile(cv, settings);
      const payload = {
        motivation: request.body && request.body.motivation,
        consent:
          (request.body && request.body.consent) === true ||
          (request.body && request.body.consent) === "true",
      };
      const result = await ApplicationService.submitApplication(
        tenantId,
        request.user.id,
        request.params.offerId,
        payload,
      );
      try {
        await persistApplicationDocument(tenantId, result.id, cv, "lebenslauf");
      } catch (docError) {
        try {
          await ApplicationService.deleteApplication(tenantId, result.id);
        } catch (rollbackError) {
          logger.error("Application rollback failed", rollbackError);
        }
        throw docError;
      }
      return response.status(201).send({ id: result.id });
    } catch (error) {
      logger.error("Could not submit application", error);
      return sendError(response, error, "Could not submit application");
    }
  }

  static async listMine(request, response) {
    try {
      const applications = await ApplicationService.listMyApplications(
        request.params.tenant,
        request.user.id,
      );
      return response.status(200).send(applications);
    } catch (error) {
      logger.error("Could not load applications", error);
      return sendError(response, error, "Could not load applications");
    }
  }

  static async listForCompany(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      const access = await CompanyController.getBranchAccess(
        request.user.id,
        tenantId,
        companyId,
      );
      if (!access.isAdmin && access.member === null) {
        return response.sendStatus(403);
      }
      const branchScope = CompanyController._memberBranchScope(access);
      const applications = await ApplicationService.listCompanyApplications(
        tenantId,
        companyId,
        branchScope,
      );
      return response.status(200).send(applications);
    } catch (error) {
      logger.error("Could not load company applications", error);
      return sendError(response, error, "Could not load company applications");
    }
  }

  static async updateStatus(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      const access = await CompanyController.getBranchAccess(
        request.user.id,
        tenantId,
        companyId,
      );
      if (!access.isAdmin && access.member === null) {
        return response.sendStatus(403);
      }
      const branchScope = CompanyController._memberBranchScope(access);
      const result = await ApplicationService.updateApplicationStatus(
        tenantId,
        companyId,
        request.params.applicationId,
        request.body && request.body.status,
        branchScope,
      );
      return response.status(200).send(result);
    } catch (error) {
      logger.error("Could not update application status", error);
      return sendError(response, error, "Could not update application status");
    }
  }

  static async uploadDocument(request, response) {
    try {
      const tenantId = request.params.tenant;
      const applicationId = request.params.id;
      const application = await ApplicationService.getApplicationById(
        tenantId,
        applicationId,
      );
      if (application.studentUserId !== request.user.id) {
        return response.sendStatus(403);
      }
      const settings = await PlatformSettingsService.getSettings(tenantId);
      // The CV is the mandatory baseline; maxDocsPerInternship caps the
      // additional documents allowed on top of it.
      const maxDocuments = settings.maxDocsPerInternship + 1;
      if ((application.documents || []).length >= maxDocuments) {
        return response
          .status(400)
          .send(`Maximum of ${maxDocuments} documents reached.`);
      }
      validateApplicationDocumentFile(
        request.files && request.files.file,
        settings,
      );
      const ref = await persistApplicationDocument(
        tenantId,
        applicationId,
        request.files.file,
        request.body && request.body.type,
      );
      return response
        .status(201)
        .send(
          ApplicationService.documentDtos(tenantId, applicationId, [ref])[0],
        );
    } catch (error) {
      logger.error("Could not upload application document", error);
      return sendError(
        response,
        error,
        "Could not upload application document",
      );
    }
  }

  static async listDocuments(request, response) {
    try {
      const tenantId = request.params.tenant;
      const applicationId = request.params.id;
      const application = await ApplicationService.getApplicationById(
        tenantId,
        applicationId,
      );
      if (!(await canAccessApplication(request, application))) {
        return response.sendStatus(403);
      }
      return response
        .status(200)
        .send(
          ApplicationService.documentDtos(
            tenantId,
            applicationId,
            application.documents || [],
          ),
        );
    } catch (error) {
      logger.error("Could not list application documents", error);
      return sendError(response, error, "Could not list application documents");
    }
  }

  static async downloadDocument(request, response) {
    try {
      const tenantId = request.params.tenant;
      const applicationId = request.params.id;
      const application = await ApplicationService.getApplicationById(
        tenantId,
        applicationId,
      );
      if (!(await canAccessApplication(request, application))) {
        return response.sendStatus(403);
      }
      const doc = (application.documents || []).find(
        (d) => d.id === request.params.docId,
      );
      if (!doc) {
        return response.sendStatus(404);
      }
      const data = await NextcloudManager.getFile({
        tenant: tenantId,
        filename: doc.fileName,
      });
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(doc.originalName)}"`,
      );
      response.setHeader("Cache-Control", "private, max-age=0, no-cache");
      return response.status(200).send(data);
    } catch (error) {
      logger.error("Could not download application document", error);
      return sendError(
        response,
        error,
        "Could not download application document",
      );
    }
  }

  static async removeDocument(request, response) {
    try {
      const tenantId = request.params.tenant;
      const applicationId = request.params.id;
      const application = await ApplicationService.getApplicationById(
        tenantId,
        applicationId,
      );
      if (application.studentUserId !== request.user.id) {
        return response.sendStatus(403);
      }
      const doc = (application.documents || []).find(
        (d) => d.id === request.params.docId,
      );
      if (!doc) {
        return response.sendStatus(404);
      }
      await NextcloudManager.deleteFile(tenantId, doc.fileName);
      const result = await ApplicationService.removeDocumentRef(
        tenantId,
        applicationId,
        request.params.docId,
      );
      return response.status(200).send(result);
    } catch (error) {
      logger.error("Could not remove application document", error);
      return sendError(
        response,
        error,
        "Could not remove application document",
      );
    }
  }
}

module.exports = ApplicationController;
