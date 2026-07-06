const OfferBookmarkManager = require("../../data-managers/offer-bookmark-manager");
const OfferManager = require("../../data-managers/offer-manager");
const OfferService = require("../company/offer-service");

class OfferBookmarkService {
  static async listBookmarks(tenantId, userId) {
    const bookmarks = await OfferBookmarkManager.getByUser(tenantId, userId);
    const offers = await OfferService.getPublicOffersByIds(
      tenantId,
      bookmarks.map((b) => b.offerId),
    );
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    return bookmarks.map((bookmark) => {
      const offer = byId.get(bookmark.offerId) || null;
      return {
        offerId: bookmark.offerId,
        savedAt: bookmark.created,
        available: offer !== null,
        offer,
      };
    });
  }

  static async addBookmark(tenantId, userId, offerId) {
    const id = String(offerId || "").trim();
    if (!id) {
      throw { message: "offerId is required", status: 400 };
    }
    const offer = await OfferManager.getOffer(tenantId, id);
    if (!offer || offer.status !== "Online") {
      throw { message: "Offer not found", status: 404 };
    }
    await OfferBookmarkManager.add(tenantId, userId, id);
    return { offerId: id };
  }

  static async removeBookmark(tenantId, userId, offerId) {
    const id = String(offerId || "").trim();
    await OfferBookmarkManager.remove(tenantId, userId, id);
    return { removed: id };
  }
}

module.exports = OfferBookmarkService;
