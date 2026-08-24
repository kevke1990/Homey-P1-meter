'use strict';

const Homey = require('homey');
const net = require('net');

class P1DongleDevice extends Homey.Device {
  async onInit() {
    this.log('P1 Dongle Device (Sparky TCP) is geïnitialiseerd');
    this.buffer = '';
    this.client = null;
    this.reconnectTimer = null;
    this.destroyed = false;
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
      this.log(`Verbonden met TCP-stream van de Sparky op ${host}:${port}`);
      this.setAvailable().catch(err => this.error('setAvailable fout:', err));
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
      this.setUnavailable(err.message).catch(setErr => this.error('setUnavailable fout:', setErr));
    });

    this.client.on('close', () => {
      if (this.destroyed) return;
      this.log('TCP verbinding gesloten; opnieuw verbinden over 10 seconden.');
      this.setUnavailable('Verbinding verbroken').catch(err => this.error('setUnavailable fout:', err));
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
      this.setAvailable().catch(err => this.error('setAvailable fout:', err));

      const getValue = obisCode => {
        const match = telegram.match(new RegExp(obisCode + '\\(([^\\*\\)]+)(?:\\*([a-zA-Z]+))?\\)'));
        if (!match) return null;
        const value = parseFloat(match[1]);
        return Number.isFinite(value) ? value : null;
      };

      const importKw = getValue('1-0:1\\.7\\.0');
      const exportKw = getValue('1-0:2\\.7\\.0');

      if (importKw !== null)
        this.setCapabilityValue('measure_power', Math.round(importKw * 1000)).catch(err => this.error('measure_power:', err));
      if (exportKw !== null)
        this.setCapabilityValue('measure_power.returned', Math.round(exportKw * 1000)).catch(err => this.error('measure_power.returned:', err));

      const t1In = getValue('1-0:1\\.8\\.1');
      const t2In = getValue('1-0:1\\.8\\.2');
      const t1Out = getValue('1-0:2\\.8\\.1');
      const t2Out = getValue('1-0:2\\.8\\.2');

      if (t1In !== null && t2In !== null)
        this.setCapabilityValue('meter_power', t1In + t2In).catch(err => this.error('meter_power:', err));
      if (t1Out !== null && t2Out !== null)
        this.setCapabilityValue('meter_power.returned', t1Out + t2Out).catch(err => this.error('meter_power.returned:', err));

      const gasMatch = telegram.match(/0-[0-9]:24\.2\.1\([^)]+\)\(([^)]+)\)/);
      if (gasMatch) {
        const gas = parseFloat(gasMatch[1]);
        if (Number.isFinite(gas))
          this.setCapabilityValue('meter_gas', gas).catch(err => this.error('meter_gas:', err));
      }
    } catch (err) {
      this.error('Fout bij parsen DSMR telegram:', err);
    }
  }
}

module.exports = P1DongleDevice;
