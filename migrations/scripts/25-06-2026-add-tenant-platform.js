module.exports = {
  name: "25-06-2026-add-tenant-platform",

  up: async function (mongoose) {
    const Tenant = mongoose.model("Tenant");

    await Tenant.updateMany(
      { platform: { $exists: false } },
      { $set: { platform: "" } },
    );

    const existing = await Tenant.findOne({ id: "kielregion" });
    if (!existing) {
      await Tenant.create({
        id: "kielregion",
        name: "KielRegion GmbH",
        location: "Haßstraße 3-5, 24103 Kiel",
        mail: "info@kielregion.de",
        phone: "+49 431 55 60 01-0",
        platform: "praktikumsboerse",
      });
    }
  },

  down: async function (mongoose) {
    const Tenant = mongoose.model("Tenant");

    await Tenant.deleteOne({ id: "kielregion" });
    await Tenant.updateMany({}, { $unset: { platform: "" } });
  },
};
