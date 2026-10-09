import mongoose from 'mongoose';
import Joi from 'joi';
import moment from 'moment-timezone';
import { randomUUID } from 'node:crypto';
import sendGridMail from '@sendgrid/mail';
import config from 'config';
import Report, { Delivery } from './solderAutoEmailReport.model.js';
import Admin from '../admin/admin.model.js';
import Channel from '../channels/channels.model.js';
import '../detectionSettings/detectionSettings.model.js';
import Recipient from '../verifyRecipients/recipients.model.js';
import SolderPanel from '../incidents/solderPanel.model.js';
import { DeskSolarShoulderDetectionIncident as Incident } from '../incidents/incidents.model.js';
import Response from '../../../utils/response.js';
import logger from '../../../utils/logger.js';
import { validTimezone, DEFAULT_ADMIN_TIMEZONE } from '../../../utils/timezone.js';
import { trackOutboundEmail, trackFailedEmail } from '../emailMonitoring/emailTracker.js';
import { scheduledWindow } from './scheduleWindow.js';
import { buildReportRows, buildAttachments, REPORT_TITLES } from './reportData.js';

// Older deployments use SendGrid directly and do not include the optional
// SMTP transport. Resolve it at send time so its absence cannot stop startup.
const transportUrl = new URL('../../../mailService/mail.transport.js', import.meta.url).href;
export async function resolveMailTransport(importer = () => import('../../../mailService/mail.transport.js')) {
  try { return await importer(); }
  catch (error) {
    // Missing dependencies inside the transport are real deployment errors.
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== transportUrl) throw error;
    if ((process.env.MAIL_PROVIDER || 'sendgrid').trim().toLowerCase() !== 'sendgrid') {
      throw new Error('SMTP mail requires mailService/mail.transport.js. Deploy that file before sending SMTP reports.');
    }
    return {
      getMailSender: () => ({
        name: process.env.SENDGRID_FROM_NAME || config.get('sendgrid.name'),
        email: process.env.SENDGRID_FROM_EMAIL || config.get('sendgrid.email'),
      }),
      default: { send: (email) => {
        sendGridMail.setApiKey(process.env.SENDGRID_API_KEY || config.get('sendgrid.key'));
        return sendGridMail.send(email);
      } },
    };
  }
}
let transportPromise;
const getMailTransport = () => {
  if (!transportPromise) transportPromise = resolveMailTransport().catch((error) => { transportPromise = null; throw error; });
  return transportPromise;
};
const mail = { send: async (email) => (await getMailTransport()).default.send(email) };

const idSchema = Joi.string().hex().length(24).required();
const schema = Joi.object({
  channelId: idSchema,
  title: Joi.string().trim().min(2).max(120).required(),
  schedule: Joi.object({
    frequency: Joi.string().valid('daily', 'weekly', 'monthly', 'custom').required(),
    time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default('07:00'),
    weekday: Joi.number().integer().min(0).max(6).default(1),
    dayOfMonth: Joi.number().integer().min(1).max(28).default(1),
    startDate: Joi.string().allow(null).default(null),
    endDate: Joi.string().allow(null).default(null),
  }).custom((schedule, helpers) => {
    if (schedule.frequency === 'custom') {
      if (!moment(schedule.startDate, 'YYYY-MM-DD', true).isValid() || !moment(schedule.endDate, 'YYYY-MM-DD', true).isValid() || schedule.endDate < schedule.startDate) {
        return helpers.message({ custom: 'Choose a valid custom start and end date.' });
      }
    } else { schedule.startDate = null; schedule.endDate = null; }
    return schedule;
  }).required(),
  reportType: Joi.string().valid(...Object.keys(REPORT_TITLES)).required(),
  recipients: Joi.array().items(Joi.string().email().lowercase()).unique().min(1).required(),
  formats: Joi.array().items(Joi.string().valid('pdf', 'xlsx')).unique().min(1).required(),
  enabled: Joi.boolean().default(true),
});
const auth = (req) => ({ adminId: req.verified.userData.adminId, userId: String(req.verified.userData.user_id) });
const scopedChannel = (req, channelId) => {
  const channels = req.verified?.authorizedChannel?.channels;
  return !Array.isArray(channels) || channels.some((id) => String(id) === String(channelId));
};
const httpError = (message, status = 400) => Object.assign(new Error(message), { status });
const fail = (res, error) => res.status(error.status || 500).json(Response.errorResp(error.message, 'Solder report schedule failed.'));

