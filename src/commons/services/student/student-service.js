const { User, USER_HOOK_TYPES } = require("../../entities/user/user");
const UserManager = require("../../data-managers/user-manager");
const UserService = require("../user-service");
const TenantManager = require("../../data-managers/tenant-manager");
const StudentManager = require("../../data-managers/student-manager");
const OfferBookmarkManager = require("../../data-managers/offer-bookmark-manager");
const MembershipManager = require("../../data-managers/membership-manager");
const JwtHelper = require("../../utilities/jwt-helper");
const AccountDeletionService = require("../account-deletion-service");
const ApplicationService = require("./application-service");
const { isEmail } = require("validator");

const TARGET_GROUPS = ["pupil", "student", "career_changer"];
const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000;
const lastVerificationResend = new Map();

function isValidBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getTime() <= Date.now()
  );
}

function toProfileDto(user, student) {
  return {
    email: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    street: user.address,
    postalCode: user.zipCode,
    city: user.city,
    phone: user.phone,
    birthDate: student ? student.birthDate : "",
    school: student ? student.school : "",
    grade: student ? student.grade : "",
    targetGroups: student ? student.targetGroups : [],
  };
}

class StudentService {
  static async registerStudent(tenantId, payload) {
    const data = payload || {};
    const consents = data.consents || {};

    const email = String(data.email || "")
      .trim()
      .toLowerCase();
    const password = String(data.password || "");
    const firstName = String(data.firstName || "").trim();
    const lastName = String(data.lastName || "").trim();
    const street = String(data.street || "").trim();
    const postalCode = String(data.postalCode || "").trim();
    const city = String(data.city || "").trim();
    const phone = String(data.phone || "").trim();
    const school = String(data.school || "").trim();
    const grade = String(data.grade || "").trim();
    const birthDate = String(data.birthDate || "").trim();
    const targetGroups = Array.isArray(data.targetGroups)
      ? data.targetGroups.map((t) => String(t).trim()).filter(Boolean)
      : [];
    const hasLetter = (value) => /[A-Za-zÀ-ÿ]/.test(value);

    if (!isEmail(email)) {
      throw { message: "A valid email address is required", status: 400 };
    }
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw {
        message:
          "Password must be at least 8 characters and include a letter and a number",
        status: 400,
      };
    }
    if (
      firstName.length < 2 ||
      !hasLetter(firstName) ||
      lastName.length < 2 ||
      !hasLetter(lastName)
    ) {
      throw {
        message: "A valid first and last name are required",
        status: 400,
      };
    }
    if (street.length < 2 || !hasLetter(street)) {
      throw { message: "A valid street is required", status: 400 };
    }
    if (!/^\d{5}$/.test(postalCode)) {
      throw { message: "Postal code must be 5 digits", status: 400 };
    }
    if (city.length < 2 || !hasLetter(city)) {
      throw { message: "A valid city is required", status: 400 };
    }
    if (phone.replace(/\D/g, "").length < 6) {
      throw { message: "A valid phone number is required", status: 400 };
    }
    if (!isValidBirthDate(birthDate)) {
      throw { message: "A valid birth date is required", status: 400 };
    }
    if (
      targetGroups.length === 0 ||
      !targetGroups.every((t) => TARGET_GROUPS.includes(t))
    ) {
      throw {
        message: "At least one valid target group is required",
        status: 400,
      };
    }
    if (!consents.privacyConsent || !consents.consent) {
      throw { message: "All consents are required", status: 400 };
    }

    const tenant = await TenantManager.getTenant(tenantId);
    if (!tenant) {
      throw { message: "Tenant not found", status: 404 };
    }

    const existingUser = await UserManager.getUserBy({ id: email });
    if (existingUser) {
      throw { message: "Email already in use", status: 409 };
    }

    const user = new User({
      id: email,
      firstName,
      lastName,
      phone,
      address: street,
      zipCode: postalCode,
      city,
    });
    user.setPassword(password);
    try {
      await UserService.singUpUser(user, data.nextUrl);
      await StudentManager.storeStudent({
        userId: email,
        birthDate,
        school,
        grade,
        targetGroups,
      });
    } catch (err) {
      await StudentManager.removeStudent(email).catch(() => {});
      await UserManager.deleteUser(email).catch(() => {});
      throw err;
    }

