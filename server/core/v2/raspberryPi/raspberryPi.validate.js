import Joi from "joi";

export const raspberryPiRegistrationSchema = Joi.object({
  mac: Joi.string().trim().min(2).max(100).required(),
  ip: Joi.string().trim().ip({ version: ["ipv4", "ipv6"], cidr: "forbidden" }).required(),
  ts: Joi.alternatives()
    .try(Joi.date().iso(), Joi.number().integer().positive())
    .required(),
  station: Joi.object().min(1).unknown(true).required(),
}).unknown(false);
