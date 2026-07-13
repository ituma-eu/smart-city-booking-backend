const bunyan = require("bunyan");

const logger = bunyan.createLogger({
  name: "file-url.js",
  level: process.env.LOG_LEVEL,
});

// Parse the `name` query parameter out of a stored /files/get URL and delete
// that file from Nextcloud. Best-effort: a missing or unreachable file must
// never be fatal to the surrounding operation.
async function deleteFileByUrl(tenantId, url) {
  if (!url) {
    return;
  }
  let path = null;
  try {
    path = new URL(url).searchParams.get("name");
  } catch {
    return;
  }
  if (!path) {
    return;
  }
  const { NextcloudManager } = require("../data-managers/file-manager");
  try {
    await NextcloudManager.deleteFile(tenantId, path);
  } catch (e) {
    logger.warn(`Could not delete file ${path}: ${e.message}`);
  }
}

module.exports = { deleteFileByUrl };
