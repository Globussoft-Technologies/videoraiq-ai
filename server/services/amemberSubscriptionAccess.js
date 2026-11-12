import config from 'config';

// Read current access, rather than relying on the expiry copied at login.
export async function loadAmemberSubscriptions(userId, now = new Date()) {
  const url = new URL(`${config.get('aMember.baseUrl').replace(/\/+$/, '')}/access`);
  url.searchParams.set('_key', config.get('aMember.apiKey'));
  url.searchParams.set('_filter[user_id]', String(userId));
  url.searchParams.set('_count', '1000');
  const response = await fetch(url, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
  });
  // Do not include the URL/API key or response body in errors or logs.
  if (!response.ok) throw new Error(`aMember access lookup returned ${response.status}`);
  const access = await response.json();
  if (!access || typeof access !== 'object') throw new Error('Invalid aMember access response');
  const records = Object.entries(access).filter(([key]) => key !== '_total').map(([, value]) => value);
  if (Number(access._total) > records.length) throw new Error('Incomplete aMember access response');
  const subscriptions = {};
  for (const record of records) {
    if (!record?.product_id || !record.expire_date || Number.isNaN(Date.parse(record.expire_date))) {
      throw new Error('Invalid aMember access record');
    }
    if (record.begin_date) {
      const begin = Date.parse(record.begin_date);
      if (Number.isNaN(begin)) throw new Error('Invalid aMember access start date');
      if (begin > now.getTime()) continue;
    }
    const id = String(record.product_id);
    if (!subscriptions[id] || Date.parse(record.expire_date) > Date.parse(subscriptions[id])) {
      subscriptions[id] = record.expire_date;
    }
  }
  return subscriptions;
}
