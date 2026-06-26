const TaxonomyTermModel = require("./models/taxonomyTermModel");

class TaxonomyTermManager {
  static async getTerm(tenantId, id) {
    const raw = await TaxonomyTermModel.findOne({ tenantId, id });
    if (!raw) {
      return null;
    }
    return raw.toEntity();
  }
}

module.exports = TaxonomyTermManager;
