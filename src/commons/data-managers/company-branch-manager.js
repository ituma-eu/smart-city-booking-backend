const CompanyBranch = require("../entities/company/companyBranch");
const CompanyBranchModel = require("./models/companyBranchModel");

class CompanyBranchManager {
  static async getBranchesByCompany(tenantId, companyId) {
    const raw = await CompanyBranchModel.find({ tenantId, companyId }).sort({
      created: 1,
    });
    return raw.map((doc) => doc.toEntity());
  }

  static async getBranch(tenantId, id) {
    const raw = await CompanyBranchModel.findOne({ tenantId, id });
    if (!raw) {
      return null;
    }
    return raw.toEntity();
  }

  static async countByCompany(tenantId, companyId) {
    return CompanyBranchModel.countDocuments({ tenantId, companyId });
  }

  static async storeBranch(branch, upsert = true) {
    const branchEntity =
      branch instanceof CompanyBranch ? branch : new CompanyBranch(branch);
    branchEntity.validate();
    await CompanyBranchModel.updateOne({ id: branchEntity.id }, branchEntity, {
      upsert,
    });
    return branchEntity;
  }

  static async removeBranch(tenantId, id) {
    await CompanyBranchModel.deleteOne({ tenantId, id });
  }
}

module.exports = CompanyBranchManager;
