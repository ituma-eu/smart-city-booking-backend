const Offer = require("../entities/company/offer");
const OfferModel = require("./models/offerModel");
const { escapeRegex } = require("../utilities/regexUtils");

class OfferManager {
  static async getOffersByCompany(tenantId, companyId) {
    const raw = await OfferModel.find({ tenantId, companyId }).sort({
      created: -1,
    });
    return raw.map((doc) => doc.toEntity());
  }

  static async getOffer(tenantId, id) {
    const raw = await OfferModel.findOne({ tenantId, id });
    if (!raw) {
      return null;
    }
    return raw.toEntity();
  }

  static async storeOffer(offer, upsert = true) {
    const entity = offer instanceof Offer ? offer : new Offer(offer);
    entity.validate();
    // pass a copy: Mongoose mutates the update object with $setOnInsert on upsert
    await OfferModel.updateOne({ id: entity.id }, { ...entity }, { upsert });
    return entity;
  }

  static async removeOffer(tenantId, id) {
    await OfferModel.deleteOne({ tenantId, id });
  }

  static async incrementViews(tenantId, id) {
    await OfferModel.updateOne({ tenantId, id }, { $inc: { views: 1 } });
  }

  static async countByBranch(tenantId, companyId, branchId) {
    return OfferModel.countDocuments({ tenantId, companyId, branchId });
  }

  static async listForModeration(tenantId, filters = {}) {
    const query = { tenantId, status: { $in: ["In Prüfung", "Online"] } };
    if (filters.status && ["In Prüfung", "Online"].includes(filters.status)) {
      query.status = filters.status;
    }
    if (filters.industryId) {
      query.industryId = filters.industryId;
    }
    if (filters.q) {
      query.title = { $regex: escapeRegex(filters.q), $options: "i" };
    }
    const raw = await OfferModel.find(query).sort({ created: -1 });
    return raw.map((doc) => doc.toEntity());
  }

  static async searchOnline(tenantId, filters = {}) {
    const query = { tenantId, status: "Online" };

    if (filters.industryId) {
      query.industryId = filters.industryId;
    }
    if (filters.internshipTypeId) {
      query.internshipTypeId = filters.internshipTypeId;
    }
    if (filters.companyId) {
      query.companyId = filters.companyId;
    }
    if (filters.districtId) {
      query.districtId = filters.districtId;
    }
    if (filters.city) {
      query.city = filters.city;
    }
    if (filters.q) {
      query.title = { $regex: escapeRegex(filters.q), $options: "i" };
    }
    if (filters.minAge !== undefined && filters.minAge !== null) {
      query.$or = [{ minAge: null }, { minAge: { $lte: filters.minAge } }];
    }

    const hasGeo =
      filters.lat !== undefined &&
      filters.lat !== null &&
      filters.lng !== undefined &&
      filters.lng !== null &&
      filters.radiusMeters;

    if (hasGeo) {
      query.location = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [filters.lng, filters.lat],
          },
          $maxDistance: filters.radiusMeters,
        },
      };
      // $near already returns nearest-first; no explicit sort
      const raw = await OfferModel.find(query);
      return raw.map((doc) => doc.toEntity());
    }

    const raw = await OfferModel.find(query).sort({
      publishedAt: -1,
      created: -1,
    });
    return raw.map((doc) => doc.toEntity());
  }
}

module.exports = OfferManager;
