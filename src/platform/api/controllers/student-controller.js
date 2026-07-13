const bunyan = require("bunyan");
const StudentService = require("../../../commons/services/student/student-service");
const OfferBookmarkService = require("../../../commons/services/student/offer-bookmark-service");
const { sendError } = require("../../../commons/utilities/http-error");

const logger = bunyan.createLogger({
  name: "student-controller.js",
  level: process.env.LOG_LEVEL,
});

class StudentController {
  static async register(request, response) {
    try {
      const tenantId = request.params.tenant;
      const result = await StudentService.registerStudent(
        tenantId,
        request.body,
      );
      return response.status(201).send({ id: result.id });
    } catch (error) {
      logger.error("Could not register student", error);
      return sendError(response, error, "Could not register student");
    }
  }

  static async resendVerification(request, response) {
    try {
      const tenantId = request.params.tenant;
      await StudentService.resendVerification(
        tenantId,
        request.body && request.body.email,
        request.body && request.body.nextUrl,
      );
      return response.status(200).send({
        message:
          "If an unverified account exists for this email, a verification email has been sent.",
      });
    } catch (error) {
      logger.error("Could not resend student verification", error);
      return sendError(response, error, "Could not resend verification");
    }
  }

  static async getMe(request, response) {
    try {
      const profile = await StudentService.getStudentProfile(request.user.id);
      return response.status(200).send(profile);
    } catch (error) {
      logger.error("Could not load student profile", error);
      return sendError(response, error, "Could not load student profile");
    }
  }

  static async updateMe(request, response) {
    try {
      const profile = await StudentService.updateStudentProfile(
        request.user.id,
        request.body,
      );
      return response.status(200).send(profile);
    } catch (error) {
      logger.error("Could not update student profile", error);
      return sendError(response, error, "Could not update student profile");
    }
  }

  static async getBookmarks(request, response) {
    try {
      const bookmarks = await OfferBookmarkService.listBookmarks(
        request.params.tenant,
        request.user.id,
      );
      return response.status(200).send(bookmarks);
    } catch (error) {
      logger.error("Could not load bookmarks", error);
      return sendError(response, error, "Could not load bookmarks");
    }
  }

  static async addBookmark(request, response) {
    try {
      const result = await OfferBookmarkService.addBookmark(
        request.params.tenant,
        request.user.id,
        request.body && request.body.offerId,
      );
      return response.status(201).send(result);
    } catch (error) {
      logger.error("Could not add bookmark", error);
      return sendError(response, error, "Could not add bookmark");
    }
  }

  static async removeBookmark(request, response) {
    try {
      const result = await OfferBookmarkService.removeBookmark(
        request.params.tenant,
        request.user.id,
        request.params.offerId,
      );
      return response.status(200).send(result);
    } catch (error) {
      logger.error("Could not remove bookmark", error);
      return sendError(response, error, "Could not remove bookmark");
    }
  }

  static async deleteMe(request, response) {
    try {
      const result = await StudentService.deleteAccount(
        request.params.tenant,
        request.user.id,
        request.body && request.body.reason,
      );
      return response.status(200).send(result);
    } catch (error) {
      logger.error("Could not delete student account", error);
      return sendError(response, error, "Could not delete student account");
    }
  }
}

module.exports = StudentController;
