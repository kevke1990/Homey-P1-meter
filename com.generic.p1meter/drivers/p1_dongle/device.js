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
    this.log('P1 Dongle Device verwijderd');

    this.destroyed = true;
    this.disconnectTcp();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('ip') || changedKeys.includes('port')) {
      this.log('Netwerkinstellingen gewijzigd, TCP-verbinding herstarten...');

      this.disconnectTcp();
      this.connectTcp();
    }
  }

  connectTcp() {
    if (this.destroyed) {
      return;
    }

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
      if (this.client) {
        this.client.destroy();
      }
    });

    this.client.on('error', err => {
      this.error(`TCP Socket fout: ${err.message}`);
      this.setUnavailable(err.message).catch(setErr => {
        this.error('setUnavailable fout:', setErr);
      });
    });

    this.client.on('close', () => {
      this.log('TCP verbinding gesloten.');

      if (this.destroyed) {
        return;
      }

      this.setUnavailable('Verbinding verbroken').catch(err => {
        this.error('setUnavailable fout:', err);
      });

      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.connectTcp();
      }, 10000);
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
    // DSMR telegrams end with a checksum line such as !ABCD.
    // Wait until the complete checksum is present before processing.
    let endIndex;

    while ((endIndex = this.buffer.indexOf('!')) !== -1) {
      if (this.buffer.length < endIndex + 5) {
        return;
      }

      const telegram = this.buffer.substring(0, endIndex + 5);
      this.buffer = this.buffer.substring(endIndex + 5);

      this.processTelegram(telegram);
    }

    // Protect against an ever-growing buffer if the dongle sends invalid data.
    if (this.buffer.length > 65536) {
      this.error('P1 buffer was groter dan 64 KB; buffer wordt geleegd.');
      this.buffer = '';
    }
  }

  processTelegram(telegram) {
    try {
      this.setAvailable().catch(err => {
        this.error('setAvailable fout:', err);
      });

      const getValue = obisCode => {
        const regex = new RegExp(
          obisCode + '\\(([^\\*\\)]+)(?:\\*([a-zA-Z]+))?\\)'
        );
        const match = telegram.match(regex);

        if (!match) {
          return null;
        }

        const value = parseFloat(match[1]);
        return Number.isFinite(value) ? value : null;
      };

      // Actueel import/export vermogen.
      const powerImportKW = getValue('1-0:1\\.7\\.0');
      const powerExportKW = getValue('1-0:2\\.7\\.0');

      if (powerImportKW !== null) {
        this.setCapabilityValue(
          'measure_power',
          Math.round(powerImportKW * 1000)
        ).catch(err => this.error('measure_power fout:', err));
      }

      if (powerExportKW !== null) {
        this.setCapabilityValue(
          'measure_power.returned',
          Math.round(powerExportKW * 1000)
        ).catch(err => this.error('measure_power.returned fout:', err));
      }

      // Totale meterstanden: T1 + T2.
      const t1Consumed = getValue('1-0:1\\.8\\.1');
      const t2Consumed = getValue('1-0:1\\.8\\.2');
      const t1Produced = getValue('1-0:2\\.8\\.1');
      const t2Produced = getValue('1-0:2\\.8\\.2');

      if (t1Consumed !== null && t2Consumed !== null) {
        const totalConsumed = t1Consumed + t2Consumed;

        this.setCapabilityValue(
          'meter_power',
          totalConsumed
        ).catch(err => this.error('meter_power fout:', err));
      }

      if (t1Produced !== null && t2Produced !== null) {
        const totalProduced = t1Produced + t2Produced;

        this.setCapabilityValue(
          'meter_power.returned',
          totalProduced
        ).catch(err => this.error('meter_power.returned fout:', err));
      }

      // Gas meterstand.
      const gasMatch = telegram.match(
        /0-[0-9]:24\.2\.1\([^)]+\)\(([^)]+)\)/
      );

      if (gasMatch) {
        const gasValue = parseFloat(gasMatch[1]);

        if (Number.isFinite(gasValue)) {
          this.setCapabilityValue(
            'meter_gas',
            gasValue
          ).catch(err => this.error('meter_gas fout:', err));
        }
      }
    } catch (err) {
      this.error('Fout bij parsen DSMR telegram:', err);
    }
  }
}

module.exports = P1DongleDevice;
