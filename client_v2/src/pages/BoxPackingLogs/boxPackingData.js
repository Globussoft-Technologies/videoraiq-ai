import moment from 'moment-timezone';

const today = moment().startOf('day');
const at = (hours, minutes) => today.clone().add(hours, 'hours').add(minutes, 'minutes').toISOString();

// Static demo snapshots only. These are intentionally stored with the dummy
// records so the Box Packing UI does not need an image API to render previews.
const packingImages = [
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1601598851547-4302969d0614?auto=format&fit=crop&w=1200&q=80',
];

export const BOX_PACKING_DUMMY_LOGS = [
  { id: 'BP-2401', boxId: 'BX-10482', completedBy: 'Anita Rao', zone: 'Packing Zone A', boxNumber: 24, timeTakenSec: 86, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 01', time: at(8, 12), color: '#22c55e', reason: 'Box count matched', Image: packingImages[0] },
  { id: 'BP-2402', boxId: 'BX-10483', completedBy: 'Vikram Singh', zone: 'Packing Zone B', boxNumber: 18, timeTakenSec: 104, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 02', time: at(9, 5), color: '#f5a623', reason: 'Manual confirmation', Image: packingImages[1] },
  { id: 'BP-2403', boxId: 'BX-10484', completedBy: 'Meera Nair', zone: 'Packing Zone A', boxNumber: 32, timeTakenSec: 72, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 01', time: at(10, 18), color: '#22c55e', reason: 'Box count matched', Image: packingImages[2] },
  { id: 'BP-2404', boxId: 'BX-10485', completedBy: 'Rahul Das', zone: 'Packing Zone C', boxNumber: 12, timeTakenSec: 141, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 03', time: at(11, 42), color: '#f5a623', reason: 'Count variance detected', Image: packingImages[3] },
  { id: 'BP-2405', boxId: 'BX-10486', completedBy: 'Anita Rao', zone: 'Packing Zone B', boxNumber: 28, timeTakenSec: 91, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 02', time: at(13, 7), color: '#22c55e', reason: 'Box count matched', Image: packingImages[1] },
  { id: 'BP-2406', boxId: 'BX-10487', completedBy: 'Suresh Kumar', zone: 'Packing Zone C', boxNumber: 20, timeTakenSec: 118, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 03', time: at(14, 26), color: '#f5a623', reason: 'Awaiting supervisor review', Image: packingImages[3] },
  { id: 'BP-2407', boxId: 'BX-10488', completedBy: 'Meera Nair', zone: 'Packing Zone A', boxNumber: 36, timeTakenSec: 68, detectedVia: 'Camera + sensor', status: 'completed', camera: 'Packing Cam 01', time: at(15, 11), color: '#22c55e', reason: 'Box count matched', Image: packingImages[0] },
  { id: 'BP-2408', boxId: 'BX-10489', completedBy: 'Vikram Singh', zone: 'Packing Zone B', boxNumber: 16, timeTakenSec: 129, detectedVia: 'Camera', status: 'review', camera: 'Packing Cam 02', time: at(16, 3), color: '#f5a623', reason: 'Count variance detected', Image: packingImages[2] },
];

export const packingStats = (rows) => ({
  total: rows.length,
  review: rows.filter((row) => row.status === 'review').length,
  boxes: rows.reduce((sum, row) => sum + row.boxNumber, 0),
  avgTime: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.timeTakenSec, 0) / rows.length) : 0,
});
