// Keeps the user's dev access token on THIS machine. The GPU receives only
// HLS bytes through the SSH reverse tunnel and an expiring opaque reference.
import crypto from 'node:crypto';
import axios from 'axios';
const streams = new Map();
const sessionStreams = new Map();

// Only opaque references minted here can be revoked. Normal production
// stream URLs never enter these maps.
export function releaseLocalHls(url) {
  if (!url) return;
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (parsed.origin !== 'http://127.0.0.1:15099') return;
  const id = /^\/internal\/xray-test\/hls\/([a-f0-9]{48})\/playlist\.m3u8$/.exec(parsed.pathname)?.[1];
  if (!id) return;
  streams.delete(id);
  for (const [sessionId, reference] of sessionStreams) {
    if (reference === url) sessionStreams.delete(sessionId);
  }
}

export function bindSessionLocalHls(sessionId, url) {
  if (process.env.XRAY_LOCAL_TEST_MODE === 'true') sessionStreams.set(sessionId, url);
}

export function releaseSessionLocalHls(sessionId) {
  const url = sessionStreams.get(sessionId);
  sessionStreams.delete(sessionId);
  releaseLocalHls(url);
}

export function registerLocalHls(url, token) {
  if (process.env.XRAY_LOCAL_TEST_MODE !== 'true') throw new Error('Local HLS relay is disabled');
  const source = new URL(url);
  const allowed = (process.env.XRAY_LOCAL_STREAM_HOSTS || '').split(',');
  if (!allowed.includes(source.host) || !['http:','https:'].includes(source.protocol)) {
    throw new Error('Selected stream host is not in the local test allowlist');
  }
  if (!token) throw new Error('Sign in locally before opening X-Ray');
  for (const [id,s] of streams) if(s.until<Date.now()) {
    releaseLocalHls(`http://127.0.0.1:15099/internal/xray-test/hls/${id}/playlist.m3u8`);
  }
  if(streams.size>=8) throw new Error('Local relay capacity reached');
  source.searchParams.delete('token');
  const id=crypto.randomBytes(24).toString('hex');
  streams.set(id,{source,token,until:Date.now()+180_000,files:new Map([['playlist.m3u8',source]])});
  return `http://127.0.0.1:15099/internal/xray-test/hls/${id}/playlist.m3u8`;
}

export async function localHlsRelay(req,res) {
  if(process.env.XRAY_LOCAL_TEST_MODE!=='true') return res.sendStatus(404);
  const actual=Buffer.from(String(req.get('X-API-Key')||''));
  const expected=Buffer.from(String(process.env.XRAY_API_KEY||''));
  if(!expected.length || actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) return res.sendStatus(401);
  const entry=streams.get(req.params.id);
  if(!entry || entry.until<Date.now()) return res.sendStatus(404);
  const target=entry.files.get(req.params.file);
  if(!target) return res.sendStatus(404);
  try {
    const url=new URL(target);
    url.searchParams.set('token',entry.token);
    const upstream=await axios.get(url.href,{responseType:'arraybuffer',timeout:6000,maxRedirects:0,maxContentLength:16*1024*1024});
    res.set('Cache-Control','no-store');
    if(req.params.file==='playlist.m3u8') {
      const text=Buffer.from(upstream.data).toString('utf8');
      if(!text.startsWith('#EXTM3U') || /#EXT-X-(KEY|MAP|STREAM-INF):/.test(text)) throw new Error('expected unencrypted MPEG-TS media playlist');
      const body=text.split(/\r?\n/).map(line=>{
        if(!line.trim() || line.startsWith('#')) return line;
        const segment=new URL(line.trim(),entry.source);
        if(segment.origin!==entry.source.origin || !segment.pathname.startsWith(entry.source.pathname.slice(0,entry.source.pathname.lastIndexOf('/')+1))) throw new Error('cross-camera HLS path refused');
        segment.searchParams.delete('token');
        const ref=crypto.createHash('sha256').update(segment.href).digest('hex').slice(0,24)+'.ts';
        entry.files.set(ref,segment);
        return ref;
      }).join('\n');
      if(entry.files.size>512) for(const key of [...entry.files.keys()].slice(1,128)) entry.files.delete(key);
      return res.type('application/vnd.apple.mpegurl').send(body);
    }
    return res.type('video/mp2t').send(Buffer.from(upstream.data));
  } catch(error) {
    console.error(`[XRAY TEST] HLS upstream failed status=${error.response?.status||0} type=${error.name}`);
    return res.status(503).json({error:'stream_not_ready'});
  }
}
