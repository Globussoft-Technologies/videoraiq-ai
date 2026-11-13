import { describe, expect, it } from 'vitest';
import { measurementMediaUrl, measurementRecordMediaUrls } from '../../../client_v2/src/pages/MeasurementLogs/mediaUrls.js';

const backend = 'https://globussoft.videoraiq.com/api-backend/api/v2';
const capture = '/api/v2/measurements/captures/1794566934127_88-a2-9e-d0-95-ec_video0_7a816217d36731b3.jpg';

describe('Measurement Logs public media URLs', () => {
  it('uses VITE_BACKEND instead of the stored localhost capture origin', () => {
    expect(measurementMediaUrl(`https://localhost:5055${capture}`, backend))
      .toBe(`https://globussoft.videoraiq.com/api-backend${capture}`);
  });
  it.each([capture, `http://old-station:5055${capture}`, `https://globussoft.videoraiq.com/api-backend${capture}`])('retains the proxy prefix exactly once for %s', source => {
    expect(measurementMediaUrl(source, `${backend}/`))
      .toBe(`https://globussoft.videoraiq.com/api-backend${capture}`);
  });
  it('resolves relative API bases against the frontend origin', () => {
    expect(measurementMediaUrl(`https://localhost:5055${capture}`, '/api/v2', 'http://192.168.0.30:3005'))
      .toBe(`http://192.168.0.30:3005${capture}`);
  });
  it('normalizes all image fields used by thumbnails, previews and exports without mutating records', () => {
    const record = { id: 'record', shot: capture, shotUrl: `https://localhost:5055${capture}`,
      qrImageUrl: 'http://old/api/v2/uploads/measurement-qr/qr.jpg', measurementImageUrl: capture };
    expect(measurementRecordMediaUrls(record, backend)).toEqual({
      id: 'record', shot: `${backend}/measurements/captures/${capture.split('/').pop()}`,
      shotUrl: `${backend}/measurements/captures/${capture.split('/').pop()}`,
      qrImageUrl: `${backend}/uploads/measurement-qr/qr.jpg`,
      measurementImageUrl: `${backend}/measurements/captures/${capture.split('/').pop()}`,
    });
    expect(record.shot).toBe(capture);
  });
  it('preserves query parameters and leaves external signed storage URLs unchanged', () => {
    expect(measurementMediaUrl(`${capture}?token=abc#frame`, backend)).toBe(`https://globussoft.videoraiq.com/api-backend${capture}?token=abc#frame`);
    const signed = 'https://storage.example/bucket/image.jpg?signature=abc';
    expect(measurementMediaUrl(signed, backend)).toBe(signed);
  });
  it('handles missing media and an unconfigured backend', () => {
    expect(measurementMediaUrl(null, backend)).toBe('');
    expect(measurementMediaUrl('', backend)).toBe('');
    expect(measurementMediaUrl(capture, '')).toBe(capture);
  });
});
