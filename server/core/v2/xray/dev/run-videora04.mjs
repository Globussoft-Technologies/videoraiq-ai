// Run from server/: node core/v2/xray/dev/run-videora04.mjs <private-runtime-json>
import fs from 'node:fs';
import os from 'node:os';
import mongoose from 'mongoose';
const state = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cfg = JSON.parse(fs.readFileSync(state.configFile, 'utf8'));
const dead = 'http://127.0.0.1:9';
process.env.NODE_ENV = 'development';
process.env.NODE_CONFIG_DIR = state.configDir;
process.env.XRAY_LOCAL_TEST_MODE = 'true';
// Laptop clock measured ~19 seconds ahead of videora04; keep both timestamps bounded.
process.env.XRAY_LOCAL_JWT_BACKDATE_SEC = '30';
process.env.XRAY_LOCAL_SESSION_COLLECTION = 'xray_controlled_' + os.hostname().toLowerCase().replace(/[^a-z0-9_]/g,'_');
process.env.XRAY_ENABLED = 'true';
process.env.XRAY_SERVICE_URL = 'http://127.0.0.1:17910';
process.env.XRAY_API_KEY = state.apiKey;
process.env.XRAY_JWT_SECRET = state.jwtSecret;
process.env.XRAY_LICENSE_CHECK = 'off';
process.env.XRAY_LOCAL_STREAM_HOSTS = state.streamHosts.join(',');
process.env.PORT = '5099';
process.env.AUTH_ALLOWED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';
process.env.NODE_CONFIG = JSON.stringify({
  mongodb_uri:cfg.mongodb_uri,
  port:5099,
  Redis:{host:'127.0.0.1',port:16379,username:'',password:''},
  PythonService:{detectionUrl:dead,attendanceUrl:dead},
  DataRetention:{enabled:false},
  AssistantConversationRetention:{enabled:false},
  EmpExitSync:{enabled:false},
  LLM_BASE_URL:dead,
  xray:{enabled:true,serviceUrl:'http://127.0.0.1:17910',licenseCheck:'off'},
});
// Prevent ordinary model imports from auto-creating/rebuilding shared indexes.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
console.info('[XRAY TEST] dev MongoDB; isolated Redis/session collection; API on http://127.0.0.1:5099');
await import('../../../../server.js');
