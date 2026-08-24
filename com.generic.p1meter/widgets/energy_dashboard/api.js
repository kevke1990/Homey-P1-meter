'use strict';

/**
 * Energy dashboard API.
 *
 * The widget passes the selected P1 device ID as ?deviceId=...
 * We read the live capabilities from the device and historical values
 * from Homey Insights. Historical cumulative meters are converted to
 * consumption/production by calculating the positive delta between
 * consecutive readings.
 */

function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function diffSeries(values) {
  const result = [];
  for (let i = 1; i < values.length; i++) {
    const previous = numeric(values[i - 1].v);
    const current = numeric(values[i].v);
    if (previous === null || current === null) continue;
    const delta = current - previous;
    if (delta >= 0 && delta < 1000) {
      result.push({
        t: values[i].t,
        v: delta,
      });
    }
  }
  return result;
}

function sum(series) {
  return series.reduce((total, point) => total + (numeric(point.v) || 0), 0);
}

function bucketByHour(series, hours = 24) {
  const now = Date.now();
  const buckets = Array.from({ length: hours }, (_, i) => ({
    label: new Date(now - (hours - 1 - i) * 3600000).getHours().toString().padStart(2, '0') + ':00',
    value: 0,
  }));

  const start = now - hours * 3600000;

  for (const point of series) {
    const time = new Date(point.t).getTime();
    if (!Number.isFinite(time) || time < start) continue;

    const index = Math.min(
      hours - 1,
      Math.max(0, Math.floor((time - start) / 3600000))
    );

    buckets[index].value += numeric(point.v) || 0;
  }

  return buckets;
}

function bucketByDay(series, days = 7) {
  const buckets = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    buckets.push({
      date,
      label: ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'][date.getDay()],
      value: 0,
    });
  }

  for (const point of series) {
    const date = new Date(point.t);
    date.setHours(0, 0, 0, 0);

    const bucket = buckets.find(b => b.date.getTime() === date.getTime());
    if (bucket) bucket.value += numeric(point.v) || 0;
  }

  return buckets.map(({ label, value }) => ({ label, value }));
}

async function getLogSeries(homey, deviceId, capability, resolution) {
  const logs = await homey.insights.getLogs();
  const uri = `homey:device:${deviceId}`;

  const candidates = Array.isArray(logs)
    ? logs.filter(log => log && log.uri === uri && log.id === capability)
    : [];

  if (!candidates.length) {
    return [];
  }

  const log = candidates[0];

  try {
    const entries = await homey.insights.getLogEntries({
      uri: log.uri,
      id: log.id,
      resolution,
    });

    return Array.isArray(entries?.values) ? entries.values : [];
  } catch (error) {
    return [];
  }
}

async function getData({ homey, query }) {
  const deviceId = query?.deviceId;

  if (!deviceId) {
    throw new Error('Geen P1-meter geselecteerd.');
  }

  const device = await homey.devices.getDevice({ id: deviceId });

  if (!device) {
    throw new Error('P1-meter niet gevonden.');
  }

  const caps = device.capabilitiesObj || {};

  const currentImportW = numeric(caps.measure_power?.value) || 0;
  const currentExportW = numeric(caps['measure_power.returned']?.value) || 0;
  const totalImportKwh = numeric(caps.meter_power?.value) || 0;
  const totalExportKwh = numeric(caps['meter_power.returned']?.value) || 0;
  const totalGasM3 = numeric(caps.meter_gas?.value) || 0;

  const [import24, export24, gas24, import7, export7, gas7] =
    await Promise.all([
      getLogSeries(homey, deviceId, 'meter_power', 'last24Hours'),
      getLogSeries(homey, deviceId, 'meter_power.returned', 'last24Hours'),
      getLogSeries(homey, deviceId, 'meter_gas', 'last24Hours'),
      getLogSeries(homey, deviceId, 'meter_power', 'last7Days'),
      getLogSeries(homey, deviceId, 'meter_power.returned', 'last7Days'),
      getLogSeries(homey, deviceId, 'meter_gas', 'last7Days'),
    ]);

  const import24Delta = diffSeries(import24);
  const export24Delta = diffSeries(export24);
  const gas24Delta = diffSeries(gas24);
  const import7Delta = diffSeries(import7);
  const export7Delta = diffSeries(export7);
  const gas7Delta = diffSeries(gas7);

  const todayImport = bucketByDay(import7Delta, 7).slice(-1)[0]?.value || 0;
  const todayExport = bucketByDay(export7Delta, 7).slice(-1)[0]?.value || 0;
  const todayGas = bucketByDay(gas7Delta, 7).slice(-1)[0]?.value || 0;

  return {
    device: {
      id: device.id,
      name: device.name,
      available: device.available !== false,
    },
    live: {
      importW: currentImportW,
      exportW: currentExportW,
      netW: currentImportW - currentExportW,
      totalImportKwh,
      totalExportKwh,
      totalGasM3,
    },
    today: {
      importKwh: todayImport,
      exportKwh: todayExport,
      netKwh: todayImport - todayExport,
      gasM3: todayGas,
    },
    charts: {
      import24: bucketByHour(import24Delta, 24),
      export24: bucketByHour(export24Delta, 24),
      gas24: bucketByHour(gas24Delta, 24),
      import7: bucketByDay(import7Delta, 7),
      export7: bucketByDay(export7Delta, 7),
      gas7: bucketByDay(gas7Delta, 7),
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getData };
