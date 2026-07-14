import Joi from "joi";

export const googleDriveBodySchema = Joi.object({
  name: Joi.string().trim().required().messages({
    "any.required": "Storage name is required",
    "string.empty": "Storage name cannot be empty",
  }),
  clientId: Joi.string().trim().required().messages({
    "any.required": "Client ID is required",
    "string.empty": "Client ID cannot be empty",
  }),
  clientSecret: Joi.string().trim().required().messages({
    "any.required": "Client Secret is required",
    "string.empty": "Client Secret cannot be empty",
  }),
  redirectUri: Joi.string().uri().required().messages({
    "any.required": "Redirect URI is required",
    "string.empty": "Redirect URI cannot be empty",
    "string.uri": "Redirect URI must be a valid URL",
  }),
  storageType: Joi.string().valid("google_drive_oauth").required().messages({
    "any.required": "Storage type is required",
    "any.only": "Storage type must be 'google_drive'",
  }),
  note: Joi.string().trim().optional().allow("").messages({
    "string.base": "Note must be a string",
  }),
});

export const s3Validator = Joi.object({
  name: Joi.string().trim().required().messages({
    "any.required": "Storage name is required",
    "string.empty": "Storage name cannot be empty",
  }),
  accessKeyId: Joi.string().trim().required().messages({
    "string.base": "Access Key ID must be a string",
    "any.required": "Access Key ID is required",
  }),
  secretAccessKey: Joi.string().trim().required().messages({
    "string.base": "Secret Access Key must be a string",
    "any.required": "Secret Access Key is required",
  }),
  bucketName: Joi.string().trim().required().messages({
    "string.base": "Bucket Name must be a string",
    "any.required": "Bucket Name is required",
  }),
  region: Joi.string().trim().required().messages({
    "string.base": "Region must be a string",
    "any.required": "Region is required",
  }),
  storageType: Joi.string().valid("s3").required().messages({
    "any.required": "Storage type is required",
    "any.only": "Storage type must be 's3'",
  }),
  note: Joi.string().trim().optional().allow("").messages({
    "string.base": "Note must be a string",
  }),
});

export const sftpValidator = Joi.object({
  name: Joi.string().trim().required().messages({
    "any.required": "Storage name is required",
    "string.empty": "Storage name cannot be empty",
  }),
  host: Joi.string().trim().required().messages({
    "string.base": "Host must be a string",
    "any.required": "Host is required",
  }),
  port: Joi.number().integer().min(1).max(65535).required().messages({
    "number.base": "Port must be a number",
    "number.min": "Port must be at least 1",
    "number.max": "Port must be at most 65535",
    "any.required": "Port is required",
  }),
  username: Joi.string().trim().required().messages({
    "string.base": "Username must be a string",
    "any.required": "Username is required",
  }),
  password: Joi.string().trim().required().messages({
    "string.base": "Password must be a string",
    "any.required": "Password is required",
  }),
  storageType: Joi.string().valid("sftp").required().messages({
    "any.required": "Storage type is required",
    "any.only": "Storage type must be 'sftp'",
  }),
  path: Joi.string().trim().optional().messages({
    "string.base": "Path must be a string",
  }),
  note: Joi.string().trim().optional().allow("").messages({
    "string.base": "Note must be a string",
  }),
});
