const mock = require("mock-require");
const { expect } = require("chai");
const sinon = require("sinon");

describe("CompanyController — authz & handlers", () => {
  let sandbox;
  let PermissionService;
  let CompanyMemberManager;
  let CompanyService;
  let CompanyManager;
  let NextcloudManager;
  let CompanyController;

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
    params: { tenant: "kielregion", id: "c1", ...(over.params || {}) },
    user: { id: "u1" },
    body: over.body || {},
    files: over.files || {},
    query: over.query || {},
  });

  const asAdmin = () => PermissionService._allowUpdateAny.resolves(true);
  const asOwnerOf = (cid) =>
    CompanyMemberManager.getMemberByUser.resolves({
      companyId: cid,
      isOwner: true,
    });
  const asMemberOf = (cid) =>
    CompanyMemberManager.getMemberByUser.resolves({
      companyId: cid,
      isOwner: false,
    });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    PermissionService = { _allowUpdateAny: sandbox.stub().resolves(false) };
    CompanyMemberManager = { getMemberByUser: sandbox.stub().resolves(null) };
    CompanyService = {
      updateCompanyProfile: sandbox.stub().resolves({ id: "c1" }),
      setCompanyLogo: sandbox.stub().resolves({ id: "c1" }),
      removeCompanyLogo: sandbox.stub().resolves({ id: "c1" }),
      getCompanyMedia: sandbox.stub().resolves([]),
      addCompanyMedia: sandbox.stub().resolves({ id: "m1" }),
      removeCompanyMedia: sandbox
        .stub()
        .resolves({ id: "m1", fileName: "public/media/x" }),
    };
    CompanyManager = {
      getCompany: sandbox
        .stub()
        .resolves({ id: "c1", status: "verified", logoUrl: "" }),
    };
    NextcloudManager = {
      createFile: sandbox.stub().resolves(),
      deleteFile: sandbox.stub().resolves(),
    };

    mock("../../src/commons/services/permission-service", PermissionService);
    mock(
      "../../src/commons/data-managers/company-member-manager",
      CompanyMemberManager,
    );
    mock("../../src/commons/services/company/company-service", CompanyService);
    mock("../../src/commons/data-managers/company-manager", CompanyManager);
    mock("../../src/commons/data-managers/file-manager", { NextcloudManager });

    CompanyController = mock.reRequire(
      "../../src/platform/api/controllers/company-controller",
    );
  });

  afterEach(() => {
    sandbox.restore();
    mock.stopAll();
  });

  describe("updateProfile — permission matrix", () => {
    it("owner of the company can edit (200)", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.updateProfile(req({ body: { name: "X" } }), r);
      expect(r.statusCode).to.equal(200);
      expect(CompanyService.updateCompanyProfile.calledOnce).to.equal(true);
    });

    it("tenant admin can edit (200)", async () => {
      asAdmin();
      const r = res();
      await CompanyController.updateProfile(req(), r);
      expect(r.statusCode).to.equal(200);
    });

    it("owner of ANOTHER company cannot edit this one (403)", async () => {
      asOwnerOf("other-company");
      const r = res();
      await CompanyController.updateProfile(req(), r);
      expect(r.statusCode).to.equal(403);
      expect(CompanyService.updateCompanyProfile.called).to.equal(false);
    });

    it("a non-owner member cannot edit (403)", async () => {
      asMemberOf("c1");
      const r = res();
      await CompanyController.updateProfile(req(), r);
      expect(r.statusCode).to.equal(403);
    });

    it("a stranger (no membership) cannot edit (403)", async () => {
      const r = res();
      await CompanyController.updateProfile(req(), r);
      expect(r.statusCode).to.equal(403);
    });

    it("surfaces a service validation error (400)", async () => {
      asAdmin();
      CompanyService.updateCompanyProfile.rejects({
        status: 400,
        message: "x",
      });
      const r = res();
      await CompanyController.updateProfile(req(), r);
      expect(r.statusCode).to.equal(400);
    });
  });

  describe("listMedia — member or admin may read", () => {
    it("a member (even non-owner) of the company can list (200)", async () => {
      asMemberOf("c1");
      const r = res();
      await CompanyController.listMedia(req(), r);
      expect(r.statusCode).to.equal(200);
    });

    it("a member of another company cannot (403)", async () => {
      asMemberOf("other-company");
      const r = res();
      await CompanyController.listMedia(req(), r);
      expect(r.statusCode).to.equal(403);
    });
  });

  describe("uploadLogo — authz + file validation", () => {
    it("cross-company owner is rejected before upload (403)", async () => {
      asOwnerOf("other-company");
      const r = res();
      await CompanyController.uploadLogo(
        req({ files: { file: { name: "l.png", data: Buffer.from("x") } } }),
        r,
      );
      expect(r.statusCode).to.equal(403);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });

    it("missing file is rejected (400)", async () => {
      asAdmin();
      const r = res();
      await CompanyController.uploadLogo(req({ files: {} }), r);
      expect(r.statusCode).to.equal(400);
    });

    it("path-traversal filename is rejected (400)", async () => {
      asAdmin();
      const r = res();
      await CompanyController.uploadLogo(
        req({
          files: { file: { name: "../evil.png", data: Buffer.from("x") } },
        }),
        r,
      );
      expect(r.statusCode).to.equal(400);
    });
  });

  describe("removeMedia — authz + file deletion", () => {
    it("cross-company owner is rejected (403)", async () => {
      asOwnerOf("other-company");
      const r = res();
      await CompanyController.removeMedia(
        req({ params: { mediaId: "m1" } }),
        r,
      );
      expect(r.statusCode).to.equal(403);
      expect(CompanyService.removeCompanyMedia.called).to.equal(false);
      expect(NextcloudManager.deleteFile.called).to.equal(false);
    });

    it("owner removes media (200) and deletes the file", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.removeMedia(
        req({ params: { mediaId: "m1" } }),
        r,
      );
      expect(r.statusCode).to.equal(200);
      expect(NextcloudManager.deleteFile.calledOnce).to.equal(true);
    });
  });

  describe("getPublicCompany", () => {
    it("verified company → 200 with media embedded", async () => {
      CompanyManager.getCompany.resolves({ id: "c1", status: "verified" });
      CompanyService.getCompanyMedia.resolves([
        { id: "m1", url: "http://x/m1.png", type: "image", created: 1 },
      ]);
      const r = res();
      await CompanyController.getPublicCompany(req(), r);
      expect(r.statusCode).to.equal(200);
      expect(r.body.media).to.have.length(1);
      expect(r.body.media[0]).to.have.property("url", "http://x/m1.png");
    });

    it("unverified company → 404", async () => {
      CompanyManager.getCompany.resolves({ id: "c1", status: "unverified" });
      const r = res();
      await CompanyController.getPublicCompany(req(), r);
      expect(r.statusCode).to.equal(404);
    });

    it("missing company → 404", async () => {
      CompanyManager.getCompany.resolves(null);
      const r = res();
      await CompanyController.getPublicCompany(req(), r);
      expect(r.statusCode).to.equal(404);
    });

    it("returns a public DTO without status/tenantId or internal media fileName", async () => {
      CompanyManager.getCompany.resolves({
        id: "c1",
        tenantId: "kielregion",
        name: "Muster GmbH",
        status: "verified",
        mail: "info@muster.de",
        logoUrl: "http://x/l.png",
        description: "hi",
      });
      CompanyService.getCompanyMedia.resolves([
        {
          id: "m1",
          tenantId: "kielregion",
          companyId: "c1",
          url: "http://x/m1.png",
          fileName: "public/media/secret.png",
          type: "image",
          created: 5,
        },
      ]);
      const r = res();
      await CompanyController.getPublicCompany(req(), r);
      expect(r.statusCode).to.equal(200);
      expect(r.body).to.not.have.property("status");
      expect(r.body).to.not.have.property("tenantId");
      expect(r.body.name).to.equal("Muster GmbH");
      expect(r.body.media).to.have.length(1);
      expect(r.body.media[0]).to.have.property("url", "http://x/m1.png");
      expect(r.body.media[0]).to.have.property("type", "image");
      expect(r.body.media[0]).to.have.property("created", 5);
      expect(r.body.media[0]).to.not.have.property("fileName");
      expect(r.body.media[0]).to.not.have.property("companyId");
      expect(r.body.media[0]).to.not.have.property("tenantId");
    });
  });

  describe("getMyContext — role detection for redirect", () => {
    it("tenant admin → role admin", async () => {
      asAdmin();
      const r = res();
      await CompanyController.getMyContext(req(), r);
      expect(r.statusCode).to.equal(200);
      expect(r.body).to.deep.equal({
        role: "admin",
        companyId: null,
        isOwner: false,
        branchId: "",
      });
    });

    it("admin who is ALSO a company member → admin wins", async () => {
      asAdmin();
      CompanyMemberManager.getMemberByUser.resolves({
        companyId: "c1",
        isOwner: true,
        branchId: "",
      });
      const r = res();
      await CompanyController.getMyContext(req(), r);
      expect(r.body.role).to.equal("admin");
      expect(r.body.companyId).to.equal(null);
    });

    it("company owner → role company_owner with companyId", async () => {
      CompanyMemberManager.getMemberByUser.resolves({
        companyId: "c1",
        isOwner: true,
        branchId: "",
      });
      const r = res();
      await CompanyController.getMyContext(req(), r);
      expect(r.body.role).to.equal("company_owner");
      expect(r.body.companyId).to.equal("c1");
      expect(r.body.isOwner).to.equal(true);
    });

    it("company member → role company_member with branch scope", async () => {
      CompanyMemberManager.getMemberByUser.resolves({
        companyId: "c1",
        isOwner: false,
        branchId: "b1",
      });
      const r = res();
      await CompanyController.getMyContext(req(), r);
      expect(r.body.role).to.equal("company_member");
      expect(r.body.isOwner).to.equal(false);
      expect(r.body.branchId).to.equal("b1");
    });

    it("no admin and no membership → role student", async () => {
      const r = res();
      await CompanyController.getMyContext(req(), r);
      expect(r.body).to.deep.equal({
        role: "student",
        companyId: null,
        isOwner: false,
        branchId: "",
      });
    });
  });

  describe("getCompany — authenticated detail (IDOR)", () => {
    it("missing company → 404", async () => {
      CompanyManager.getCompany.resolves(null);
      const r = res();
      await CompanyController.getCompany(req(), r);
      expect(r.statusCode).to.equal(404);
    });

    it("a stranger (no membership) → 403", async () => {
      const r = res();
      await CompanyController.getCompany(req(), r);
      expect(r.statusCode).to.equal(403);
    });

    it("a member of ANOTHER company → 403", async () => {
      asMemberOf("other-company");
      const r = res();
      await CompanyController.getCompany(req(), r);
      expect(r.statusCode).to.equal(403);
    });

    it("a member of this company → 200", async () => {
      asMemberOf("c1");
      const r = res();
      await CompanyController.getCompany(req(), r);
      expect(r.statusCode).to.equal(200);
    });

    it("a tenant admin (not a member) → 200", async () => {
      asAdmin();
      const r = res();
      await CompanyController.getCompany(req(), r);
      expect(r.statusCode).to.equal(200);
    });
  });

  describe("uploadLogo — happy path + content validation", () => {
    const imgFile = (over = {}) => ({
      file: {
        name: "logo.png",
        mimetype: "image/png",
        data: Buffer.from("x"),
        ...over,
      },
    });

    it("owner uploads → 200, file stored under public/logos, setCompanyLogo called", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.uploadLogo(req({ files: imgFile() }), r);
      expect(r.statusCode).to.equal(200);
      expect(NextcloudManager.createFile.calledOnce).to.equal(true);
      expect(NextcloudManager.createFile.firstCall.args[2]).to.equal(
        "c1-logo.png",
      );
      expect(NextcloudManager.createFile.firstCall.args[4]).to.equal(
        "public/logos",
      );
      expect(CompanyService.setCompanyLogo.calledOnce).to.equal(true);
    });

    it("deletes the previous logo file before storing the new one", async () => {
      asOwnerOf("c1");
      CompanyManager.getCompany.resolves({
        id: "c1",
        logoUrl:
          "http://x/api/kielregion/files/get?name=/public/logos/c1-old.png",
      });
      const r = res();
      await CompanyController.uploadLogo(req({ files: imgFile() }), r);
      expect(r.statusCode).to.equal(200);
      expect(
        NextcloudManager.deleteFile.calledWith(
          "kielregion",
          "/public/logos/c1-old.png",
        ),
      ).to.equal(true);
      expect(
        NextcloudManager.deleteFile.calledBefore(NextcloudManager.createFile),
      ).to.equal(true);
    });

    it("404 when the company does not exist", async () => {
      asAdmin();
      CompanyManager.getCompany.resolves(null);
      const r = res();
      await CompanyController.uploadLogo(req({ files: imgFile() }), r);
      expect(r.statusCode).to.equal(404);
    });

    it("non-image mimetype → 400 before upload", async () => {
      asAdmin();
      const r = res();
      await CompanyController.uploadLogo(
        req({ files: imgFile({ mimetype: "application/pdf" }) }),
        r,
      );
      expect(r.statusCode).to.equal(400);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });

    it("oversized image → 413 before upload", async () => {
      asAdmin();
      const r = res();
      await CompanyController.uploadLogo(
        req({ files: imgFile({ data: { length: 9 * 1024 * 1024 } }) }),
        r,
      );
      expect(r.statusCode).to.equal(413);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });
  });

  describe("uploadMedia", () => {
    const mediaFile = (over = {}) => ({
      file: {
        name: "shot.png",
        mimetype: "image/png",
        data: Buffer.from("x"),
        ...over,
      },
    });

    it("owner uploads an image → 201, stored under public/media, type image", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.uploadMedia(req({ files: mediaFile() }), r);
      expect(r.statusCode).to.equal(201);
      expect(NextcloudManager.createFile.firstCall.args[4]).to.equal(
        "public/media",
      );
      expect(CompanyService.addCompanyMedia.firstCall.args[2].type).to.equal(
        "image",
      );
    });

    it("a video mimetype → type video", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.uploadMedia(
        req({ files: mediaFile({ name: "clip.mp4", mimetype: "video/mp4" }) }),
        r,
      );
      expect(r.statusCode).to.equal(201);
      expect(CompanyService.addCompanyMedia.firstCall.args[2].type).to.equal(
        "video",
      );
    });

    it("cross-company owner → 403 before upload", async () => {
      asOwnerOf("other-company");
      const r = res();
      await CompanyController.uploadMedia(req({ files: mediaFile() }), r);
      expect(r.statusCode).to.equal(403);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });

    it("missing file → 400", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.uploadMedia(req({ files: {} }), r);
      expect(r.statusCode).to.equal(400);
    });

    it("a non-image/non-video mimetype → 400", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.uploadMedia(
        req({ files: mediaFile({ mimetype: "application/zip" }) }),
        r,
      );
      expect(r.statusCode).to.equal(400);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });

    it("an oversized video → 413", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.uploadMedia(
        req({
          files: mediaFile({
            name: "clip.mp4",
            mimetype: "video/mp4",
            data: { length: 200 * 1024 * 1024 },
          }),
        }),
        r,
      );
      expect(r.statusCode).to.equal(413);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });

    it("an oversized image → 413", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.uploadMedia(
        req({ files: mediaFile({ data: { length: 9 * 1024 * 1024 } }) }),
        r,
      );
      expect(r.statusCode).to.equal(413);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });

    it("404 (no file written) when the company does not exist", async () => {
      asAdmin();
      CompanyManager.getCompany.resolves(null);
      const r = res();
      await CompanyController.uploadMedia(req({ files: mediaFile() }), r);
      expect(r.statusCode).to.equal(404);
      expect(NextcloudManager.createFile.called).to.equal(false);
    });
  });

  describe("removeLogo", () => {
    it("owner removes the logo → 200, deletes the file and clears the url", async () => {
      asOwnerOf("c1");
      CompanyManager.getCompany.resolves({
        id: "c1",
        logoUrl:
          "http://x/api/kielregion/files/get?name=/public/logos/c1-logo.png",
      });
      const r = res();
      await CompanyController.removeLogo(req(), r);
      expect(r.statusCode).to.equal(200);
      expect(
        NextcloudManager.deleteFile.calledWith(
          "kielregion",
          "/public/logos/c1-logo.png",
        ),
      ).to.equal(true);
      expect(CompanyService.removeCompanyLogo.calledOnce).to.equal(true);
    });

    it("404 when the company does not exist", async () => {
      asAdmin();
      CompanyManager.getCompany.resolves(null);
      const r = res();
      await CompanyController.removeLogo(req(), r);
      expect(r.statusCode).to.equal(404);
    });

    it("cross-company owner → 403", async () => {
      asOwnerOf("other-company");
      const r = res();
      await CompanyController.removeLogo(req(), r);
      expect(r.statusCode).to.equal(403);
    });
  });

  describe("removeMedia — file deletion details", () => {
    it("deletes the exact stored fileName", async () => {
      asOwnerOf("c1");
      const r = res();
      await CompanyController.removeMedia(
        req({ params: { mediaId: "m1" } }),
        r,
      );
      expect(
        NextcloudManager.deleteFile.calledWith("kielregion", "public/media/x"),
      ).to.equal(true);
    });

    it("still returns 200 when the Nextcloud delete fails", async () => {
      asOwnerOf("c1");
      NextcloudManager.deleteFile.rejects(new Error("boom"));
      const r = res();
      await CompanyController.removeMedia(
        req({ params: { mediaId: "m1" } }),
        r,
      );
      expect(r.statusCode).to.equal(200);
      expect(r.body).to.deep.equal({ id: "m1" });
    });

    it("skips the delete when the media has no fileName", async () => {
      asOwnerOf("c1");
      CompanyService.removeCompanyMedia.resolves({ id: "m1", fileName: "" });
      const r = res();
      await CompanyController.removeMedia(
        req({ params: { mediaId: "m1" } }),
        r,
      );
      expect(r.statusCode).to.equal(200);
      expect(NextcloudManager.deleteFile.called).to.equal(false);
    });
  });

  describe("listMedia — body + admin", () => {
    it("admin lists media → 200 with the array body", async () => {
      asAdmin();
      CompanyService.getCompanyMedia.resolves([{ id: "m1" }, { id: "m2" }]);
      const r = res();
      await CompanyController.listMedia(req(), r);
      expect(r.statusCode).to.equal(200);
      expect(r.body).to.have.length(2);
    });
  });
});
