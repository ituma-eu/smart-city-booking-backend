const TaxonomyTermModel = require("./models/taxonomyTermModel");

class TaxonomyTermManager {
  static async getTerm(tenantId, id) {
    const raw = await TaxonomyTermModel.findOne({ tenantId, id });
    if (!raw) {
      return null;
    }
    return raw.toEntity();
  }

  static async getTerms(tenantId, { type, activeOnly = true } = {}) {
    const query = { tenantId };
    if (type) {
      query.type = type;
    }
    if (activeOnly) {
      query.active = true;
    }
    const raw = await TaxonomyTermModel.find(query).sort({
      type: 1,
      sortOrder: 1,
    });
    return raw.map((doc) => doc.toEntity());
  }
}

module.exports = TaxonomyTermManager;
