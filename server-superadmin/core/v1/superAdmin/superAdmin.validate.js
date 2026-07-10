import Joi from 'joi';

class SuperAdminValidation {
    signUp(body) {
        return Joi.object({
            name: Joi.string().trim().allow('').optional(),
            email: Joi.string().email().required(),
            password: Joi.string().min(8).required(),
        }).validate(body);
    }
    signIn(body) {
        return Joi.object({
            email: Joi.string().email().required(),
            password: Joi.string().required(),
        }).validate(body);
    }
    forgotPassword(body) {
        return Joi.object({
            email: Joi.string().email().required(),
        }).validate(body);
    }
    resetPassword(body) {
        return Joi.object({
            email: Joi.string().email().required(),
            otp: Joi.string().length(6).required(),
            newPassword: Joi.string().min(8).required(),
        }).validate(body);
    }
}

export default new SuperAdminValidation();
