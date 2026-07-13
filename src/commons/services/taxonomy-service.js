const TaxonomyTermManager = require("../data-managers/taxonomy-term-manager");

function toTaxonomyDto(term) {
  return {
    id: term.id,
    type: term.type,
    name: term.name,
    color: term.color,
    sortOrder: term.sortOrder,
  };
}

class TaxonomyService {
  static async listTaxonomies(tenantId, { type } = {}) {
    const terms = await TaxonomyTermManager.getTerms(tenantId, {
      type: type || undefined,
      activeOnly: true,
    });
    const dtos = terms.map(toTaxonomyDto);

    if (type) {
      return dtos;
    }
    const grouped = {};
    for (const dto of dtos) {
      if (!grouped[dto.type]) {
        grouped[dto.type] = [];
      }
      grouped[dto.type].push(dto);
    }
    return grouped;
  }
}

module.exports = TaxonomyService;
