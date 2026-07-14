const express = require("express");
const AuthenticationController = require("../authentication/controllers/authentication-controller");
const BookableController = require("./controllers/bookable-controller");
const EventController = require("./controllers/event-controller");
const PaymentController = require("./controllers/payment-controller");
const CalendarController = require("./controllers/calendar-controller");
const CouponController = require("./controllers/coupon-controller");
const { BookingController } = require("./controllers/booking-controller");
const CheckoutController = require("./controllers/checkout-controller");
const FileController = require("./controllers/file-controller");
const WorkflowController = require("./controllers/workflow-controller");
const InvitationController = require("./controllers/invitation-controller");
const RoleController = require("./controllers/role-controller");
const { TenantController } = require("./controllers/tenant-controller");
const {
  GroupBookingController,
} = require("./controllers/group-booking-controller");
const CompanyController = require("./controllers/company-controller");
const SettingsController = require("./controllers/settings-controller");
const OfferController = require("./controllers/offer-controller");
const TaxonomyController = require("./controllers/taxonomy-controller");
const PostController = require("./controllers/post-controller");
const StudentController = require("./controllers/student-controller");
const AccountDeletionController = require("./controllers/account-deletion-controller");
const ApplicationController = require("./controllers/application-controller");
const { optionalAuth } = require("../../middleware/auth-middleware");

const router = express.Router({ mergeParams: true });

// COMPANIES
// =========

router.post("/companies/register", CompanyController.register);
router.post(
  "/companies/resend-verification",
  CompanyController.resendVerification,
);

// STUDENTS
// ========

router.post("/students/register", StudentController.register);
router.post(
  "/students/resend-verification",
  StudentController.resendVerification,
);
router.get(
  "/students/me",
  AuthenticationController.isSignedIn,
  StudentController.getMe,
);
router.put(
  "/students/me",
  AuthenticationController.isSignedIn,
  StudentController.updateMe,
);
router.delete(
  "/students/me",
  AuthenticationController.isSignedIn,
  StudentController.deleteMe,
);
router.get(
  "/students/me/bookmarks",
  AuthenticationController.isSignedIn,
  StudentController.getBookmarks,
);
router.post(
  "/students/me/bookmarks",
  AuthenticationController.isSignedIn,
  StudentController.addBookmark,
);
router.delete(
  "/students/me/bookmarks/:offerId",
  AuthenticationController.isSignedIn,
  StudentController.removeBookmark,
);
router.get(
  "/admin/account-deletions",
  AuthenticationController.isSignedIn,
  AccountDeletionController.getStats,
);
router.get(
  "/students/me/applications",
  AuthenticationController.isSignedIn,
  ApplicationController.listMine,
);
router.get(
  "/companies",
  AuthenticationController.isSignedIn,
  CompanyController.getCompanies,
);
router.get(
  "/companies/mine",
  AuthenticationController.isSignedIn,
  CompanyController.getMyCompany,
);
router.get(
  "/me/context",
  AuthenticationController.isSignedIn,
  CompanyController.getMyContext,
);
router.get(
  "/companies/:id",
  AuthenticationController.isSignedIn,
  CompanyController.getCompany,
);
router.get("/companies/:id/public", CompanyController.getPublicCompany);
router.put(
  "/companies/:id",
  AuthenticationController.isSignedIn,
  CompanyController.updateProfile,
);
router.delete(
  "/companies/:id",
  AuthenticationController.isSignedIn,
  CompanyController.deleteAccount,
);
router.post(
  "/companies/:id/logo",
  AuthenticationController.isSignedIn,
  CompanyController.uploadLogo,
);
router.delete(
  "/companies/:id/logo",
  AuthenticationController.isSignedIn,
  CompanyController.removeLogo,
);
router.get(
  "/companies/:id/media",
  AuthenticationController.isSignedIn,
  CompanyController.listMedia,
);
router.post(
  "/companies/:id/media",
  AuthenticationController.isSignedIn,
  CompanyController.uploadMedia,
);
router.delete(
  "/companies/:id/media/:mediaId",
  AuthenticationController.isSignedIn,
  CompanyController.removeMedia,
);
router.get(
  "/companies/:id/branches",
  AuthenticationController.isSignedIn,
  CompanyController.listBranches,
);
router.post(
  "/companies/:id/branches",
  AuthenticationController.isSignedIn,
  CompanyController.createBranch,
);
router.get(
  "/companies/:id/branches/:branchId",
  AuthenticationController.isSignedIn,
  CompanyController.getBranch,
);
router.put(
  "/companies/:id/branches/:branchId",
  AuthenticationController.isSignedIn,
  CompanyController.updateBranch,
);
router.delete(
  "/companies/:id/branches/:branchId",
  AuthenticationController.isSignedIn,
  CompanyController.removeBranch,
);
router.post(
  "/companies/:id/branches/:branchId/logo",
  AuthenticationController.isSignedIn,
  CompanyController.uploadBranchLogo,
);
router.delete(
  "/companies/:id/branches/:branchId/logo",
  AuthenticationController.isSignedIn,
  CompanyController.removeBranchLogo,
);
router.post(
  "/companies/:id/members/invite",
  AuthenticationController.isSignedIn,
  CompanyController.inviteMember,
);
router.get(
  "/companies/:id/members",
  AuthenticationController.isSignedIn,
  CompanyController.listMembers,
);
router.delete(
  "/companies/:id/members/:userId",
  AuthenticationController.isSignedIn,
  CompanyController.removeMember,
);
router.post(
  "/member-invitations/:token/accept",
  CompanyController.acceptInvitation,
);
router.post(
  "/companies/:id/verify",
  AuthenticationController.isSignedIn,
  CompanyController.verify,
);
router.post(
  "/companies/:id/block",
  AuthenticationController.isSignedIn,
  CompanyController.block,
);
router.post(
  "/companies/:id/unverify",
  AuthenticationController.isSignedIn,
  CompanyController.unverify,
);
router.post(
  "/admin/companies",
  AuthenticationController.isSignedIn,
  CompanyController.adminCreate,
);
router.delete(
  "/admin/companies/:id",
  AuthenticationController.isSignedIn,
  CompanyController.adminDelete,
);

