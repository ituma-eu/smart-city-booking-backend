const mongoose = require("mongoose");
const adminInvitationSchemaDefinition = require("../../schemas/adminInvitationSchema");

const { Schema } = mongoose;

const AdminInvitationSchema = new Schema(adminInvitationSchemaDefinition);

AdminInvitationSchema.index({ token: 1 }, { unique: true });
// At most one pending invitation per email per tenant — blocks a concurrent
// double-invite where both clear the app-level pending check before either writes.
AdminInvitationSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

AdminInvitationSchema.methods.toEntity = function () {
  const AdminInvitation = require("../../entities/admin/adminInvitation");
  return new AdminInvitation(this.toObject());
};

module.exports =
  mongoose.models.AdminInvitation ||
  mongoose.model("AdminInvitation", AdminInvitationSchema, "admin_invitations");
