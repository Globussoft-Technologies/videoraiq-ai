import express from "express";
import filesController from "./files.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from '../../../middlewares/permissionMiddleware.js';


const router = express.Router();