    return { id: user.id };
  }

  static async resendVerification(tenantId, email, nextUrl) {
    const normalized = String(email || "")
      .trim()
      .toLowerCase();
    if (!normalized) {
      throw { message: "Missing email", status: 400 };
    }

    const throttleKey = `${tenantId}:${normalized}`;
    const now = Date.now();
    const lastSent = lastVerificationResend.get(throttleKey);
    if (lastSent && now - lastSent < RESEND_VERIFICATION_COOLDOWN_MS) {
      const retryAfter = Math.ceil(
        (RESEND_VERIFICATION_COOLDOWN_MS - (now - lastSent)) / 1000,
      );
      throw {
        message: `Please wait ${retryAfter}s before requesting another verification email`,
        status: 429,
      };
    }

    // Arm the cooldown for every valid-email request before any existence check
    // so a real unverified account and a non-existent one throttle identically
    // and cannot be told apart on a second call. The key self-evicts after the
    // window so the map stays bounded.
    lastVerificationResend.set(throttleKey, now);
    setTimeout(
      () => lastVerificationResend.delete(throttleKey),
      RESEND_VERIFICATION_COOLDOWN_MS,
    ).unref();

    const student = await StudentManager.getStudentByUser(normalized);
    if (!student) {
      return;
    }

    const user = await UserManager.getUserBy({ id: normalized }, true);
    if (!user || user.isVerified) {
      return;
    }

    const hook = user.addHook(USER_HOOK_TYPES.VERIFY, { nextUrl });
    await UserManager.updateUser(user);

    const MailController = require("../../mail-service/mail-controller");
    await MailController.sendVerificationRequest(user.id, hook.id);
  }

  static async getStudentProfile(userId) {
    const user = await UserManager.getUserBy({ id: userId }, false);
    if (!user) {
      throw { message: "User not found", status: 404 };
    }
    const student = await StudentManager.getStudentByUser(userId);
    return toProfileDto(user, student);
  }

  static async updateStudentProfile(userId, payload) {
    const data = payload || {};
    const firstName = String(data.firstName || "").trim();
    const lastName = String(data.lastName || "").trim();
    const street = String(data.street || "").trim();
    const postalCode = String(data.postalCode || "").trim();
    const city = String(data.city || "").trim();
    const phone = String(data.phone || "").trim();
    const school = String(data.school || "").trim();
    const grade = String(data.grade || "").trim();
    const birthDate = String(data.birthDate || "").trim();
    const targetGroups = Array.isArray(data.targetGroups)
      ? data.targetGroups.map((t) => String(t).trim()).filter(Boolean)
      : [];
    const hasLetter = (value) => /[A-Za-zÀ-ÿ]/.test(value);

    if (
      firstName.length < 2 ||
      !hasLetter(firstName) ||
      lastName.length < 2 ||
      !hasLetter(lastName)
    ) {
      throw {
        message: "A valid first and last name are required",
        status: 400,
      };
    }
    if (street.length < 2 || !hasLetter(street)) {
      throw { message: "A valid street is required", status: 400 };
    }
    if (!/^\d{5}$/.test(postalCode)) {
      throw { message: "Postal code must be 5 digits", status: 400 };
    }
    if (city.length < 2 || !hasLetter(city)) {
      throw { message: "A valid city is required", status: 400 };
    }
    if (phone.replace(/\D/g, "").length < 6) {
      throw { message: "A valid phone number is required", status: 400 };
    }
    if (!isValidBirthDate(birthDate)) {
      throw { message: "A valid birth date is required", status: 400 };
    }
    if (
      targetGroups.length === 0 ||
      !targetGroups.every((t) => TARGET_GROUPS.includes(t))
    ) {
      throw {
        message: "At least one valid target group is required",
        status: 400,
      };
    }

    const user = await UserManager.getUserBy({ id: userId }, true);
    if (!user) {
      throw { message: "User not found", status: 404 };
    }
    const existing = await StudentManager.getStudentByUser(userId);
    if (!existing) {
      throw { message: "Student profile not found", status: 404 };
    }
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    user.address = street;
    user.zipCode = postalCode;
    user.city = city;
    await UserManager.updateUser(user);

    await StudentManager.storeStudent({
      userId,
      birthDate,
      targetGroups,
      school,
      grade,
      created: existing.created,
    });

    return StudentService.getStudentProfile(userId);
  }

  static async deleteAccount(tenantId, userId, reason) {
    const student = await StudentManager.getStudentByUser(userId);
    if (!student) {
      throw { message: "Student not found", status: 404 };
    }
    const reasonId = await AccountDeletionService.assertValidReason(
      tenantId,
      "student",
      reason,
    );
    await OfferBookmarkManager.removeByUser(userId);
    await ApplicationService.deleteByStudent(userId);
    await StudentManager.removeStudent(userId);
    // Count only once the student is actually gone; a retry now hits the 404
    // guard above and cannot double-count.
    await AccountDeletionService.increment(tenantId, "student", reasonId);
    await MembershipManager.removeMembership(tenantId, userId);
    await JwtHelper.revokeAllUserTokens(userId, "account_deleted");
    const remaining = await MembershipManager.getMembershipsByUserID(userId);
    if (!remaining || remaining.length === 0) {
      await UserManager.deleteUser(userId);
    }
    return { deleted: userId };
  }
}

module.exports = StudentService;
