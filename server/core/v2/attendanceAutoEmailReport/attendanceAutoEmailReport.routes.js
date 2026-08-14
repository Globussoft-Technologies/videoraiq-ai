import express from "express";
import controller from "./attendanceAutoEmailReport.controller.js";
import { viewAccessCheck, editAccessCheck, createAccessCheck, deleteAccessCheck } from "../../../middlewares/permissionMiddleware.js";

const router = express.Router();

/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'List saved attendance email reports. Used by the report table and its title/recipient search.' */
router.get("/", viewAccessCheck, controller.list);
/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'Create a separate scheduled attendance report. Formats can be PDF, CSV, or both. Custom schedules send once after their selected range ends.'
   #swagger.parameters['body'] = { in: 'body', required: true, schema: { title: 'Weekly attendance', recipients: ['hr@example.com'], schedule: { frequency: 'weekly', time: '00:00', weekday: 1 }, target: { scope: 'organization' }, formats: ['pdf', 'csv'], enabled: true, sendTestMail: false } } */
router.post("/", createAccessCheck, controller.create);
/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'Get employees and departments for the Specific Employee / Specific Department selectors.' */
router.get("/audience-options", viewAccessCheck, controller.audienceOptions);
/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'Load one saved report for the edit dialog.' */
router.get("/:id", viewAccessCheck, controller.getById);
/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'Update a saved report, including its schedule, recipients, audience, formats, or enabled state.' */
router.put("/:id", editAccessCheck, controller.update);
/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'Delete a saved attendance auto email report.' */
router.delete("/:id", deleteAccessCheck, controller.remove);
/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'Preview the attendance rows that the report will include; does not send mail.' */
router.post("/:id/preview", viewAccessCheck, controller.preview);
/* #swagger.tags = ['Attendance Auto Email Reports']
   #swagger.description = 'Send the attendance report immediately. Optionally provide body.recipients to send a test only to those addresses.' */
router.post("/:id/send-now", editAccessCheck, controller.sendNow);

export default router;
