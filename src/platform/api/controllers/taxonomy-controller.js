const bunyan = require("bunyan");
const TaxonomyService = require("../../../commons/services/taxonomy-service");

const logger = bunyan.createLogger({
  name: "taxonomy-controller.js",
  level: process.env.LOG_LEVEL,
});

class TaxonomyController {
  static async getTaxonomies(request, response) {
    try {
      const tenantId = request.params.tenant;
      const type =
        request.query && request.query.type
          ? String(request.query.type)
          : undefined;
      const result = await TaxonomyService.listTaxonomies(tenantId, { type });
      return response.status(200).send(result);
    } catch (error) {
      logger.error("Could not list taxonomies", error);
      return response
        .status(error.status || error.statusCode || 500)
        .send(error.message || "Could not list taxonomies");
    }
  }
}

module.exports = TaxonomyController;
