const Company = require("../entities/company/company");
const CompanyModel = require("./models/companyModel");

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

  static async storeCompany(company, upsert = true) {
    const companyEntity =
      company instanceof Company ? company : new Company(company);
    companyEntity.validate();
    await CompanyModel.updateOne({ id: companyEntity.id }, companyEntity, {
      upsert,
      setDefaultsOnInsert: true,
    });
    return companyEntity;
  }

  static async setStatus(tenantId, id, status) {
    await CompanyModel.updateOne({ tenantId, id }, { $set: { status } });
  }

  static async setLogo(tenantId, id, logoUrl) {
    await CompanyModel.updateOne({ tenantId, id }, { $set: { logoUrl } });
  }
}

module.exports = CompanyManager;
