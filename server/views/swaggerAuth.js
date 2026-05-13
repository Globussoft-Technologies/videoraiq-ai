import basicAuth from "express-basic-auth";
import config from "config";
import logger from "../utils/logger.js";

const swaggerAuthLogger = (req, _res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  logger.info(`------${new Date()}------${req.auth.user}------${ip}------`);
  next();
};

const auth = basicAuth({
  users: config.get("swagger_auth"),
  challenge: true,
});

export { auth, swaggerAuthLogger };
