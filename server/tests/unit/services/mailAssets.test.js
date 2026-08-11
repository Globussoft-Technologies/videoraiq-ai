import Mail from '@sendgrid/helpers/classes/mail.js';
import { describe, expect, it, vi } from 'vitest';
import { EMAIL_ICON_ASSETS } from '../../../mailService/emailIconAssets.js';
import MailHelper from '../../../mailService/mail.helper.js';
import { LineCrossingAuthIncident } from '../../../mailService/IncidentsMailTemplates/mail.incidentsTemplate.js';
import { encrypt } from '../../../utils/cryptoUtils.js';

const EMAIL_LOGO_URL = 'https://stagingv2.videoraiq.com/src/assets/videoraiq-logo-color.png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal();
  const getConfig = actual.default.get.bind(actual.default);

  return {
    ...actual,
    default: {
      ...actual.default,
      get: (key) => (key === 'webUrl' ? 'https://app.example.com' : getConfig(key)),
    },
  };
});

describe('mail asset normalization', () => {
  it('bundles every email icon as a unique valid PNG attachment', () => {
    const assets = Object.values(EMAIL_ICON_ASSETS);
    const contentIds = assets.map(({ contentId }) => contentId);

    expect(new Set(contentIds).size).toBe(assets.length);
    assets.forEach(({ content, disposition, type }) => {
      expect(Buffer.from(content, 'base64').subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(disposition).toBe('inline');
      expect(type).toBe('image/png');
    });
  });

  it('replaces every legacy logo host with the supplied logo URL', () => {
    const email = {
      html: `
        <img src="https://i.postimg.cc/CL6Ws6bK/Videora-IQlogo.png">
        <img src="https://i.postimg.cc/ryCwbgMJ/Videora_IQlogo.png">
        <img src="https://videoraiq.com/wp-content/uploads/2025/06/videoraIQ-dark-blue.webp">
      `,
    };

    MailHelper._withReliableAssets(email);

    expect(email.html.split(EMAIL_LOGO_URL)).toHaveLength(4);
    expect(email.html).not.toContain('postimg.cc');
    expect(email.html).not.toContain('wp-content/uploads');
  });

  it('replaces dead postimg icons with deduplicated inline PNG attachments', () => {
    const existingAttachment = {
      content: 'existing-content',
      filename: 'existing.txt',
      contentId: 'existing-attachment',
    };
    const email = {
      html: `
        <img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24">
        <img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24">
        <img src="https://i.postimg.cc/yxP6Z6vQ/line_Crossing.png" style="width:60px">
        <img src="https://i.postimg.cc/Hn2WyWBc/cam.pnghttps://i.postimg.cc/65X1Bxwg/cam.png" width="24">
      `,
      attachments: [existingAttachment],
    };

    MailHelper._withReliableAssets(email);

    expect(email.html).not.toContain('postimg.cc');
    expect(email.html).toContain(`src="cid:${EMAIL_ICON_ASSETS.time.contentId}"`);
    expect(email.html).toContain(`src="cid:${EMAIL_ICON_ASSETS.lineCrossing.contentId}"`);
    expect(email.html).toContain(`src="cid:${EMAIL_ICON_ASSETS.camera.contentId}"`);
    expect(email.html).toContain('alt="Time"');
    expect(email.html).toContain('alt="Line crossing"');
    expect(email.html).toContain('alt="Camera"');
    expect(email.attachments.map(({ contentId, content_id: contentIdJson }) => (
      contentId || contentIdJson
    ))).toEqual([
      existingAttachment.contentId,
      EMAIL_ICON_ASSETS.time.contentId,
      EMAIL_ICON_ASSETS.lineCrossing.contentId,
      EMAIL_ICON_ASSETS.camera.contentId,
    ]);
    expect(email.attachments.slice(1).every(({ content }) => (
      Buffer.from(content, 'base64').subarray(0, 8).equals(PNG_SIGNATURE)
    ))).toBe(true);
  });

  it('serializes inline icon IDs in the SendGrid API format', () => {
    const email = {
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Inline icon test',
      html: '<img src="https://i.postimg.cc/SRrQMQD9/clock.png" width="24">',
    };

    MailHelper._withReliableAssets(email);
    const payload = new Mail(email).toJSON();

    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].content_id).toBe(EMAIL_ICON_ASSETS.time.contentId);
    expect(payload.attachments[0]).not.toHaveProperty('contentId');
  });

  it('cleans all broken assets from the Line Crossing template', () => {
    const html = LineCrossingAuthIncident(
      {
        _id: 'incident-1',
        incidentName: 'Main entrance crossing',
        description: 'Line crossing detected',
        timeOfIncident: '2026-08-07T06:17:00.000Z',
        zone: 'Zone 1',
        severity: 'moderate',
        personDetected: [],
        atoB: 1,
        btoA: 0,
        alertThreshold: 400,
      },
      { nvrName: 'NVR 1', ip: encrypt('10.0.0.1') },
      { name: 'Camera 1' },
    );
    const email = { html };

    MailHelper._withReliableAssets(email);

    expect(email.html).toContain(`src="${EMAIL_LOGO_URL}"`);
    expect(email.html).not.toContain('postimg.cc');
    expect(email.html).toContain(`src="cid:${EMAIL_ICON_ASSETS.lineCrossing.contentId}"`);
    expect(email.attachments.some(({ content_id: contentId }) => (
      contentId === EMAIL_ICON_ASSETS.lineCrossing.contentId
    ))).toBe(true);
  });

  it('leaves incident images from other hosts unchanged', () => {
    const email = { html: '<img src="https://media.example.com/incidents/1.jpg">' };

    MailHelper._withReliableAssets(email);

    expect(email.html).toBe('<img src="https://media.example.com/incidents/1.jpg">');
  });
});
