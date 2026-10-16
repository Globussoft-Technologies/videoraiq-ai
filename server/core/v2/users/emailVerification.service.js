import EmailVerification from "./emailVerification.model.js";
import authorizedUsersModel from "./users.model.js";
import mailHelper from "../../../mailService/mail.helper.js";
import { generateToken } from "../../../utils/cryptoUtils.js";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import { emitUserEmailVerified } from "../../../socket.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_TTL_MS = 10 * 60 * 1000; // the mailed link, same as alert recipients
const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000; // a verified address stays usable this long
const RESEND_GAP_MS = 30 * 1000; // ponytail: per-address throttle; add a real rate limiter if abused

const normalize = (email) => String(email || "").trim().toLowerCase();

/** True when `email` was verified for this admin recently enough to save a user with it. */
export const isEmailVerified = async (adminId, email) =>
  Boolean(await EmailVerification.exists({
    adminId,
    email: normalize(email),
    verifiedAt: { $gte: new Date(Date.now() - VERIFIED_TTL_MS) },
  }));

/** Drop the verification once a user has been saved with the address. */
export const consumeEmailVerification = (adminId, email) =>
  EmailVerification.deleteOne({ adminId, email: normalize(email) }).catch((e) => logger.error(e));

class EmailVerificationService {
  // Admin asks to verify an address: mail it a link. POST { email }.
  async send(req, res) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      const email = normalize(req.body?.email);
      if (!adminId) return res.send(Response.userFailResp("User authentication failed.", "Unauthorized"));
      if (!EMAIL_RE.test(email)) return res.send(Response.validationFailResp("Enter a valid email address", "Validation Failed!"));

      const existingUser = await authorizedUsersModel.exists({
        adminId,
        email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        ...(req.body?.userId ? { _id: { $ne: req.body.userId } } : {}),
      });
      if (existingUser) return res.send(Response.userFailResp(`An authorized user with the email ${email} already exists.`));

      const current = await EmailVerification.findOne({ adminId, email }).lean();
      if (current?.verifiedAt && current.verifiedAt >= new Date(Date.now() - VERIFIED_TTL_MS)) {
        return res.send(Response.userSuccessResp("Email already verified", { id: String(current._id), verified: true }));
      }
      if (current?.updatedAt && Date.now() - new Date(current.updatedAt).getTime() < RESEND_GAP_MS) {
        return res.send(Response.userFailResp("A verification email was just sent. Please wait a few seconds before resending."));
      }

      const token = generateToken();
      const row = await EmailVerification.findOneAndUpdate(
        { adminId, email },
        { $set: { token, expiresAt: new Date(Date.now() + LINK_TTL_MS), verifiedAt: null } },
        { upsert: true, new: true },
      );
      await mailHelper.verifyEmail(email, `?token=${token}&value=${encodeURIComponent(email)}&kind=user`, "user");
      return res.send(Response.userSuccessResp("Verification email sent", { id: String(row._id), verified: false }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to send verification email", error.message));
    }
  }

  // The link in the email (public, no login). POST ?token= { email }.
  async verify(req, res) {
    try {
      const token = String(req.query?.token || "");
      const email = normalize(req.body?.email);
      if (!token || !email) return res.send(Response.userFailResp("Missing token or email.", "Validation Failed!"));

      const row = await EmailVerification.findOne({ token, email });
      if (!row) return res.send(Response.userFailResp("Invalid link, or it has already been used."));
      if (row.expiresAt && row.expiresAt < new Date()) return res.send(Response.userFailResp("This verification link has expired."));

      row.verifiedAt = new Date();
      row.token = null;
      await row.save();
      emitUserEmailVerified({ adminId: row.adminId, verificationId: row._id });
      return res.send(Response.userSuccessResp("Email verified successfully.", { email }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to verify email", error.message));
    }
  }

  // Fallback for a dropped socket: GET ?email=.
  async status(req, res) {
    try {
      const adminId = req?.verified?.userData?.adminId;
      return res.send(Response.userSuccessResp("Verification status", {
        verified: await isEmailVerified(adminId, req.query?.email),
      }));
    } catch (error) {
      logger.error(error);
      return res.status(500).send(Response.errorResp("Failed to read verification status", error.message));
    }
  }
}

export default new EmailVerificationService();
