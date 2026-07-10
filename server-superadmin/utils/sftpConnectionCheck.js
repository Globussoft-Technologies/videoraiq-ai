// sftpConnectionCheck.js
import Client from 'ssh2-sftp-client';
import config from 'config';

let sftpInstance = null;
let idleTimer = null; // <-- for idle auto-close
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Reset idle timer whenever SFTP is used
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    closeSftpConnection();
  }, IDLE_TIMEOUT_MS);
}

// Main method to get/reconnect SFTP
export async function checkSftpConnection() {
  if (sftpInstance && sftpInstance.sftp) {
    try {
      await sftpInstance.list('/'); // check if alive
      resetIdleTimer(); // keep it alive longer
      return sftpInstance;
    } catch (e) {
      console.warn('⚠️ SFTP stale connection, reconnecting...');
      await closeSftpConnection(); // safely cleanup
    }
  }

  const sftp = new Client();
  const sftpConfig = {
    host: config.get('SFTP.IP'),
    port: config.get('SFTP.Port'),
    username: config.get('SFTP.user-name'),
    password: config.get('SFTP.Password'),
  };

  await sftp.connect(sftpConfig);
  sftpInstance = sftp;
  resetIdleTimer();
  console.log('✅ SFTP Connected');
  return sftpInstance;
}

// Manual close method (and used by idle timer)
export async function closeSftpConnection() {
  if (sftpInstance) {
    try {
      await sftpInstance.end();
    } catch (err) {
      console.error('❌ Error closing SFTP:', err.message);
    }
    sftpInstance = null;
    clearTimeout(idleTimer);
    idleTimer = null;
    console.log('🛑 SFTP Connection Closed');
  }
}
