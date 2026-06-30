const mock = require("mock-require");
const { expect } = require("chai");
const sinon = require("sinon");

describe("OfferController", () => {
  let sandbox;
  let CompanyController;
  let OfferService;
  let OfferManager;
  let NextcloudManager;
  let OfferController;

  const res = () => ({
    statusCode: null,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
    sendStatus(c) {
      this.statusCode = c;
      return this;
    },
  });
  const req = (over = {}) => ({
    params: { tenant: "kg", id: "c1", offerId: "o1", mediaId: "m1" },
    query: {},
    body: {},
    user: { id: "u1" },
    ...over,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    CompanyController = {
      isMemberOrAdmin: sandbox.stub().resolves(true),
      canEditBranch: sandbox.stub().resolves(true),
      isTenantAdmin: sandbox.stub().resolves(true),
    };
    OfferService = {
      getCompanyOffers: sandbox.stub().resolves([]),
      getCompanyOffer: sandbox.stub().resolves({ id: "o1" }),
      createOffer: sandbox.stub().resolves({ id: "o1" }),
      updateOffer: sandbox.stub().resolves({ id: "o1" }),
      deleteOffer: sandbox.stub().resolves({ removed: "o1" }),
      searchPublicOffers: sandbox.stub().resolves([]),
      getPublicOffer: sandbox.stub().resolves({ id: "o1" }),
      listForModeration: sandbox.stub().resolves([]),
      approveOffer: sandbox.stub().resolves({ id: "o1" }),
      rejectOffer: sandbox.stub().resolves({ id: "o1" }),
      deactivateOffer: sandbox.stub().resolves({ id: "o1" }),
      listOfferMedia: sandbox.stub().resolves([]),
      addOfferMedia: sandbox.stub().resolves({ id: "m1" }),
      removeOfferMedia: sandbox.stub().resolves({
        id: "m1",
        url: "http://x/api/kg/files/get?name=/public/offer-media/f",
      }),
    };
    OfferManager = {
      getOffer: sandbox
        .stub()
        .resolves({ id: "o1", companyId: "c1", branchId: "b1" }),
    };
    NextcloudManager = {
      createFile: sandbox.stub().resolves(),
      deleteFile: sandbox.stub().resolves(),
    };

    mock(
      "../../src/platform/api/controllers/company-controller",
      CompanyController,
    );
    mock("../../src/commons/services/company/offer-service", OfferService);
    mock("../../src/commons/data-managers/offer-manager", OfferManager);
    mock("../../src/commons/data-managers/file-manager", { NextcloudManager });
    OfferController = mock.reRequire(
      "../../src/platform/api/controllers/offer-controller",
    );
  });

  afterEach(() => {
    sandbox.restore();
    mock.stopAll();
  });

  describe("authorization", () => {
    it("listOffers -> 403 for a non-member/non-admin", async () => {
      CompanyController.isMemberOrAdmin.resolves(false);
      const r = res();
      await OfferController.listOffers(req(), r);
      expect(r.statusCode).to.equal(403);
      expect(OfferService.getCompanyOffers.called).to.equal(false);
    });

    it("listOffers -> 200 for a member", async () => {
      const r = res();
      await OfferController.listOffers(req(), r);
      expect(r.statusCode).to.equal(200);
    });

    it("createOffer -> 403 without branch edit rights", async () => {
      CompanyController.canEditBranch.resolves(false);
      const r = res();
      await OfferController.createOffer(req({ body: { branchId: "b1" } }), r);
      expect(r.statusCode).to.equal(403);
      expect(OfferService.createOffer.called).to.equal(false);
    });

    it("createOffer -> 201 and forwards the body", async () => {
      const r = res();
      await OfferController.createOffer(req({ body: { title: "X" } }), r);
      expect(r.statusCode).to.equal(201);
      expect(OfferService.createOffer.calledWith("kg", "c1")).to.equal(true);
    });

    it("updateOffer -> 404 when the offer doesn't exist", async () => {
      OfferManager.getOffer.resolves(null);
      const r = res();
      await OfferController.updateOffer(req(), r);
      expect(r.statusCode).to.equal(404);
    });

    it("updateOffer -> 404 when the offer belongs to another company", async () => {
      OfferManager.getOffer.resolves({ id: "o1", companyId: "other" });
      const r = res();
      await OfferController.updateOffer(req(), r);
      expect(r.statusCode).to.equal(404);
    });

    it("updateOffer -> 403 without branch edit rights", async () => {
      CompanyController.canEditBranch.resolves(false);
      const r = res();
      await OfferController.updateOffer(req(), r);
      expect(r.statusCode).to.equal(403);
      expect(OfferService.updateOffer.called).to.equal(false);
    });

    it("listModeration -> 403 for a non-admin", async () => {
      CompanyController.isTenantAdmin.resolves(false);
      const r = res();
      await OfferController.listModeration(req(), r);
      expect(r.statusCode).to.equal(403);
    });

    it("approveOffer -> 403 for a non-admin, 200 for an admin", async () => {
      CompanyController.isTenantAdmin.resolves(false);
      const r1 = res();
      await OfferController.approveOffer(req(), r1);
      expect(r1.statusCode).to.equal(403);
      CompanyController.isTenantAdmin.resolves(true);
      const r2 = res();
      await OfferController.approveOffer(req(), r2);
      expect(r2.statusCode).to.equal(200);
    });
  });

  describe("searchOffers query coercion", () => {
    it("coerces filters to strings and builds a geo radius (km -> m)", async () => {
      const r = res();
      await OfferController.searchOffers(
        req({
          query: {
            industryId: "industry-it",
            city: "Kiel",
            q: "foo",
            age: "16",
            lat: "54.3",
            lng: "10.1",
            radius: "30",
          },
        }),
        r,
      );
      expect(r.statusCode).to.equal(200);
      const f = OfferService.searchPublicOffers.firstCall.args[1];
      expect(f.industryId).to.equal("industry-it");
      expect(f.city).to.equal("Kiel");
      expect(f.minAge).to.equal(16);
      expect(f.lat).to.equal(54.3);
      expect(f.lng).to.equal(10.1);
      expect(f.radiusMeters).to.equal(30000);
    });

    it("drops geo when radius is missing", async () => {
      const r = res();
      await OfferController.searchOffers(
        req({ query: { lat: "54.3", lng: "10.1" } }),
        r,
      );
      const f = OfferService.searchPublicOffers.firstCall.args[1];
      expect(f.lat).to.equal(undefined);
      expect(f.radiusMeters).to.equal(undefined);
    });

    it("stringifies an operator-injection attempt ($ne) instead of passing the object", async () => {
      const r = res();
      await OfferController.searchOffers(
        req({ query: { industryId: { $ne: null } } }),
        r,
      );
      const f = OfferService.searchPublicOffers.firstCall.args[1];
      expect(f.industryId).to.be.a("string");
    });
  });

  describe("media upload validation", () => {
    it("400 when no file is attached", async () => {
      const r = res();
      await OfferController.uploadMedia(req({ files: undefined }), r);
      expect(r.statusCode).to.equal(400);
    });

    it("400 for a non-image/non-video file", async () => {
      const r = res();
      await OfferController.uploadMedia(
        req({
          files: {
            file: {
              name: "x.txt",
              mimetype: "text/plain",
              data: Buffer.from("x"),
            },
          },
        }),
        r,
      );
      expect(r.statusCode).to.equal(400);
    });

    it("413 for an oversize image", async () => {
      const r = res();
      await OfferController.uploadMedia(
        req({
          files: {
            file: {
              name: "big.png",
              mimetype: "image/png",
              data: { length: 9 * 1024 * 1024 },
            },
          },
        }),
        r,
      );
      expect(r.statusCode).to.equal(413);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });

    it("201 happy path stores the file and the media row", async () => {
      const r = res();
      await OfferController.uploadMedia(
        req({
          files: {
            file: {
              name: "logo.png",
              mimetype: "image/png",
              data: Buffer.from("abc"),
            },
          },
        }),
        r,
      );
      expect(r.statusCode).to.equal(201);
      expect(NextcloudManager.createFile.calledOnce).to.equal(true);
      expect(OfferService.addOfferMedia.calledOnce).to.equal(true);
    });
  });

  describe("Nextcloud file cleanup", () => {
    it("removeMedia deletes the underlying file (name parsed from the url)", async () => {
      const r = res();
      await OfferController.removeMedia(req(), r);
      expect(r.statusCode).to.equal(200);
      expect(
        NextcloudManager.deleteFile.calledWith("kg", "/public/offer-media/f"),
      ).to.equal(true);
    });

    it("deleteOffer deletes every media file then the offer", async () => {
      OfferService.listOfferMedia.resolves([
        { url: "http://x/api/kg/files/get?name=/public/offer-media/a" },
        { url: "http://x/api/kg/files/get?name=/public/offer-media/b" },
      ]);
      const r = res();
      await OfferController.deleteOffer(req(), r);
      expect(r.statusCode).to.equal(200);
      expect(NextcloudManager.deleteFile.callCount).to.equal(2);
      expect(OfferService.deleteOffer.calledOnce).to.equal(true);
    });
  });
});
