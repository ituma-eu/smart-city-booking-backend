const AdminAccessService = require("./admin-access-service");

/**
 * Express middleware factory that gates an admin route on a single permission.
 * Assumes `AuthenticationController.isSignedIn` has already populated
 * `request.user`. The tenant is taken from the route (`/api/:tenant/...`).
 */
function requirePermission(permission) {
  return async function (request, response, next) {
    try {
      const tenantId = request.params.tenant;
      const userId = request.user && request.user.id;
      if (!userId) {
        return response.sendStatus(401);
      }
      const allowed = await AdminAccessService.hasPermission(
        userId,
        tenantId,
        permission,
      );
      if (!allowed) {
        return response.sendStatus(403);
      }
      return next();
    } catch {
      return response.sendStatus(500);
    }
  };
}

module.exports = requirePermission;