// TAXONOMIES
// ==========

router.get("/taxonomies", TaxonomyController.getTaxonomies);
router.get(
  "/admin/taxonomies",
  AuthenticationController.isSignedIn,
  TaxonomyController.adminList,
);
router.post(
  "/admin/taxonomies",
  AuthenticationController.isSignedIn,
  TaxonomyController.create,
);
router.put(
  "/admin/taxonomies/reorder",
  AuthenticationController.isSignedIn,
  TaxonomyController.reorder,
);
router.put(
  "/admin/taxonomies/:id",
  AuthenticationController.isSignedIn,
  TaxonomyController.update,
);
router.delete(
  "/admin/taxonomies/:id",
  AuthenticationController.isSignedIn,
  TaxonomyController.remove,
);

// POSTS / INFOS (CMS)
// ==================

router.get("/posts", PostController.list);
router.get("/post-tags", PostController.tags);
router.get("/posts/:slug", PostController.getBySlug);
router.get(
  "/admin/posts",
  AuthenticationController.isSignedIn,
  PostController.adminList,
);
router.post(
  "/admin/posts",
  AuthenticationController.isSignedIn,
  PostController.create,
);
router.put(
  "/admin/posts/:id",
  AuthenticationController.isSignedIn,
  PostController.update,
);
router.post(
  "/admin/posts/:id/publish",
  AuthenticationController.isSignedIn,
  PostController.publish,
);
router.post(
  "/admin/posts/:id/unpublish",
  AuthenticationController.isSignedIn,
  PostController.unpublish,
);
router.delete(
  "/admin/posts/:id",
  AuthenticationController.isSignedIn,
  PostController.remove,
);
router.get(
  "/me/company-posts",
  AuthenticationController.isSignedIn,
  PostController.companyList,
);
router.post(
  "/admin/posts/:id/thumbnail",
  AuthenticationController.isSignedIn,
  PostController.uploadThumbnail,
);
router.delete(
  "/admin/posts/:id/thumbnail",
  AuthenticationController.isSignedIn,
  PostController.removeThumbnail,
);
router.post(
  "/admin/posts/:id/attachments",
  AuthenticationController.isSignedIn,
  PostController.uploadAttachment,
);
router.delete(
  "/admin/posts/:id/attachments/:attId",
  AuthenticationController.isSignedIn,
  PostController.removeAttachment,
);

