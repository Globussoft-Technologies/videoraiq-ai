/**
 * Build a minimal Express app for contract testing. We do NOT import
 * server.js (it boots Mongo + sockets). Instead we attach only the
 * middleware and the routes we want to exercise.
 */
import express from "express";
import mongoSanitize from "express-mongo-sanitize";
import cookieParser from "cookie-parser";
import { xss } from "express-xss-sanitizer";
import bodyParser from "body-parser";
import errorMiddleware from "../../middlewares/errorMiddleware.js";

export function buildApp(mountRouter) {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(
    xss({
      allowedKeys: [
        "password",
        "confirmPassword",
        "secretAccessKey",
        "oldPassword",
        "newPassword",
        "login",
        "pass",
      ],
    })
  );
  app.use(bodyParser.text({ type: "application/xml" }));
  app.set("trust proxy", 1);

  mountRouter(app);
  app.use(errorMiddleware);
  return app;
}
