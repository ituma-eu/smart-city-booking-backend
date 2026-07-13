// Standard error response for the praktikum controllers: map an error to its
// HTTP status (domain errors carry `status`, entity/Nextcloud errors carry
// `statusCode`), and never echo an internal message on an unexpected 5xx.
function sendError(response, error, fallback) {
  const status = (error && (error.status || error.statusCode)) || 500;
  const body = status >= 500 ? fallback : (error && error.message) || fallback;
  return response.status(status).send(body);
}

module.exports = { sendError };
