const { v4: uuidv4 } = require("uuid");
const TaxonomyTermManager = require("../data-managers/taxonomy-term-manager");
const CompanyManager = require("../data-managers/company-manager");
const OfferManager = require("../data-managers/offer-manager");
const CompanyBranchManager = require("../data-managers/company-branch-manager");
const ApplicationManager = require("../data-managers/application-manager");
const AccountDeletionManager = require("../data-managers/account-deletion-manager");

const TYPES = [
  "industry",
  "internship_type",
  "district",
  "company_size",
  "application_status",
  "deletion_reason_student",
  "deletion_reason_company",
];

// The public read DTO (no `active` — public reads are active-only anyway).
function toTaxonomyDto(term) {
  return {
    id: term.id,
    type: term.type,
    name: term.name,
    color: term.color,
    sortOrder: term.sortOrder,
  };
}

// The admin DTO exposes `active` so inactive terms can be managed / reactivated.
function toAdminDto(term) {
  return {
    id: term.id,
    type: term.type,
    name: term.name,
    color: term.color,
    active: term.active,
    sortOrder: term.sortOrder,
  };
}

function groupByType(dtos) {
  const grouped = {};
  for (const dto of dtos) {
    if (!grouped[dto.type]) {
      grouped[dto.type] = [];
    }
    grouped[dto.type].push(dto);
  }
  return grouped;
}

// How many live records reference this term. A referenced term must not be
// hard-deleted (it would orphan the reference) — the caller returns 409 and the
// admin deactivates it instead. Reference is by term id everywhere except
// application_status, which stores the term *name* on the application.
async function countUsage(tenantId, term) {
  switch (term.type) {
    case "industry":
      return (
        (await CompanyManager.countByField(tenantId, "industryId", term.id)) +
        (await OfferManager.countByField(tenantId, "industryId", term.id))
      );
    case "internship_type":
      return OfferManager.countByField(tenantId, "internshipTypeId", term.id);
    case "district":
      return (
        (await CompanyManager.countByField(tenantId, "districtId", term.id)) +
        (await CompanyBranchManager.countByField(
          tenantId,
          "districtId",
          term.id,
        )) +
        (await OfferManager.countByField(tenantId, "districtId", term.id))
      );
    case "company_size":
      return CompanyManager.countByField(tenantId, "sizeId", term.id);
    case "application_status":
      return ApplicationManager.countByField(tenantId, "status", term.name);
    case "deletion_reason_student":
    case "deletion_reason_company":
      return AccountDeletionManager.countByField(tenantId, "reasonId", term.id);
    default:
      return 0;
  }
}

class TaxonomyService {
  // Public read — active terms only, minimal DTO.
  static async listTaxonomies(tenantId, { type } = {}) {
    const terms = await TaxonomyTermManager.getTerms(tenantId, {
      type: type || undefined,
      activeOnly: true,
    });
    const dtos = terms.map(toTaxonomyDto);
    return type ? dtos : groupByType(dtos);
  }

  // Admin read — all terms (incl. inactive), grouped, with the `active` flag.
  static async listAllForAdmin(tenantId, { type } = {}) {
    const terms = await TaxonomyTermManager.getTerms(tenantId, {
      type: type || undefined,
      activeOnly: false,
    });
    const dtos = terms.map(toAdminDto);
    return type ? dtos : groupByType(dtos);
  }

  static async createTerm(tenantId, { type, name, color, active } = {}) {
    if (!TYPES.includes(type)) {
      throw { message: "Invalid taxonomy type", status: 400 };
    }
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      throw { message: "Name is required", status: 400 };
    }
    const existing = await TaxonomyTermManager.getTerms(tenantId, {
      type,
      activeOnly: false,
    });
    const sortOrder = existing.length
      ? Math.max(...existing.map((t) => t.sortOrder)) + 1
      : 0;
    const term = {
      id: uuidv4(),
      tenantId,
      type,
      name: cleanName,
      color: type === "industry" ? String(color || "").trim() : "",
      active: active !== false,
      sortOrder,
    };
    try {
      const created = await TaxonomyTermManager.createTerm(term);
      return toAdminDto(created);
    } catch (error) {
      if (error && error.code === 11000) {
        throw { message: "A term with this name already exists", status: 409 };
      }
      throw error;
    }
  }

  static async updateTerm(tenantId, id, { name, color, active } = {}) {
    const term = await TaxonomyTermManager.getTerm(tenantId, id);
    if (!term) {
      throw { message: "Taxonomy term not found", status: 404 };
    }
    const patch = {};
    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        throw { message: "Name is required", status: 400 };
      }
      patch.name = cleanName;
    }
    if (color !== undefined) {
      patch.color = term.type === "industry" ? String(color || "").trim() : "";
    }
    if (active !== undefined) {
      patch.active = !!active;
    }
    if (Object.keys(patch).length === 0) {
      return toAdminDto(term);
    }
    try {
      const updated = await TaxonomyTermManager.updateTerm(tenantId, id, patch);
      return toAdminDto(updated);
    } catch (error) {
      if (error && error.code === 11000) {
        throw { message: "A term with this name already exists", status: 409 };
      }
      throw error;
    }
  }

  // Persist a new order for one type from the given ordered list of ids.
  static async reorderTerms(tenantId, { type, orderedIds } = {}) {
    if (!TYPES.includes(type)) {
      throw { message: "Invalid taxonomy type", status: 400 };
    }
    if (!Array.isArray(orderedIds)) {
      throw { message: "orderedIds must be an array", status: 400 };
    }
    const terms = await TaxonomyTermManager.getTerms(tenantId, {
      type,
      activeOnly: false,
    });
    const known = new Set(terms.map((t) => t.id));
    const updates = orderedIds
      .filter((id) => known.has(id))
      .map((id, index) => ({ id, sortOrder: index }));
    await TaxonomyTermManager.setSortOrders(tenantId, updates);
    return TaxonomyService.listAllForAdmin(tenantId, { type });
  }

  static async deleteTerm(tenantId, id) {
    const term = await TaxonomyTermManager.getTerm(tenantId, id);
    if (!term) {
      throw { message: "Taxonomy term not found", status: 404 };
    }
    if (String(term.name).trim().toLowerCase() === "andere") {
      throw {
        message: "The „andere“ fallback term cannot be deleted",
        status: 409,
      };
    }
    const usage = await countUsage(tenantId, term);
    if (usage > 0) {
      throw {
        message: `Term is in use by ${usage} record(s) — deactivate it instead of deleting`,
        status: 409,
        usage,
      };
    }
    await TaxonomyTermManager.removeTerm(tenantId, id);
    return { deleted: id };
  }
}

module.exports = TaxonomyService;
