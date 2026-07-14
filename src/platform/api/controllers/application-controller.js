const bunyan = require("bunyan");
const { v4: uuidv4 } = require("uuid");
const ApplicationService = require("../../../commons/services/student/application-service");
const PlatformSettingsService = require("../../../commons/services/platform-settings-service");
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

async function canAccessApplication(request, application) {
  if (application.studentUserId === request.user.id) {
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
  return branchScope === null || branchScope === application.branchId;
}

class ApplicationController {
  static async submit(request, response) {
    try {
      const result = await ApplicationService.submitApplication(
        request.params.tenant,
        request.user.id,
        request.params.offerId,
        request.body,
      );
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
      if (
        (application.documents || []).length >= settings.maxDocsPerInternship
      ) {
        return response
          .status(400)
          .send(
            `Maximum of ${settings.maxDocsPerInternship} documents reached.`,
          );
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
      // The client-supplied mimetype is spoofable, so also require the PDF magic bytes.
      const isPdf =
        file.mimetype === "application/pdf" &&
        file.data &&
        file.data.slice(0, 5).toString("latin1") === "%PDF-";
      if (!isPdf) {
        return response.status(400).send("Only PDF documents are allowed.");
      }
      if (file.data.length > settings.maxDocSizeMb * 1024 * 1024) {
        return response
          .status(413)
          .send(`Document is too large (max ${settings.maxDocSizeMb} MB).`);
      }
      const documentId = uuidv4();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const bareName = `${documentId}-${safeName}`;
      // Application documents must not live under public/ or protected/: the
      // generic /files/list and /files/get routes enumerate and serve those
      // trees to any authenticated caller. A dedicated root keeps the
      // ownership-checked downloadDocument endpoint as the only reader.
      const subDirectory = `application-documents/${applicationId}`;
      await NextcloudManager.createFile({
        tenantID: tenantId,
        file: { name: bareName, data: file.data },
        subFolder: subDirectory,
      });
      const ref = {
        id: documentId,
        type: normalizeDocumentType(request.body && request.body.type),
        originalName: file.name,
        fileName: `${subDirectory}/${bareName}`,
        size: file.data.length,
        created: Date.now(),
      };
      await ApplicationService.addDocumentRef(tenantId, applicationId, ref);
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
      const data = await NextcloudManager.getFile(tenantId, doc.fileName);
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
