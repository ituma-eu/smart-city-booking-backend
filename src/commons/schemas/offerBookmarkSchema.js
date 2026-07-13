const offerBookmarkSchemaDefinition = {
  tenantId: { type: String, required: true },
  userId: { type: String, required: true },
  offerId: { type: String, required: true },
  created: { type: Number, default: () => Date.now() },
};

module.exports = offerBookmarkSchemaDefinition;
