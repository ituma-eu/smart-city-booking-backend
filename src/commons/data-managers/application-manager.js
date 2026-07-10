const Application = require("../entities/student/application");
const ApplicationModel = require("./models/applicationModel");

class ApplicationManager {
  static async getByOfferAndUser(tenantId, offerId, studentUserId) {
    const raw = await ApplicationModel.findOne({
      tenantId,
      offerId,
      studentUserId,
    });
    if (!raw) {
      return null;
    }
    return raw.toEntity();
  }

  static async listByUser(tenantId, studentUserId) {
    const raw = await ApplicationModel.find({ tenantId, studentUserId }).sort({
      created: -1,
    });
    return raw.map((doc) => doc.toEntity());
  }

  static async storeApplication(application) {
    const entity =
      application instanceof Application
        ? application
        : new Application(application);
    entity.validate();
    await ApplicationModel.updateOne(
      { tenantId: entity.tenantId, id: entity.id },
      { $set: { ...entity } },
      { upsert: true },
    );
    return entity;
  }

  static async getById(tenantId, id) {
    const raw = await ApplicationModel.findOne({ tenantId, id });
    if (!raw) {
      return null;
    }
    return raw.toEntity();
  }

  static async getByCompany(tenantId, companyId) {
    const raw = await ApplicationModel.find({ tenantId, companyId }).sort({
      created: -1,
    });
    return raw.map((doc) => doc.toEntity());
  }

  static async getByOffer(tenantId, offerId) {
    const raw = await ApplicationModel.find({ tenantId, offerId });
    return raw.map((doc) => doc.toEntity());
  }

  static async removeByOffer(tenantId, offerId) {
    await ApplicationModel.deleteMany({ tenantId, offerId });
  }

  static async removeByCompany(tenantId, companyId) {
    await ApplicationModel.deleteMany({ tenantId, companyId });
  }

  static async getAllByStudent(studentUserId) {
    const raw = await ApplicationModel.find({ studentUserId });
    return raw.map((doc) => doc.toEntity());
  }

  static async removeByStudentAllTenants(studentUserId) {
    await ApplicationModel.deleteMany({ studentUserId });
  }

  static async updateStatus(tenantId, id, status) {
    await ApplicationModel.updateOne({ tenantId, id }, { $set: { status } });
  }

  static async addDocument(tenantId, id, document) {
    await ApplicationModel.updateOne(
      { tenantId, id },
      { $push: { documents: document } },
    );
  }

  static async removeDocument(tenantId, id, documentId) {
    await ApplicationModel.updateOne(
      { tenantId, id },
      { $pull: { documents: { id: documentId } } },
    );
  }
}

module.exports = ApplicationManager;