// SETTINGS
// ========

router.get("/settings", SettingsController.getSettings);
router.put(
  "/settings",
  AuthenticationController.isSignedIn,
  SettingsController.updateSettings,
);

// OFFERS / PRAKTIKA
// =================

// public
router.get("/offers", OfferController.searchOffers);
router.get("/offers/:offerId/public", OfferController.getPublicOffer);
router.post(
  "/offers/:offerId/applications",
  AuthenticationController.isSignedIn,
  ApplicationController.submit,
);
router.get(
  "/companies/:id/applications",
  AuthenticationController.isSignedIn,
  ApplicationController.listForCompany,
);
router.put(
  "/companies/:id/applications/:applicationId/status",
  AuthenticationController.isSignedIn,
  ApplicationController.updateStatus,
);
router.post(
  "/applications/:id/documents",
  AuthenticationController.isSignedIn,
  ApplicationController.uploadDocument,
);
router.get(
  "/applications/:id/documents",
  AuthenticationController.isSignedIn,
  ApplicationController.listDocuments,
);
router.get(
  "/applications/:id/documents/:docId/download",
  AuthenticationController.isSignedIn,
  ApplicationController.downloadDocument,
);
router.delete(
  "/applications/:id/documents/:docId",
  AuthenticationController.isSignedIn,
  ApplicationController.removeDocument,
);

// moderation (admin)
router.get(
  "/admin/offers",
  AuthenticationController.isSignedIn,
  OfferController.listModeration,
);
router.post(
  "/offers/:offerId/approve",
  AuthenticationController.isSignedIn,
  OfferController.approveOffer,
);
router.post(
  "/offers/:offerId/reject",
  AuthenticationController.isSignedIn,
  OfferController.rejectOffer,
);
router.post(
  "/offers/:offerId/deactivate",
  AuthenticationController.isSignedIn,
  OfferController.deactivateOffer,
);
router.post(
  "/offers/:offerId/reactivate",
  AuthenticationController.isSignedIn,
  OfferController.reactivateOffer,
);

// company-side
router.get(
  "/companies/:id/stats",
  AuthenticationController.isSignedIn,
  OfferController.getStats,
);
router.get(
  "/companies/:id/offers",
  AuthenticationController.isSignedIn,
  OfferController.listOffers,
);
router.post(
  "/companies/:id/offers",
  AuthenticationController.isSignedIn,
  OfferController.createOffer,
);
router.get(
  "/companies/:id/offers/:offerId",
  AuthenticationController.isSignedIn,
  OfferController.getOffer,
);
router.put(
  "/companies/:id/offers/:offerId",
  AuthenticationController.isSignedIn,
  OfferController.updateOffer,
);
router.delete(
  "/companies/:id/offers/:offerId",
  AuthenticationController.isSignedIn,
  OfferController.deleteOffer,
);
router.post(
  "/companies/:id/offers/:offerId/archive",
  AuthenticationController.isSignedIn,
  OfferController.archiveOffer,
);
router.get(
  "/companies/:id/offers/:offerId/media",
  AuthenticationController.isSignedIn,
  OfferController.listMedia,
);
router.post(
  "/companies/:id/offers/:offerId/media",
  AuthenticationController.isSignedIn,
  OfferController.uploadMedia,
);
router.delete(
  "/companies/:id/offers/:offerId/media/:mediaId",
  AuthenticationController.isSignedIn,
  OfferController.removeMedia,
);

// BOOKABLES
// =========