async function validateTargets(data, account) {
  const [channel, verified] = await Promise.all([
    Channel.findOne({ _id: data.channelId, userId: account.userId }).lean(),
    Recipient.find({ adminId: account.adminId, type: 'email', verified: true }).select('value').lean(),
  ]);
  if (!channel) throw httpError('Select a station belonging to your organisation.');
  const emails = new Set(verified.map((r) => r.value.toLowerCase()));
  if (data.recipients.some((email) => !emails.has(email.toLowerCase()))) throw httpError('Select verified email recipients belonging to your organisation.');
  return { channel };
}

export async function fetchReportRows(report, window, timezone) {
  const channel = await Channel.findOne({ _id: report.channelId, userId: report.userId })
    .populate('detections.deskSolarShoulderDetectionSettings.id').lean();
  if (!channel) throw new Error('Report station is no longer available.');
  const scope = { userId: report.userId, channelId: report.channelId };
  const [panels, absences] = await Promise.all([
    SolderPanel.find({ ...scope, time: { $gte: window.start.toDate(), $lt: window.end.toDate() } }).sort({ time: 1 }).lean(),
    Incident.find({ ...scope, eventType: { $nin: ['panel', 'missedSolder'] },
      timeOfIncident: { $lt: window.end.toDate() },
      $or: [{ returnedAt: { $gt: window.start.toDate() } }, { returnedAt: null }],
    }).sort({ timeOfIncident: 1 }).lean(),
  ]);
  return { channel, rows: buildReportRows(report.reportType, { channel, panels, absences, window, timezone }) };
}

async function prepareEmail(report, window, timezone) {
  await validateTargets(report, report);
  const { rows, channel } = await fetchReportRows(report, window, timezone);
  const title = `Solder Line — ${REPORT_TITLES[report.reportType]}`;
  const subtitle = `${channel.customName || channel.name || 'Camera'} · ${window.start.format('DD MMM YYYY HH:mm')} – ${window.end.format('DD MMM YYYY HH:mm')} (${timezone})`;
  const attachments = await buildAttachments(rows, title, subtitle, report.formats);
  return {
    from: (await getMailTransport()).getMailSender(), to: report.recipients, subject: `${title} — ${window.start.format('DD MMM YYYY')}`,
    text: `${title}\n${subtitle}\n${rows.length} report rows.\nThe scheduled report is attached.`, attachments,
  };
}

let indexReady;
export function ensureScheduleIndexes() {
  if (!indexReady) indexReady = (async () => {
    await Promise.all([Report.init(), Delivery.init()]);
    const indexes = await Report.collection.indexes();
    const old = indexes.find((index) => index.name === 'adminId_1_channelId_1_reportType_1_shiftId_1');
    if (old) {
      try { await Report.collection.dropIndex(old.name); }
      catch (error) { if (error.code !== 27) throw error; } // Another replica may have retired it.
    }
  })().catch((error) => { indexReady = null; throw error; });
  return indexReady;
}

