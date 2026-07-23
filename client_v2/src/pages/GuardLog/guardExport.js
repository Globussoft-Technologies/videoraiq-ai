import * as XLSX from 'xlsx';

const calculateDuration = (start, end) => {
  const toSeconds = (time) => {
    const [h, m, s] = time.split(':').map(Number);
    return h * 3600 + m * 60 + s;
  };
  const diff = toSeconds(end) - toSeconds(start);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}h ${m}m ${s}s`;
};

const prepareLogs = (channels) => {
  const finalLogs = [];
  channels.forEach((channel) => {
    channel.segments.forEach((seg) => {
      const [timeRange, status] = seg.label.split(' : ');
      const [inTime, outTime] = timeRange.split(' - ');
      finalLogs.push({
        channelId: channel.channelId,
        inTime,
        outTime,
        duration: calculateDuration(inTime, outTime),
        status,
      });
    });
  });
  return finalLogs;
};

/** One sheet per camera, grouped by presence/absence segment. */
export const downloadLogsExcel = (channels, selectedDate) => {
  const logs = prepareLogs(channels);
  if (!logs.length) return false;

  const grouped = {};
  logs.forEach((log) => {
    if (!grouped[log.channelId]) grouped[log.channelId] = [];
    grouped[log.channelId].push(log);
  });

  const workbook = XLSX.utils.book_new();

  Object.keys(grouped).forEach((camera) => {
    const data = grouped[camera].map((log, index) => ({
      Camera: index === 0 ? camera : '',
      'IN Time': log.inTime,
      'OUT Time': log.outTime,
      Duration: log.duration,
      Status:
        log.status?.toLowerCase() === 'presence'
          ? 'Present'
          : log.status?.toLowerCase() === 'absence'
            ? 'Absent'
            : log.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const safeSheetName = camera.substring(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
  });

  XLSX.writeFile(workbook, `camera_logs_${selectedDate}.xlsx`);
  return true;
};