//Public
router.get(
  "/bookables/public",
  optionalAuth,
  BookableController.getPublicBookables,
);
router.get(
  "/bookables/public/:id",
  optionalAuth,
  BookableController.getPublicBookable,
);
router.get("/bookables/:id/bookings", BookingController.getRelatedBookings);
router.get("/bookables/:id/openingHours", BookableController.getOpeningHours);
router.get(
  "/bookables/:id/availability/v1",
  optionalAuth,
  CalendarController.getBookableAvailabilityV1,
);
router.get(
  "/bookables/:id/availability/v2",
  optionalAuth,
  CalendarController.getBookableAvailabilityV2,
);
router.get(
  "/bookables/:id/availability",
  optionalAuth,
  CalendarController.getBookableAvailability,
);
router.get(
  "/bookables/:id/block-periods",
  optionalAuth,
  CalendarController.getBookableBlockPeriods,
);
router.get("/bookables/:id/occupancy", BookableController.getBookableOccupancy);

router.get(
  "/bookables/:id/prices",
  BookableController.getBookablePriceCategories,
);

// Protected
router.get(
  "/bookables",
  AuthenticationController.isSignedIn,
  BookableController.getBookables,
);

router.get(
  "/bookables/_template",
  AuthenticationController.isSignedIn,
  BookableController.getBookableTemplate,
);

router.get(
  "/bookables/:id",
  AuthenticationController.isSignedIn,
  BookableController.getBookable,
);

router.put(
  "/bookables",
  AuthenticationController.isSignedIn,
  BookableController.storeBookable,
);

router.delete(
  "/bookables/:id",
  AuthenticationController.isSignedIn,
  BookableController.removeBookable,
);
router.get(
  "/bookables/_meta/tags",
  AuthenticationController.isSignedIn,
  BookableController.getTags,
);
router.get(
  "/bookables/count/check",
  AuthenticationController.isSignedIn,
  BookableController.countCheck,
);

// EVENTS
// ======

// Public
router.get("/events", EventController.getEvents);
router.get("/events/:id", EventController.getEvent);
router.get("/events/:id/bookings", BookingController.getEventBookings);

// Protected
router.put(
  "/events",
  AuthenticationController.isSignedIn,
  EventController.storeEvent,
);
router.delete(
  "/events/:id",
  AuthenticationController.isSignedIn,
  EventController.removeEvent,
);
router.get(
  "/events/_meta/tags",
  AuthenticationController.isSignedIn,
  EventController.getTags,
);
router.get(
  "/events/count/check",
  AuthenticationController.isSignedIn,
  EventController.countCheck,
);
router.get(
  "/events/:id/count",
  AuthenticationController.isSignedIn,
  EventController.getBookedSeatsCount,
);

// BOOKINGS
// ========

router.get("/bookings", optionalAuth, BookingController.getBookings);

router.put(
  "/bookings",
  AuthenticationController.isSignedIn,
  BookingController.storeBooking,
);
router.get(
  "/bookings/assigned",
  AuthenticationController.isSignedIn,
  BookingController.getAssignedBookings,
);

router.get(
  "/bookings/:id",
  AuthenticationController.isSignedIn,
  BookingController.getBooking,
);

router.delete(
  "/bookings/:id",
  AuthenticationController.isSignedIn,
  BookingController.removeBooking,
);

router.get(
  "/bookings/:ids/status",
  optionalAuth,
  BookingController.getBookingStatus,
);

router.get(
  "/bookings/:id/status/public",
  BookingController.getPublicBookingStatus,
);

router.get(
  "/bookings/:id/commit",
  AuthenticationController.isSignedIn,
  BookingController.commitBooking,
);
router.post(
  "/bookings/:id/pay",
  AuthenticationController.isSignedIn,
  BookingController.payBooking,
);
router.get(
  "/bookings/:id/cancellation-refund-preview",
  AuthenticationController.isSignedIn,
  BookingController.getCancellationRefundPreview,
);
router.get(
  "/bookings/:id/cancellation-refund-preview/public",
  BookingController.getPublicCancellationRefundPreview,
);
router.post(
  "/bookings/:id/reject",
  AuthenticationController.isSignedIn,
  BookingController.rejectBooking,
);
router.post(
  "/bookings/:id/request-reject",
  BookingController.requestRejectBooking,
);
router.get(
  "/bookings/:id/verify-ownership",
  BookingController.verifyBookingOwnership,
);
router.get(
  "/bookings/:id/hooks/:hookId/cancellation-refund-preview",
  BookingController.getHookCancellationRefundPreview,
);
router.get(
  "/bookings/:id/hooks/:hookId/release",
  BookingController.releaseBookingHook,
);
router.post(
  "/bookings/:id/receipt",
  AuthenticationController.isSignedIn,
  BookingController.createReceipt,
);

