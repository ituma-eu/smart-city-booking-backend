const { AsyncLocalStorage } = require("node:async_hooks");

// Per-request context. Lets deep services (e.g. the audit log) attribute an
// action to the acting user without threading the request through every call.
// Established once per request by a router-level middleware; reads are safe
// anywhere downstream and simply return undefined outside a request (seeders,
// migrations, scheduled jobs).
const storage = new AsyncLocalStorage();

function run(request, next) {
  storage.run(request, next);
}

function getRequest() {
  return storage.getStore();
}

function getActorId() {
  const request = storage.getStore();
  return request && request.user ? request.user.id : undefined;
}

module.exports = { storage, run, getRequest, getActorId };
