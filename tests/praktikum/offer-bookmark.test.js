const mock = require("mock-require");
const { expect } = require("chai");
const sinon = require("sinon");

describe("OfferBookmarkService", () => {
  let sandbox;
  let OfferBookmarkManager;
  let OfferManager;
  let OfferService;
  let Service;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    OfferBookmarkManager = {
      getByUser: sandbox.stub().resolves([]),
      add: sandbox.stub().resolves(),
      remove: sandbox.stub().resolves(),
    };
    OfferManager = { getOffer: sandbox.stub().resolves(null) };
    OfferService = { getPublicOffersByIds: sandbox.stub().resolves([]) };
    mock(
      "../../src/commons/data-managers/offer-bookmark-manager",
      OfferBookmarkManager,
    );
    mock("../../src/commons/data-managers/offer-manager", OfferManager);
    mock("../../src/commons/services/company/offer-service", OfferService);
    Service = mock.reRequire(
      "../../src/commons/services/student/offer-bookmark-service",
    );
  });

  afterEach(() => {
    sandbox.restore();
    mock.stopAll();
  });

  const reject = async (fn) => {
    let err;
    try {
      await fn();
    } catch (e) {
      err = e;
    }
    return err;
  };

  it("listBookmarks hydrates available offers and flags unavailable ones", async () => {
    OfferBookmarkManager.getByUser.resolves([
      { offerId: "o1", created: 200 },
      { offerId: "o2", created: 100 },
    ]);
    OfferService.getPublicOffersByIds.resolves([
      { id: "o1", title: "Praktikum A", status: "Online" },
    ]);
    const list = await Service.listBookmarks("kielregion", "u@x.de");
    expect(
      OfferBookmarkManager.getByUser.calledWith("kielregion", "u@x.de"),
    ).to.equal(true);
    expect(list).to.have.length(2);
    expect(list[0]).to.deep.equal({
      offerId: "o1",
      savedAt: 200,
      available: true,
      offer: { id: "o1", title: "Praktikum A", status: "Online" },
    });
    expect(list[1]).to.deep.equal({
      offerId: "o2",
      savedAt: 100,
      available: false,
      offer: null,
    });
  });

  it("addBookmark adds an Online offer (idempotent via the manager)", async () => {
    OfferManager.getOffer.resolves({ id: "o1", status: "Online" });
    const res = await Service.addBookmark("kielregion", "u@x.de", "o1");
    expect(
      OfferBookmarkManager.add.calledWith("kielregion", "u@x.de", "o1"),
    ).to.equal(true);
    expect(res).to.deep.equal({ offerId: "o1" });
  });

  it("addBookmark → 404 when the offer is unknown or not Online", async () => {
    OfferManager.getOffer.resolves(null);
    expect(
      (await reject(() => Service.addBookmark("kg", "u@x.de", "o1"))).status,
    ).to.equal(404);
    OfferManager.getOffer.resolves({ id: "o2", status: "Archiv" });
    expect(
      (await reject(() => Service.addBookmark("kg", "u@x.de", "o2"))).status,
    ).to.equal(404);
    expect(OfferBookmarkManager.add.called).to.equal(false);
  });

  it("addBookmark → 400 when offerId is missing", async () => {
    expect(
      (await reject(() => Service.addBookmark("kg", "u@x.de", ""))).status,
    ).to.equal(400);
  });

  it("addBookmark coerces a non-string offerId (no NoSQL injection)", async () => {
    const err = await reject(() =>
      Service.addBookmark("kg", "u@x.de", { $ne: null }),
    );
    expect(err.status).to.equal(404);
    expect(OfferManager.getOffer.firstCall.args[1]).to.be.a("string");
  });

  it("removeBookmark removes the user's bookmark", async () => {
    const res = await Service.removeBookmark("kielregion", "u@x.de", "o1");
    expect(
      OfferBookmarkManager.remove.calledWith("kielregion", "u@x.de", "o1"),
    ).to.equal(true);
    expect(res).to.deep.equal({ removed: "o1" });
  });
});

describe("StudentController — bookmarks", () => {
  let sandbox;
  let OfferBookmarkService;
  let StudentController;

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
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    OfferBookmarkService = {
      listBookmarks: sandbox.stub().resolves([]),
      addBookmark: sandbox.stub().resolves({ offerId: "o1" }),
      removeBookmark: sandbox.stub().resolves({ removed: "o1" }),
    };
    mock(
      "../../src/commons/services/student/offer-bookmark-service",
      OfferBookmarkService,
    );
    mock("../../src/commons/services/student/student-service", {});
    StudentController = mock.reRequire(
      "../../src/platform/api/controllers/student-controller",
    );
  });

  afterEach(() => {
    sandbox.restore();
    mock.stopAll();
  });

  it("getBookmarks returns 200 for the acting user", async () => {
    const r = res();
    await StudentController.getBookmarks(
      { params: { tenant: "kielregion" }, user: { id: "u@x.de" } },
      r,
    );
    expect(r.statusCode).to.equal(200);
    expect(
      OfferBookmarkService.listBookmarks.calledWith("kielregion", "u@x.de"),
    ).to.equal(true);
  });

  it("addBookmark returns 201 with the JWT user id", async () => {
    const r = res();
    await StudentController.addBookmark(
      {
        params: { tenant: "kielregion" },
        user: { id: "u@x.de" },
        body: { offerId: "o1" },
      },
      r,
    );
    expect(r.statusCode).to.equal(201);
    expect(
      OfferBookmarkService.addBookmark.calledWith("kielregion", "u@x.de", "o1"),
    ).to.equal(true);
  });

  it("removeBookmark returns 200 using the JWT user id + path offerId", async () => {
    const r = res();
    await StudentController.removeBookmark(
      {
        params: { tenant: "kielregion", offerId: "o1" },
        user: { id: "u@x.de" },
      },
      r,
    );
    expect(r.statusCode).to.equal(200);
    expect(
      OfferBookmarkService.removeBookmark.calledWith(
        "kielregion",
        "u@x.de",
        "o1",
      ),
    ).to.equal(true);
  });

  it("maps a service error to its status", async () => {
    OfferBookmarkService.addBookmark.rejects({
      message: "Offer not found",
      status: 404,
    });
    const r = res();
    await StudentController.addBookmark(
      { params: { tenant: "kielregion" }, user: { id: "u@x.de" }, body: {} },
      r,
    );
    expect(r.statusCode).to.equal(404);
  });
});