router.get(
  "/bookings/:id/receipt/:receiptId",
  AuthenticationController.isSignedIn,
  BookingController.getReceipt,
);

router.get(
  "/bookings/:id/invoice/:invoiceId",
  AuthenticationController.isSignedIn,
  BookingController.getInvoice,
);

router.post(
  "/bookings/:id/invoice",
  AuthenticationController.isSignedIn,
  BookingController.createInvoice,
);

router.get(
  "/bookings/:id/cancellation-receipt/:cancellationReceiptId",
  AuthenticationController.isSignedIn,
  BookingController.getCancellationReceipt,
);

// USERS
// =====
router.get(
  "/users",
  AuthenticationController.isSignedIn,
  TenantController.getUsers,
);

// GROUP BOOKINGS
// ==============
router.get(
  "/group-bookings",
  AuthenticationController.isSignedIn,
  GroupBookingController.getGroupBookings,
);
router.get(
  "/group-bookings/:id",
  AuthenticationController.isSignedIn,
  GroupBookingController.getGroupBooking,
);
router.put(
  "/group-bookings/:id",
  AuthenticationController.isSignedIn,
  GroupBookingController.updateGroupBooking,
);
router.post(
  "/group-bookings/:id/commit",
  AuthenticationController.isSignedIn,
  GroupBookingController.commitGroupBooking,
);
router.post(
  "/group-bookings/:id/pay",
  AuthenticationController.isSignedIn,
  GroupBookingController.payGroupBooking,
);
router.get(
  "/group-bookings/:id/cancellation-refund-preview",
  AuthenticationController.isSignedIn,
  GroupBookingController.getCancellationRefundPreview,
);
router.post(
  "/group-bookings/:id/reject",
  AuthenticationController.isSignedIn,
  GroupBookingController.rejectGroupBooking,
);
router.get(
  "/group-bookings/booking/:bookingId",
  AuthenticationController.isSignedIn,
  GroupBookingController.getGroupBookingByBookingId,
);
router.delete(
  "/group-bookings/:id",
  AuthenticationController.isSignedIn,
  GroupBookingController.removeGroupBooking,
);
router.post(
  "/group-bookings/:id/receipt",
  AuthenticationController.isSignedIn,
  GroupBookingController.createGroupBookingReceipt,
);
router.post(
  "/group-bookings/:id/invoice",
  AuthenticationController.isSignedIn,
  GroupBookingController.createGroupBookingInvoice,
);

// CHECKOUT
// ========
router.post("/checkout", optionalAuth, CheckoutController.checkout);
router.post("/checkout/group", optionalAuth, CheckoutController.groupCheckout);
router.post(
  "/checkout/validateItem",
  optionalAuth,
  CheckoutController.validateItem,
);
router.get(
  "/checkout/permissions/:id",
  optionalAuth,
  CheckoutController.checkoutPermissions,
);

// PAYMENTS
// ========

// Public
router.post("/payments", optionalAuth, PaymentController.createPayment);
router.get("/payments/notify", PaymentController.paymentNotificationGET);
router.post("/payments/notify", PaymentController.paymentNotificationPOST);
router.post("/payments/response", PaymentController.paymentResponse);
router.get("/payments/response", PaymentController.paymentResponse);
router.get(
  "/payments/providers/:provider/test",
  AuthenticationController.isSignedIn,
  PaymentController.testConnection,
);

// CALENDAR
// ========
router.get("/calendar/occupancy", CalendarController.getOccupancies);

// COUPONS
// =======
router.get("/coupons", optionalAuth, CouponController.getCoupons);
router.get("/coupons/:id", CouponController.getCoupon);
router.put(
  "/coupons",
  AuthenticationController.isSignedIn,
  CouponController.storeCoupon,
);
router.delete(
  "/coupons/:id",
  AuthenticationController.isSignedIn,
  CouponController.deleteCoupon,
);

