const mock = require("mock-require");
const { expect } = require("chai");
const sinon = require("sinon");
const {
  renderSnippet,
} = require("../../src/commons/mail-service/templates/template-loader");

describe("Member invitation email", () => {
  describe("member-invitation snippet", () => {
    it("renders non-empty HTML with the company name, the button and a RAW token URL", () => {
      const html = renderSnippet("member-invitation", {
        companyName: "Muster GmbH",
        invitationUrl: "https://app.kielregion.de/einladung?token=abc123",
      });
      expect(html).to.be.a("string").with.length.greaterThan(0);
      expect(html).to.contain("Muster GmbH");
      expect(html).to.contain("Einladung annehmen");
      expect(html).to.contain(
        'href="https://app.kielregion.de/einladung?token=abc123"',
      );
      // regression guard: the "=" must stay raw, not be HTML-escaped to &#x3D;
      expect(html).to.not.contain("&#x3D;");
    });
  });

  describe("MailController.sendMemberInvitation", () => {
    let sandbox;
    let MailerService;
    let InstanceManager;
    let MailController;
    let originalFrontendUrl;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = "https://app.kielregion.de";
      MailerService = { send: sandbox.stub().resolves() };
      InstanceManager = {
        getInstance: sandbox
          .stub()
          .resolves({ mailTemplate: "INSTANCE_TEMPLATE" }),
      };
      mock("../../src/commons/mail-service/mail-service", MailerService);
      mock("../../src/commons/data-managers/instance-manager", InstanceManager);
      MailController = mock.reRequire(
        "../../src/commons/mail-service/mail-controller",
      );
    });

    afterEach(() => {
      sandbox.restore();
      mock.stopAll();
      process.env.FRONTEND_URL = originalFrontendUrl;
    });

    it("sends a real HTML body via the INSTANCE template (not the empty tenant template)", async () => {
      await MailController.sendMemberInvitation({
        sendTo: "neu@team.de",
        companyName: "Muster GmbH",
        token: "abc123",
      });
      expect(MailerService.send.calledOnce).to.equal(true);
      const arg = MailerService.send.firstCall.args[0];
      expect(arg.address).to.equal("neu@team.de");
      expect(arg.mailTemplate).to.equal("INSTANCE_TEMPLATE");
      expect(arg.subject).to.contain("Muster GmbH");
      expect(arg.model.content).to.contain("Muster GmbH");
      expect(arg.model.content).to.contain("/einladung?token=abc123");
      expect(arg.model.content).to.not.contain("&#x3D;");
    });
  });
});
