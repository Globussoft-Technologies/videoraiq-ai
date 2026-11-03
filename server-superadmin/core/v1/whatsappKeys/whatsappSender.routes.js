import { Router } from 'express';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import verifySuperAdmin from '../../../middlewares/verifySuperAdmin.js';
import { publicSender, saveSender, syncSenderTemplates, submitSenderTemplates } from './whatsappSender.service.js';

const router = Router();
router.use(verifySuperAdmin, rateLimit({ windowMs: 60000, max: 40 }));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const run = (schema, action) => async (req, res) => {
  try {
    const input = schema ? await schema.validateAsync(req.body, { abortEarly: false }) : {};
    return res.json(await action(input, req.superAdmin._id));
  } catch (error) { return res.status(error.statusCode || (error.response?.status === 429 ? 429 : 400)).json({ message: error.response?.data?.error?.message || error.message }); }
};
const id = Joi.string().trim().pattern(/^\d{5,30}$/).required();
router.get('/', run(null, publicSender));
router.put('/', run(Joi.object({ phoneNumberId: id, businessAccountId: id, apiVersion: Joi.string().pattern(/^v\d{1,2}\.0$/).required(),
  accessToken: Joi.string().max(4096).allow(''), appSecret: Joi.string().max(256).allow('') }), saveSender));
router.post('/templates/sync', run(Joi.object({}), syncSenderTemplates));
router.post('/templates', run(Joi.object({}), submitSenderTemplates));
export default router;