let runner, busy = false;
class SolderAutoEmailReportService {
  // Preview/test use the draft settings without saving or changing a scheduled run.
  async draft(req, res, sendTest = false) {
    let email;
    try {
      const validation = sendTest ? schema : schema.fork(['recipients'], (field) => field.min(0).default([]));
      const { value: data, error } = validation.validate(req.body, { abortEarly: false });
      if (error) throw httpError(error.message);
      if (!scopedChannel(req, data.channelId)) throw httpError('You do not have access to this station.', 403);
      const report = { ...data, ...auth(req) };
      await validateTargets(report, report);
      const admin = await Admin.findById(report.adminId).select('timezone').lean();
      const timezone = validTimezone(admin?.timezone) || DEFAULT_ADMIN_TIMEZONE;
      const end = moment().tz(timezone);
      const start = end.clone().subtract(1, data.schedule.frequency === 'monthly' ? 'month' : data.schedule.frequency === 'weekly' ? 'week' : 'day');
      const window = data.schedule.frequency === 'custom' ? {
        start: moment.tz(data.schedule.startDate, 'YYYY-MM-DD', timezone).startOf('day'),
        end: moment.tz(data.schedule.endDate, 'YYYY-MM-DD', timezone).startOf('day').add(1, 'day'),
      } : { start, end };
      if (sendTest) {
        email = await prepareEmail(report, window, timezone);
        email.subject = `[Test] ${email.subject}`;
        const result = await mail.send(email);
        await trackOutboundEmail(email, result, { adminId: report.adminId, category: 'Solder report test' }).catch((e) => logger.error(e));
        return res.json(Response.userSuccessResp('Test email sent.', { recipients: report.recipients }));
      }
      const { rows } = await fetchReportRows(report, window, timezone);
      return res.json(Response.userSuccessResp('Report preview ready.', {
        rows: rows.slice(0, 100), total: rows.length,
        period: `${window.start.format('DD MMM YYYY HH:mm')} – ${window.end.format('DD MMM YYYY HH:mm')} (${timezone})`,
      }));
    } catch (error) {
      if (email) await trackFailedEmail(email, error, { adminId: auth(req).adminId, category: 'Solder report test' }).catch(() => {});
      return fail(res, error);
    }
  }

  async formOptions(req, res) {
    try {
      const account = auth(req);
      const [recipients, admin] = await Promise.all([
        Recipient.find({ adminId: account.adminId, type: 'email', verified: true }).select('value fullName').sort({ value: 1 }).lean(),
        Admin.findById(account.adminId).select('timezone').lean(),
      ]);
      return res.json(Response.userSuccessResp('Schedule options fetched', {
        recipients: recipients.map((r) => ({ email: r.value.toLowerCase(), name: r.fullName })),
        timezone: validTimezone(admin?.timezone) || DEFAULT_ADMIN_TIMEZONE,
      }));
    } catch (error) { return fail(res, error); }
  }

  async list(req, res) {
    try {
      const { channelId, reportType } = req.query;
      if (!mongoose.isValidObjectId(channelId) || !Object.hasOwn(REPORT_TITLES, reportType)) throw httpError('Select a valid station and report.');
      if (!scopedChannel(req, channelId)) throw httpError('You do not have access to this station.', 403);
      const reports = await Report.find({ ...auth(req), channelId, reportType }).sort({ createdAt: 1 }).lean();
      return res.json(Response.userSuccessResp('Schedules fetched', reports.map((report) => ({ ...report, enabled: Boolean(report.enabled && report.schedule) }))));
    } catch (error) { return fail(res, error); }
  }

  async save(req, res) {
    try {
      await ensureScheduleIndexes();
      const { value: data, error } = schema.validate(req.body, { abortEarly: false });
      if (error) throw httpError(error.message);
      if (!scopedChannel(req, data.channelId)) throw httpError('You do not have access to this station.', 403);
      const account = auth(req);
      await validateTargets(data, account);
      let report;
      if (req.params.id) {
        if (!mongoose.isValidObjectId(req.params.id)) throw httpError('Invalid schedule id.');
        report = await Report.findOne({ _id: req.params.id, ...account });
        if (!report) throw httpError('Schedule not found.', 404);
        if (!scopedChannel(req, report.channelId)) throw httpError('You do not have access to this schedule.', 403);
        if ((!report.enabled && data.enabled) || JSON.stringify(report.schedule?.toObject?.() || report.schedule) !== JSON.stringify(data.schedule)) report.activeFrom = new Date();
        Object.assign(report, data);
        await report.save();
      } else report = await Report.create({ ...data, ...account });
      return res.json(Response.userSuccessResp('Email schedule saved.', report));
    } catch (error) {
      if (error.code === 11000) return fail(res, httpError('A schedule with this name already exists for this report.', 409));
      return fail(res, error);
    }
  }

