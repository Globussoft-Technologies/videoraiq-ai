import config from "config";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import superAdminModel from "./superAdmin.model.js";
import superAdminValidation from "./superAdmin.validate.js";
import { hashPassword, verifyPassword, generateOTP } from "../../../utils/cryptoUtils.js";
import { generateToken } from "../../../middlewares/decodeToken.js";
import mailHelper from "../../../mailService/mail.helper.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Which DB/host a query actually ran against — settles "the collection is empty
// in Compass but the server says it exists" confusion when the running server
// and whoever is inspecting the data via Compass aren't pointed at the same
// MongoDB (different mongodb_uri, stale NODE_ENV/config, etc.).
function describeDbConn() {
    const dbConn = superAdminModel.db;
    return `host=${dbConn?.host}:${dbConn?.port} db=${dbConn?.name} readyState=${dbConn?.readyState}`;
}

class SuperAdminService {
    async signUp(req, res) {
        try {
            const { value, error } = superAdminValidation.signUp(req.body);
            if (error) {
                logger.warn(`superAdmin signUp: validation failed - ${error.message}`);
                return res.send(Response.FailResp("Validation failed", error.message));
            }

            const email = value.email.toLowerCase();
            logger.info(`superAdmin signUp: checking existing email=${email} on mongo ${describeDbConn()}`);
            const exists = await superAdminModel.findOne({ email });
            logger.debug(`superAdmin signUp: existing lookup for email=${email} found=${Boolean(exists)} id=${exists?._id || "n/a"}`);
            if (exists) {
                logger.warn(`superAdmin signUp: rejected, email already registered=${email} id=${exists._id}`);
                return res.send(Response.FailResp("Email already registered"));
            }

            const superAdmin = await superAdminModel.create({
                name: value.name || "",
                email,
                password: hashPassword(value.password),
            });
            return res.send(Response.SuccessResp("Super admin registered successfully", { id: superAdmin._id, email }));
        } catch (err) {
            logger.error(`superAdmin signUp: ${err.message}`);
            return res.send(Response.userFailResp("Something went wrong", err.message));
        }
    }

    async signIn(req, res) {
        try {
            const { value, error } = superAdminValidation.signIn(req.body);
            if (error) {
                logger.warn(`superAdmin signIn: validation failed - ${error.message}`);
                return res.send(Response.FailResp("Validation failed", error.message));
            }

            const email = value.email.toLowerCase();
            logger.info(`superAdmin signIn: looking up email=${email} on mongo ${describeDbConn()}`);
            const superAdmin = await superAdminModel.findOne({ email });
            logger.debug(`superAdmin signIn: lookup result for email=${email} found=${Boolean(superAdmin)} id=${superAdmin?._id || "n/a"}`);
            if (!superAdmin) {
                logger.warn(`superAdmin signIn: no account found for email=${email}`);
                return res.send(Response.FailResp("Invalid email or password"));
            }

            if (!verifyPassword(value.password, superAdmin.password)) {
                // Never log the plaintext password. Note whether the stored value even
                // looks like the expected scrypt "salt:hash" format — this is the exact
                // failure mode when an account's password was seeded/edited by hand
                // outside hashPassword() and doesn't match what verifyPassword() expects.
                const storedLooksValid = typeof superAdmin.password === "string" && superAdmin.password.includes(":");
                logger.warn(
                    `superAdmin signIn: password mismatch for email=${email} id=${superAdmin._id} storedFormatValid=${storedLooksValid}`
                );
                return res.send(Response.FailResp("Invalid email or password"));
            }

            const token = generateToken(
                { id: superAdmin._id, email: superAdmin.email, role: "superAdmin" },
                config.get("jwt.secretKey"),
                config.get("jwt.tokenExpiryTime")
            );
            logger.info(`superAdmin signIn: success for email=${email} id=${superAdmin._id}`);
            return res.send(Response.SuccessResp("Signed in successfully", {
                token,
                user: { id: superAdmin._id, name: superAdmin.name, email: superAdmin.email },
            }));
        } catch (err) {
            logger.error(`superAdmin signIn: unexpected error - ${err.message}`);
            return res.send(Response.userFailResp("Something went wrong", err.message));
        }
    }

    async forgotPassword(req, res) {
        try {
            const { value, error } = superAdminValidation.forgotPassword(req.body);
            if (error) return res.send(Response.FailResp("Validation failed", error.message));

            const email = value.email.toLowerCase();
            const superAdmin = await superAdminModel.findOne({ email });
            // Don't reveal whether the email is registered.
            if (superAdmin) {
                const otp = generateOTP();
                superAdmin.resetOTP = otp;
                superAdmin.otpExpireDate = new Date(Date.now() + OTP_TTL_MS);
                await superAdmin.save();
                await mailHelper.sendResetOtp(email, superAdmin.name, otp);
            }
            return res.send(Response.SuccessResp("If the email is registered, a password reset OTP has been sent."));
        } catch (err) {
            logger.error(`superAdmin forgotPassword: ${err.message}`);
            return res.send(Response.userFailResp("Something went wrong", err.message));
        }
    }

    async resetPassword(req, res) {
        try {
            const { value, error } = superAdminValidation.resetPassword(req.body);
            if (error) return res.send(Response.FailResp("Validation failed", error.message));

            const email = value.email.toLowerCase();
            const superAdmin = await superAdminModel.findOne({ email });
            if (!superAdmin || !superAdmin.resetOTP || superAdmin.resetOTP !== value.otp) {
                return res.send(Response.FailResp("Invalid OTP"));
            }
            if (!superAdmin.otpExpireDate || new Date() > superAdmin.otpExpireDate) {
                return res.send(Response.FailResp("OTP has expired"));
            }

            superAdmin.password = hashPassword(value.newPassword);
            superAdmin.resetOTP = null;
            superAdmin.otpExpireDate = null;
            await superAdmin.save();
            return res.send(Response.SuccessResp("Password reset successfully"));
        } catch (err) {
            logger.error(`superAdmin resetPassword: ${err.message}`);
            return res.send(Response.userFailResp("Something went wrong", err.message));
        }
    }
}

export default new SuperAdminService();
