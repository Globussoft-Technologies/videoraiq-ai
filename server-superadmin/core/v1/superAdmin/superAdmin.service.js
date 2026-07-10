import config from "config";
import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import superAdminModel from "./superAdmin.model.js";
import superAdminValidation from "./superAdmin.validate.js";
import { hashPassword, verifyPassword, generateOTP } from "../../../utils/cryptoUtils.js";
import { generateToken } from "../../../middlewares/decodeToken.js";
import mailHelper from "../../../mailService/mail.helper.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

class SuperAdminService {
    async signUp(req, res) {
        try {
            const { value, error } = superAdminValidation.signUp(req.body);
            if (error) return res.send(Response.FailResp("Validation failed", error.message));

            const email = value.email.toLowerCase();
            const exists = await superAdminModel.findOne({ email });
            if (exists) return res.send(Response.FailResp("Email already registered"));

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
            if (error) return res.send(Response.FailResp("Validation failed", error.message));

            const email = value.email.toLowerCase();
            const superAdmin = await superAdminModel.findOne({ email });
            if (!superAdmin || !verifyPassword(value.password, superAdmin.password)) {
                return res.send(Response.FailResp("Invalid email or password"));
            }

            const token = generateToken(
                { id: superAdmin._id, email: superAdmin.email, role: "superAdmin" },
                config.get("jwt.secretKey"),
                config.get("jwt.tokenExpiryTime")
            );
            return res.send(Response.SuccessResp("Signed in successfully", {
                token,
                user: { id: superAdmin._id, name: superAdmin.name, email: superAdmin.email },
            }));
        } catch (err) {
            logger.error(`superAdmin signIn: ${err.message}`);
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
