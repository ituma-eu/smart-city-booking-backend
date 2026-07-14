const Company = require("../entities/company/company");
const CompanyModel = require("./models/companyModel");
const { escapeRegex } = require("../utilities/regexUtils");

class CompanyManager {
  static async getCompanies(tenantId, filter = {}) {
    const rawCompanies = await CompanyModel.find({ tenantId, ...filter });
    return rawCompanies.map((doc) => doc.toEntity());
  }

  static async getCompany(tenantId, id) {
    const rawCompany = await CompanyModel.findOne({ tenantId, id });
    if (!rawCompany) {
      return null;
    }
    return rawCompany.toEntity();
  }

  static async getCompanyIdsByName(tenantId, name) {
    const raw = await CompanyModel.find(
      { tenantId, name: { $regex: escapeRegex(name), $options: "i" } },
      { id: 1, _id: 0 },
    );
    return raw.map((doc) => doc.id);
  }

  static async getBlockedCompanyIds(tenantId) {
    const raw = await CompanyModel.find(
      { tenantId, status: "blocked" },
      { id: 1, _id: 0 },
    );
    return raw.map((doc) => doc.id);
  }

  static async storeCompany(company, upsert = true) {
    const companyEntity =
      company instanceof Company ? company : new Company(company);
    companyEntity.validate();
    await CompanyModel.updateOne(
      { id: companyEntity.id, tenantId: companyEntity.tenantId },
      { ...companyEntity },
      { upsert, setDefaultsOnInsert: true, runValidators: true },
    );
    return companyEntity;
  }

  static async setStatus(tenantId, id, status) {
    await CompanyModel.updateOne({ tenantId, id }, { $set: { status } });
  }

  static async setLogo(tenantId, id, logoUrl) {
    await CompanyModel.updateOne({ tenantId, id }, { $set: { logoUrl } });
  }

  static async deleteCompany(tenantId, id) {
    await CompanyModel.deleteOne({ tenantId, id });
  }
  static async countByField(tenantId, field, value) {
    return CompanyModel.countDocuments({ tenantId, [field]: value });
  }
}

module.exports = CompanyManager;
