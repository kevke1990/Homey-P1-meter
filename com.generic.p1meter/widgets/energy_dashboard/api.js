'use strict';

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function periodStart(period, now) {
  const d = new Date(now);
  if (period === 'week') {
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diff);
    return d.getTime();
  }
  if (period === 'month') {
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d.getTime();
  }
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function diff(a, b) {
  return finite(a) && finite(b) ? Math.max(0, b - a) : null;
}

function aggregate(history, start, end, bucketMs) {
  const points = history.filter(p => p.t >= start && p.t <= end).sort((a,b) => a.t - b.t);
  if (!points.length) return [];
  const out = [];
  let prev = null;
  for (const p of points) {
    if (!prev) { prev = p; continue; }
    const idx = Math.floor((p.t - start) / bucketMs);
    if (!out[idx]) out[idx] = { t: start + idx * bucketMs, importKwh: 0, exportKwh: 0, gasM3: 0, samples: 0, powerW: 0, returnedW: 0 };
    const item = out[idx];
    const ei = diff(prev.e, p.e);
    const eo = diff(prev.re, p.re);
    const gas = diff(prev.g, p.g);
    if (ei !== null) item.importKwh += ei;
    if (eo !== null) item.exportKwh += eo;
    if (gas !== null) item.gasM3 += gas;
    if (finite(p.p)) item.powerW += p.p;
    if (finite(p.r)) item.returnedW += p.r;
    item.samples++;
    prev = p;
  }
  return out.filter(Boolean).map(x => ({
    t: x.t,
    importKwh: x.importKwh,
    exportKwh: x.exportKwh,
    gasM3: x.gasM3,
    powerW: x.samples ? x.powerW / x.samples : 0,
    returnedW: x.samples ? x.returnedW / x.samples : 0
  }));
}

function totals(history, start, end) {
  const points = history.filter(p => p.t <= end).sort((a,b) => a.t-b.t);
  if (!points.length) return { importKwh: 0, exportKwh: 0, gasM3: 0 };
  let before = null;
  let first = null;
  let last = null;
  for (const p of points) {
    if (p.t < start) before = p;
    if (p.t >= start && !first) first = p;
    if (p.t >= start && p.t <= end) last = p;
  }
  const base = before || first;
  const endPoint = last || first;
  if (!base || !endPoint) return { importKwh: 0, exportKwh: 0, gasM3: 0 };
  return {
    importKwh: diff(base.e, endPoint.e) || 0,
    exportKwh: diff(base.re, endPoint.re) || 0,
    gasM3: diff(base.g, endPoint.g) || 0
  };
}

module.exports = {
  async getData({ homey, query }) {
    const deviceId = query?.deviceId;
    if (!deviceId) return { error: 'Geen Chargee Sparky apparaat geselecteerd.' };

    const device = await homey.devices.getDevice({ id: deviceId });
    if (!device) return { error: 'P1-meter niet gevonden.' };

    const history = (await Promise.resolve(device.getStoreValue('history'))) || [];
    const now = Date.now();
    const period = ['today','week','month'].includes(query?.period) ? query.period : 'today';
    const start = periodStart(period, now);
    const bucket = period === 'today' ? 60 * 60 * 1000 : period === 'week' ? 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const chart = aggregate(history, start, now, bucket);
    const summary = totals(history, start, now);

    const cap = id => device.capabilitiesObj?.[id]?.value ?? null;
    return {
      online: device.available !== false,
      deviceName: device.name,
      now: {
        powerW: cap('measure_power'),
        returnedW: cap('measure_power.returned'),
        meterKwh: cap('meter_power'),
        returnedKwh: cap('meter_power.returned'),
        gasM3: cap('meter_gas')
      },
      summary,
      chart,
      historyPoints: history.length,
      historyDays: history.length ? Math.round((now - history[0].t) / 86400000 * 10) / 10 : 0,
      generatedAt: now,
      prices: {
        electricity: Number(query?.electricityPrice ?? 0.30),
        feedin: Number(query?.feedinPrice ?? 0.15),
        gas: Number(query?.gasPrice ?? 1.00)
      },
      period
    };
  }
};
