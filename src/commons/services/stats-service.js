const ApplicationManager = require("../data-managers/application-manager");
const CompanyManager = require("../data-managers/company-manager");
const CompanyBranchManager = require("../data-managers/company-branch-manager");
const TaxonomyTermManager = require("../data-managers/taxonomy-term-manager");

const MONTHS_WINDOW = 12;

class StatsService {
  // Locations per district = company HQ (company.districtId) plus every branch
  // (branch.districtId), summed. HQ is not stored as a branch, so no double-count.
  static async locationsByDistrict(tenantId) {
    const [companies, branches] = await Promise.all([
      CompanyManager.countByDistrict(tenantId),
      CompanyBranchManager.countByDistrict(tenantId),
    ]);
    const totals = new Map();
    for (const { districtId, count } of [...companies, ...branches]) {
      if (!districtId) {
        continue;
      }
      totals.set(districtId, (totals.get(districtId) || 0) + count);
    }
    return Array.from(totals.entries())
      .map(([districtId, count]) => ({ districtId, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Admin dashboard aggregates that the statistics page can't compute from the
  // existing list endpoints. `companyId` scopes the application figures to one
  // company; locations are always tenant-global.
  static async getStats(tenantId, companyId) {
    const [terms, statusRows, monthly, locationsByDistrict] = await Promise.all(
      [
        TaxonomyTermManager.getTerms(tenantId, { type: "application_status" }),
        ApplicationManager.aggregateByStatus(tenantId, companyId),
        ApplicationManager.aggregateMonthly(tenantId, companyId, MONTHS_WINDOW),
        StatsService.locationsByDistrict(tenantId),
      ],
    );
    const counts = new Map(statusRows.map((row) => [row.status, row.count]));
    const byStatus = terms.map((term) => ({
      status: term.name,
      count: counts.get(term.name) || 0,
    }));
    for (const row of statusRows) {
      if (!terms.some((term) => term.name === row.status)) {
        byStatus.push({ status: row.status, count: row.count });
      }
    }
    return { applications: { byStatus, monthly }, locationsByDistrict };
  }
}

module.exports = StatsService;
