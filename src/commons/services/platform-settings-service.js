const PlatformSettings = require("../entities/settings/platformSettings");
const PlatformSettingsManager = require("../data-managers/platform-settings-manager");

const TEXT_FIELDS = [
  "logoUrl",
  "privacyPolicyText",
  "studentTermsText",
  "companyTermsText",
  "consentText",
  "imprintText",
];
const NUMBER_FIELDS = ["maxDocsPerInternship", "maxDocSizeMb"];

class PlatformSettingsService {
  static async getSettings(tenantId) {
    const existing = await PlatformSettingsManager.getByTenant(tenantId);
    if (existing) {
      return existing;
    }
    return PlatformSettingsManager.store(PlatformSettings.create({ tenantId }));
  }

  static async updateSettings(tenantId, payload) {
    const current = await PlatformSettingsService.getSettings(tenantId);
    const next = { ...current, tenantId };

    if (payload.directPublishVerified !== undefined) {
      next.directPublishVerified =
        payload.directPublishVerified === true ||
        payload.directPublishVerified === "true";
    }
    for (const key of TEXT_FIELDS) {
      if (payload[key] !== undefined) {
        next[key] = payload[key];
      }
    }
    for (const key of NUMBER_FIELDS) {
      if (payload[key] !== undefined) {
        next[key] = payload[key];
      }
    }

    return PlatformSettingsManager.store(PlatformSettings.create(next));
  }
}

module.exports = PlatformSettingsService;
