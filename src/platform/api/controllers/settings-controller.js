const bunyan = require("bunyan");
const CompanyController = require("./company-controller");
const PlatformSettingsService = require("../../../commons/services/platform-settings-service");
const platformSettingsSchema = require("../../../commons/schemas/platformSettingsSchema");

const SETTINGS_KEYS = Object.keys(platformSettingsSchema);

const logger = bunyan.createLogger({
  name: "settings-controller.js",
  level: process.env.LOG_LEVEL,
});

class SettingsController {
  static async getSettings(request, response) {
    try {
      const tenantId = request.params.tenant;
      const settings = await PlatformSettingsService.getSettings(tenantId);
      const keyParam = request.query && request.query.key;
      if (keyParam !== undefined && keyParam !== "") {
        const requested = String(keyParam)
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean);
        const unknown = requested.filter((key) => !SETTINGS_KEYS.includes(key));
        if (unknown.length > 0) {
          return response
            .status(400)
            .send(`Unknown settings key(s): ${unknown.join(", ")}`);
        }
        const projected = {};
        for (const key of requested) {
          projected[key] = settings[key];
        }
        return response.status(200).send(projected);
      }
      return response.status(200).send(settings);
    } catch (error) {
      logger.error("Could not load settings", error);
      return response
        .status(error.status || error.statusCode || 500)
        .send(error.message || "Could not load settings");
    }
  }

  static async updateSettings(request, response) {
    try {
      const tenantId = request.params.tenant;
      if (!(await CompanyController.isTenantAdmin(request.user.id, tenantId))) {
        return response.sendStatus(403);
      }
      const settings = await PlatformSettingsService.updateSettings(
        tenantId,
        request.body || {},
      );
      return response.status(200).send(settings);
    } catch (error) {
      logger.error("Could not update settings", error);
      return response
        .status(error.status || error.statusCode || 500)
        .send(error.message || "Could not update settings");
    }
  }
}

module.exports = SettingsController;