  async setEnabled(req, res) {
    try {
      if (!mongoose.isValidObjectId(req.params.id) || typeof req.body.enabled !== 'boolean') throw httpError('Invalid schedule or enabled status.');
      const report = await Report.findOne({ _id: req.params.id, ...auth(req) });
      if (!report) throw httpError('Schedule not found.', 404);
      if (!scopedChannel(req, report.channelId)) throw httpError('You do not have access to this schedule.', 403);
      if (req.body.enabled) {
        if (!report.schedule) throw httpError('Edit this schedule and choose a frequency and time before enabling it.');
        await validateTargets(report, report);
      }
      if (!report.enabled && req.body.enabled) report.activeFrom = new Date();
      report.enabled = req.body.enabled;
      await report.save();
      return res.json(Response.userSuccessResp(report.enabled ? 'Email schedule enabled.' : 'Email schedule disabled.', report));
    } catch (error) { return fail(res, error); }
  }

  async runDueReports(now = moment()) {
    if (busy) return;
    busy = true;
    try {
      // Wait for unique occurrence indexes before the first production tick.
      await ensureScheduleIndexes();
      const reports = await Report.find({ enabled: true, 'schedule.frequency': { $exists: true } }).lean();
      for (const report of reports) {
        try { await this.runReport(report, now); }
        catch (error) { logger.error(`[SOLDER_REPORT] ${report._id}: ${error.message}`); }
      }
    } finally { busy = false; }
  }

  async runReport(report, now) {
    const admin = await Admin.findOne({ _id: report.adminId, user_id: report.userId }).select('timezone').lean();
    if (!admin || !report.schedule) return;
    const timezone = validTimezone(admin.timezone) || DEFAULT_ADMIN_TIMEZONE;
    const window = scheduledWindow(report.schedule, timezone, now);
    if (!window || (report.schedule.frequency !== 'custom' && window.due.isBefore(report.activeFrom)) || moment(now).diff(window.due, 'hours', true) > 24 && report.schedule.frequency !== 'custom') return;
    const token = randomUUID(), end = window.due.toDate();
    let delivery;
    try {
      delivery = await Delivery.findOneAndUpdate({ scheduleId: report._id, end,
        $or: [{ status: { $exists: false } }, { status: 'preparing', leaseUntil: { $lt: new Date() } }],
      }, { $set: { adminId: report.adminId, status: 'preparing', token, leaseUntil: new Date(Date.now() + 10 * 60000) } }, { upsert: true, new: true });
    } catch (error) { if (error.code === 11000) return; throw error; }
    let email;
    try {
      email = await prepareEmail(report, window, timezone);
      // Check enabled state again immediately before sending; generation can be slow.
      if (!await Report.exists({ _id: report._id, enabled: true, updatedAt: report.updatedAt })) {
        await Delivery.deleteOne({ _id: delivery._id, token, status: 'preparing' });
        return;
      }
      const claimed = await Delivery.updateOne({ _id: delivery._id, token, status: 'preparing' }, { $set: { status: 'sending' } });
      if (!claimed.modifiedCount) return;
      // Never auto-resend a 'sending' occurrence: provider acceptance can be ambiguous
      // after a network failure or process crash. Unique occurrence index covers replicas.
      const result = await mail.send(email);
      await Delivery.updateOne({ _id: delivery._id, token }, { $set: { status: 'sent', sentAt: new Date() } });
      await Report.updateOne({ _id: report._id }, { $set: { lastSentAt: new Date(), lastError: null, ...(report.schedule.frequency === 'custom' ? { enabled: false } : {}) } });
      await trackOutboundEmail(email, result, { adminId: report.adminId, category: 'Solder report' }).catch((error) => logger.error(error));
    } catch (error) {
      // Failed occurrences remain recorded, rather than repeatedly emailing each minute.
      await Delivery.updateOne({ _id: delivery._id, token, status: { $ne: 'sent' } }, { $set: { status: 'failed', error: error.message } });
      await Report.updateOne({ _id: report._id }, { $set: { lastError: error.message } });
      if (email) await trackFailedEmail(email, error, { adminId: report.adminId, category: 'Solder report' }).catch(() => {});
      throw error;
    }
  }

  startRunner() {
    if (runner) return;
    const execute = () => this.runDueReports().catch((error) => logger.error(`[SOLDER_REPORT] ${error.message}`));
    execute(); runner = setInterval(execute, 60000); runner.unref?.();
  }
}
export default new SolderAutoEmailReportService();
