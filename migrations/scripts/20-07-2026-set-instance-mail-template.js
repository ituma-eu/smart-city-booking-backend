const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(
  __dirname,
  "../../src/commons/mail-service/templates",
);

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf8");
}

// Brands the instance-level mail shell (verification, invitations, password
// flows) with the KielRegion template. This is a data change to the
// admin-configurable instance.mailTemplate field — no mail code is modified.
module.exports = {
  name: "20-07-2026-set-instance-mail-template",

  up: async function (mongoose) {
    const template = readTemplate("praktikum-mail-template.temp.html");
    const InstanceModel = mongoose.model("Instance");
    await InstanceModel.updateMany({}, { $set: { mailTemplate: template } });
  },

  down: async function (mongoose) {
    const original = readTemplate("default-generic-mail-template.temp.html");
    const InstanceModel = mongoose.model("Instance");
    await InstanceModel.updateMany({}, { $set: { mailTemplate: original } });
  },
};