// NEXT CLOUD
// ==========
router.get("/files/list", optionalAuth, FileController.getTenantFiles);
router.get("/files/get", optionalAuth, FileController.getTenantFile);
router.post(
  "/files",
  AuthenticationController.isSignedIn,
  FileController.createTenantFile,
);

// WORKFLOW
// ========
// Protected
router.get(
  "/workflow/",
  AuthenticationController.isSignedIn,
  WorkflowController.getWorkflow,
);
router.post(
  "/workflow/",
  AuthenticationController.isSignedIn,
  WorkflowController.createWorkflow,
);
router.put(
  "/workflow/",
  AuthenticationController.isSignedIn,
  WorkflowController.updateWorkflow,
);
router.get(
  "/workflow/states",
  AuthenticationController.isSignedIn,
  WorkflowController.getWorkflowStates,
);
router.put(
  "/workflow/task",
  AuthenticationController.isSignedIn,
  WorkflowController.updateTask,
);
router.put(
  "/workflow/archive",
  AuthenticationController.isSignedIn,
  WorkflowController.archiveTask,
);
router.get(
  "/workflow/backlog",
  AuthenticationController.isSignedIn,
  WorkflowController.getBacklog,
);
// ROLES
// =====

// Protected
router.get(
  "/roles",
  AuthenticationController.isSignedIn,
  RoleController.getRoles,
);
router.get(
  "/roles/tenant",
  AuthenticationController.isSignedIn,
  RoleController.getUserRolesByTenant,
);
router.put(
  "/roles",
  AuthenticationController.isSignedIn,
  RoleController.storeRole,
);
router.get(
  "/roles/:id",
  AuthenticationController.isSignedIn,
  RoleController.getRole,
);
router.delete(
  "/roles/:id",
  AuthenticationController.isSignedIn,
  RoleController.removeRole,
);

// INVITATIONS
router.get(
  "/invitations",
  AuthenticationController.isSignedIn,
  InvitationController.getInvitationsByTenantID,
);

router.post(
  "/invitations",
  AuthenticationController.isSignedIn,
  InvitationController.createInvitation,
);

router.delete(
  "/invitations/:token",
  AuthenticationController.isSignedIn,
  InvitationController.deleteInvitation,
);

router.get(
  "/invitations/:token/verify",
  AuthenticationController.isSignedIn,
  InvitationController.verifyInvitationToken,
);
router.post(
  "/invitations/:token/accept",
  AuthenticationController.isSignedIn,
  InvitationController.acceptInvitationToken,
);

router.post(
  "/invitations/:token/reject",
  AuthenticationController.isSignedIn,
  InvitationController.rejectInvitationToken,
);

router.post(
  "/invitations/resend",
  AuthenticationController.isSignedIn,
  InvitationController.resendInvitation,
);

router.get(
  "/challenges",
  AuthenticationController.isSignedIn,
  TenantController.getChallenges,
);

router.post(
  "/challenges",
  AuthenticationController.isSignedIn,
  TenantController.createChallenge,
);

router.put(
  "/challenges",
  AuthenticationController.isSignedIn,
  TenantController.updateChallenge,
);

router.delete(
  "/challenges/:id",
  AuthenticationController.isSignedIn,
  TenantController.deleteChallenge,
);

router.post(
  "/invitations/approve",
  AuthenticationController.isSignedIn,
  InvitationController.approveManualChallenge,
);

router.post(
  "/invitations/reject",
  AuthenticationController.isSignedIn,
  InvitationController.rejectManualChallenge,
);

router.delete(
  "/invitations/user/:userId",
  AuthenticationController.isSignedIn,
  InvitationController.deleteUserInvitation,
);

router.use("/catalog", require("./routes/catalog.routes"));
router.use("/locker", require("./routes/locker.routes"));
router.use("/access", require("./routes/access.routes"));
router.use("/ical", require("./routes/ical.routes"));

module.exports = router;
