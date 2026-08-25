'use strict';

const Homey = require('homey');
const net = require('net');

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const HISTORY_DAYS = 31;
const HISTORY_MAX = Math.ceil((HISTORY_DAYS * 24 * 60) / 5) + 20;

class P1DongleDevice extends Homey.Device {
  async onInit() {
    this.log('P1 Dongle Device (Chargee Sparky TCP) geïnitialiseerd');
    this.buffer = '';
    this.client = null;
    this.reconnectTimer = null;
    this.destroyed = false;
    this.lastHistorySampleAt = 0;
    this.historyBusy = false;
    this.connectTcp();
  }

  async onDeleted() {
    this.destroyed = true;
    this.disconnectTcp();
    this.log('P1 Dongle Device verwijderd');
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('ip') || changedKeys.includes('port')) {
      this.log('Netwerkinstellingen gewijzigd; TCP-verbinding wordt herstart.');
      this.disconnectTcp();
      this.connectTcp();
    }
  }

  connectTcp() {
    if (this.destroyed) return;
    this.disconnectTcp();

    const settings = this.getSettings();
    const host = settings.ip || '192.168.8.224';
    const port = Number(settings.port) || 3602;

    this.log(`Verbinden met Chargee Sparky op ${host}:${port}...`);
    this.client = new net.Socket();
    this.client.setTimeout(15000);

    this.client.connect(port, host, () => {
      this.log(`Verbonden met P1 TCP-stream op ${host}:${port}`);
      this.setAvailable().catch(err => this.error('setAvailable:', err));
    });

    this.client.on('data', chunk => {
      this.buffer += chunk.toString('utf8');
      this.parseTelegramBuffer();
    });

    this.client.on('timeout', () => {
      this.error('TCP Socket timeout');
      if (this.client) this.client.destroy();
    });

    this.client.on('error', err => {
      this.error(`TCP Socket fout: ${err.message}`);
      this.setUnavailable(err.message).catch(setErr => this.error('setUnavailable:', setErr));
    });

    this.client.on('close', () => {
      if (this.destroyed) return;
      this.log('TCP verbinding gesloten; opnieuw verbinden over 10 seconden.');
      this.setUnavailable('Verbinding verbroken').catch(err => this.error('setUnavailable:', err));
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connectTcp(), 10000);
    });
  }

  disconnectTcp() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.client) {
      this.client.removeAllListeners();
      this.client.destroy();
      this.client = null;
    }
  }

  parseTelegramBuffer() {
    let endIndex;
    while ((endIndex = this.buffer.indexOf('!')) !== -1) {
      if (this.buffer.length < endIndex + 5) return;
      const telegram = this.buffer.substring(0, endIndex + 5);
      this.buffer = this.buffer.substring(endIndex + 5);
      this.processTelegram(telegram);
    }
    if (this.buffer.length > 65536) {
      this.error('P1 buffer groter dan 64 KB; buffer wordt geleegd.');
      this.buffer = '';
    }
  }

  processTelegram(telegram) {
    try {
      const getValue = obisCode => {
        const match = telegram.match(new RegExp(obisCode + '\\(([^\\*\\)]+)(?:\\*([a-zA-Z]+))?\\)'));
        if (!match) return null;
        const value = parseFloat(match[1]);
        return Number.isFinite(value) ? value : null;
      };

      const importKw = getValue('1-0:1\\.7\\.0');
      const exportKw = getValue('1-0:2\\.7\\.0');

      if (importKw !== null) {
        this.setCapabilityValue('measure_power', Math.max(0, Math.round(importKw * 1000)))
          .catch(err => this.error('measure_power:', err));
      }
      if (exportKw !== null) {
        this.setCapabilityValue('measure_power.returned', Math.max(0, Math.round(exportKw * 1000)))
          .catch(err => this.error('measure_power.returned:', err));
      }

      const t1In = getValue('1-0:1\\.8\\.1');
      const t2In = getValue('1-0:1\\.8\\.2');
      const t1Out = getValue('1-0:2\\.8\\.1');
      const t2Out = getValue('1-0:2\\.8\\.2');

      const totalIn = t1In !== null && t2In !== null ? t1In + t2In : null;
      const totalOut = t1Out !== null && t2Out !== null ? t1Out + t2Out : null;

      if (totalIn !== null) {
        this.setCapabilityValue('meter_power', totalIn)
          .catch(err => this.error('meter_power:', err));
      }
      if (totalOut !== null) {
        this.setCapabilityValue('meter_power.returned', totalOut)
          .catch(err => this.error('meter_power.returned:', err));
      }

      const gasMatch = telegram.match(/0-[0-9]:24\\.2\\.1\\([^)]*\\)\\(([^)]+)\\)/);
      const gas = gasMatch ? parseFloat(gasMatch[1]) : null;
      if (gas !== null && Number.isFinite(gas)) {
        this.setCapabilityValue('meter_gas', gas)
          .catch(err => this.error('meter_gas:', err));
      }

      this.setAvailable().catch(err => this.error('setAvailable:', err));

      if (importKw !== null || exportKw !== null || totalIn !== null || totalOut !== null || gas !== null) {
        this.recordHistory({
          powerW: importKw !== null ? importKw * 1000 : null,
          returnedW: exportKw !== null ? exportKw * 1000 : null,
          meterKwh: totalIn,
          returnedKwh: totalOut,
          gasM3: gas
        }).catch(err => this.error('history:', err));
      }
    } catch (err) {
      this.error('Fout bij parsen DSMR telegram:', err);
    }
  }

  async recordHistory(sample) {
    const now = Date.now();
    if (this.historyBusy || now - this.lastHistorySampleAt < SAMPLE_INTERVAL_MS) return;
    if (sample.meterKwh === null && sample.returnedKwh === null && sample.gasM3 === null) return;

    this.historyBusy = true;
    try {
      const history = (await Promise.resolve(this.getStoreValue('history'))) || [];
      const previous = history.length ? history[history.length - 1] : null;
      const point = {
        t: now,
        p: Number.isFinite(sample.powerW) ? Math.round(sample.powerW) : null,
        r: Number.isFinite(sample.returnedW) ? Math.round(sample.returnedW) : null,
        e: Number.isFinite(sample.meterKwh) ? sample.meterKwh : null,
        re: Number.isFinite(sample.returnedKwh) ? sample.returnedKwh : null,
        g: Number.isFinite(sample.gasM3) ? sample.gasM3 : null
      };

      // Avoid storing duplicate/older cumulative readings.
      if (previous && point.t <= previous.t) return;
      history.push(point);
      const cutoff = now - HISTORY_DAYS * 24 * 60 * 60 * 1000;
      const pruned = history.filter(x => x.t >= cutoff).slice(-HISTORY_MAX);
      await this.setStoreValue('history', pruned);
      this.lastHistorySampleAt = now;
    } finally {
      this.historyBusy = false;
    }
  }
}

module.exports = P1DongleDevice;
