const bunyan = require("bunyan");
const CompanyController = require("./company-controller");
const OfferService = require("../../../commons/services/company/offer-service");
const OfferManager = require("../../../commons/data-managers/offer-manager");
const {
  NextcloudManager,
} = require("../../../commons/data-managers/file-manager");
const { v4: uuidv4 } = require("uuid");

const logger = bunyan.createLogger({
  name: "offer-controller.js",
  level: process.env.LOG_LEVEL,
});

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

class OfferController {
  static _fail(response, error, fallback) {
    logger.error(fallback, error);
    return response
      .status(error.status || error.statusCode || 500)
      .send(error.message || fallback);
  }

  static async listOffers(request, response) {
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
      const offers = await OfferService.getCompanyOffers(tenantId, companyId);
      return response.status(200).send(offers);
    } catch (error) {
      return OfferController._fail(response, error, "Could not list offers");
    }
  }

  static async getStats(request, response) {
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
      const str = (v) =>
        v === undefined || v === null ? undefined : String(v);
      const stats = await OfferService.getCompanyStats(tenantId, companyId, {
        branchId: str(request.query.branchId),
        industryId: str(request.query.industryId),
      });
      return response.status(200).send(stats);
    } catch (error) {
      return OfferController._fail(response, error, "Could not load stats");
    }
  }

  static async getOffer(request, response) {
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
      const offer = await OfferService.getCompanyOffer(
        tenantId,
        companyId,
        request.params.offerId,
      );
      return response.status(200).send(offer);
    } catch (error) {
      return OfferController._fail(response, error, "Could not load offer");
    }
  }

  static async createOffer(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      if (
        !(await CompanyController.canEditBranch(
          request.user.id,
          tenantId,
          companyId,
          request.body.branchId || "",
        ))
      ) {
        return response.sendStatus(403);
      }
      const offer = await OfferService.createOffer(
        tenantId,
        companyId,
        request.body,
      );
      return response.status(201).send(offer);
    } catch (error) {
      return OfferController._fail(response, error, "Could not create offer");
    }
  }

  static async updateOffer(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      const offerId = request.params.offerId;
      const existing = await OfferManager.getOffer(tenantId, offerId);
      if (!existing || existing.companyId !== companyId) {
        return response.sendStatus(404);
      }
      if (
        !(await CompanyController.canEditBranch(
          request.user.id,
          tenantId,
          companyId,
          existing.branchId,
        ))
      ) {
        return response.sendStatus(403);
      }
      // Normalize the target scope: an absent/empty branchId means company-level ("")
      // in the service, so any change of scope — including a move to "" — must be authorized.
      const targetBranchId = String(request.body.branchId || "").trim();
      if (
        targetBranchId !== existing.branchId &&
        !(await CompanyController.canEditBranch(
          request.user.id,
          tenantId,
          companyId,
          targetBranchId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const offer = await OfferService.updateOffer(
        tenantId,
        companyId,
        offerId,
        request.body,
      );
      return response.status(200).send(offer);
    } catch (error) {
      return OfferController._fail(response, error, "Could not update offer");
    }
  }

  static async deleteOffer(request, response) {
    try {
      const tenantId = request.params.tenant;
      const companyId = request.params.id;
      const offerId = request.params.offerId;
      const existing = await OfferManager.getOffer(tenantId, offerId);
      if (!existing || existing.companyId !== companyId) {
        return response.sendStatus(404);
      }
      if (
        !(await CompanyController.canEditBranch(
          request.user.id,
          tenantId,
          companyId,
          existing.branchId,
        ))
      ) {
        return response.sendStatus(403);
      }
      const media = await OfferService.listOfferMedia(tenantId, offerId);
      const result = await OfferService.deleteOffer(
        tenantId,
        companyId,
        offerId,
      );
      for (const m of media) {
        await OfferController._deleteMediaFile(tenantId, m);
      }
      return response.status(200).send(result);
    } catch (error) {
      return OfferController._fail(response, error, "Could not delete offer");
    }
  }

  static async searchOffers(request, response) {
    try {
      const tenantId = request.params.tenant;
      const q = request.query;
      // coerce to strings — query params can arrive as arrays/objects (?x[]= / ?x[$ne]=)
      const str = (v) =>
        v === undefined || v === null || v === "" ? undefined : String(v);
      const filters = {
        industryId: str(q.industryId),
        internshipTypeId: str(q.internshipTypeId),
        companyId: str(q.companyId),
        company: str(q.company),
        districtId: str(q.districtId),
        city: str(q.city),
        q: str(q.q),
      };
      if (q.age !== undefined && q.age !== "") {
        const age = Number(q.age);
        if (Number.isFinite(age)) {
          filters.minAge = age;
        }
      }
      const lat = parseFloat(q.lat);
      const lng = parseFloat(q.lng);
      const radiusKm = parseFloat(q.radius);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Number.isFinite(radiusKm) &&
        radiusKm > 0
      ) {
        filters.lat = lat;
        filters.lng = lng;
        filters.radiusMeters = radiusKm * 1000;
      }
      const offers = await OfferService.searchPublicOffers(tenantId, filters);
      return response.status(200).send(offers);
    } catch (error) {
      return OfferController._fail(response, error, "Could not search offers");
    }
  }

  static async getPublicOffer(request, response) {
    try {
      const tenantId = request.params.tenant;
      const offer = await OfferService.getPublicOffer(
        tenantId,
        request.params.offerId,
      );
      return response.status(200).send(offer);
    } catch (error) {
      return OfferController._fail(response, error, "Could not load offer");
    }
  }

  static async listModeration(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const str = (v) =>
        v === undefined || v === null || v === "" ? undefined : String(v);
      const offers = await OfferService.listForModeration(tenantId, {
        status: str(request.query.status),
        industryId: str(request.query.industryId),
        q: str(request.query.q),
      });
      return response.status(200).send(offers);
    } catch (error) {
      return OfferController._fail(response, error, "Could not list offers");
    }
  }

  static async approveOffer(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const offer = await OfferService.approveOffer(
        tenantId,
        request.params.offerId,
      );
      return response.status(200).send(offer);
    } catch (error) {
      return OfferController._fail(response, error, "Could not approve offer");
    }
  }

  static async rejectOffer(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const offer = await OfferService.rejectOffer(
        tenantId,
        request.params.offerId,
        request.body.note,
      );
      return response.status(200).send(offer);
    } catch (error) {
      return OfferController._fail(response, error, "Could not reject offer");
    }
  }

  static async deactivateOffer(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const offer = await OfferService.deactivateOffer(
        tenantId,
        request.params.offerId,
      );
      return response.status(200).send(offer);
    } catch (error) {
      return OfferController._fail(
        response,
        error,
        "Could not deactivate offer",
      );
    }
  }

  static async _deleteMediaFile(tenantId, media) {
    if (!media || !media.url) {
      return;
    }
    let path = null;
    try {
      path = new URL(media.url).searchParams.get("name");
    } catch {
      return;
    }
    if (!path) {
      return;
    }
    try {
      await NextcloudManager.deleteFile(tenantId, path);
    } catch (e) {
      logger.warn(`Could not delete offer media file: ${e.message}`);
    }
  }

  static async _loadEditableOffer(request) {
    const tenantId = request.params.tenant;
    const companyId = request.params.id;
    const offer = await OfferManager.getOffer(tenantId, request.params.offerId);
    if (!offer || offer.companyId !== companyId) {
      return { error: 404 };
    }
    const allowed = await CompanyController.canEditBranch(
      request.user.id,
      tenantId,
      companyId,
      offer.branchId,
    );
    if (!allowed) {
      return { error: 403 };
    }
    return { offer };
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
      const offer = await OfferManager.getOffer(
        tenantId,
        request.params.offerId,
      );
      if (!offer || offer.companyId !== companyId) {
        return response.sendStatus(404);
      }
      const media = await OfferService.listOfferMedia(
        tenantId,
        request.params.offerId,
      );
      return response.status(200).send(media);
    } catch (error) {
      return OfferController._fail(response, error, "Could not list media");
    }
  }

  static async uploadMedia(request, response) {
    try {
      const tenantId = request.params.tenant;
      const offerId = request.params.offerId;
      const access = await OfferController._loadEditableOffer(request);
      if (access.error) {
        return response.sendStatus(access.error);
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
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const bareName = `${offerId}-${uuidv4()}-${safeName}`;
      await NextcloudManager.createFile(
        tenantId,
        file.data,
        bareName,
        "public",
        "public/offer-media",
      );
      const fileName = `public/offer-media/${bareName}`;
      const url = `${process.env.BACKEND_URL}/api/${tenantId}/files/get?name=/${fileName}`;
      const media = await OfferService.addOfferMedia(tenantId, offerId, {
        url,
        fileName,
        type: isVideo ? "video" : "image",
      });
      return response.status(201).send(media);
    } catch (error) {
      return OfferController._fail(response, error, "Could not upload media");
    }
  }

  static async removeMedia(request, response) {
    try {
      const access = await OfferController._loadEditableOffer(request);
      if (access.error) {
        return response.sendStatus(access.error);
      }
      const media = await OfferService.removeOfferMedia(
        request.params.tenant,
        request.params.offerId,
        request.params.mediaId,
      );
      await OfferController._deleteMediaFile(request.params.tenant, media);
      return response.status(200).send({ removed: request.params.mediaId });
    } catch (error) {
      return OfferController._fail(response, error, "Could not remove media");
    }
  }
}

module.exports = OfferController;
