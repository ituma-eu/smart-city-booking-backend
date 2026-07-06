module.exports = {
  name: "25-06-2026-add-tenant-platform",

  up: async function (mongoose) {
    const Tenant = mongoose.model("Tenant");

    await Tenant.updateMany(
      { platform: { $exists: false } },
      { $set: { platform: "" } },
    );

    const existing = await Tenant.findOne({ id: "praktikum-kielregion" });
    if (!existing) {
      await Tenant.create({
        id: "praktikum-kielregion",
        name: "KielRegion GmbH",
        location: "Haßstraße 3-5, 24103 Kiel",
        mail: "info@kielregion.de",
        phone: "+49 431 55 60 01-0",
        platform: "praktikumsboerse",
        catalogParticipation: { visible: false },
      });
    }
  },

  down: async function (mongoose) {
    const Tenant = mongoose.model("Tenant");

    await Tenant.deleteOne({ id: "praktikum-kielregion" });
    await Tenant.updateMany({}, { $unset: { platform: "" } });
  },
};
