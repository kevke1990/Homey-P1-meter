'use strict';

const Homey = require('homey');
const net = require('net');

class P1DongleDevice extends Homey.Device {
  async onInit() {
    this.log('P1 Dongle Device (Chargee Sparky TCP) geïnitialiseerd');
    this.buffer = '';
    this.client = null;
    this.reconnectTimer = null;
    this.destroyed = false;

    // DSMR can deliver a telegram every second. Do not push every field into
    // Homey on every telegram: that creates unnecessary Homey/Insights work.
    this.lastCapabilityValues = Object.create(null);
    this.lastPowerUpdateAt = 0;
    this.lastReturnedPowerUpdateAt = 0;
    this.lastMeterUpdateAt = 0;
    this.lastGasUpdateAt = 0;
    this.firstTelegramProcessed = false;
    this.lastInsightPowerUpdateAt = 0;
    this.lastInsightMeterUpdateAt = 0;

    // Keep the live values in memory for the widget/API.
    this.liveData = {
      powerW: null,
      returnedW: null,
      meterKwh: null,
      returnedKwh: null,
      gasM3: null,
      updatedAt: 0,
    };

    // Explicitly apply the Homey Energy configuration to the paired device.
    // The driver manifest contains the same configuration for newly paired devices.
    // This makes upgrades work without requiring the user to re-pair the meter.
    await this.setEnergy({
      cumulative: true,
      cumulativeImportedCapability: 'meter_power',
      cumulativeExportedCapability: 'meter_power.returned',
    }).catch(err => this.error('setEnergy:', err));

    // v1.4.3: properly declared custom Insight capabilities.
    await this.ensureInsightCapabilities();

    this.connectTcp();
  }

  async ensureInsightCapabilities() {
    const capabilities = [
      'p1_grid_import_power',
      'p1_grid_export_power',
      'p1_imported_energy',
      'p1_exported_energy',
      'p1_gas_meter',
    ];

    for (const capability of capabilities) {
      if (!this.hasCapability(capability)) {
        try {
          this.log(`Insights capability toevoegen: ${capability}`);
          await this.addCapability(capability);
          this.log(`Insights capability toegevoegd: ${capability}`);
        } catch (err) {
          this.error(`Kon Insights capability ${capability} niet toevoegen:`, err);
        }
      }
    }
  }

  async setInsightValue(capability, value) {
    if (!this.hasCapability(capability)) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    try {
      await this.setCapabilityValue(capability, value);
    } catch (err) {
      this.error(`${capability}:`, err);
    }
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

      const now = Date.now();
      const POWER_INTERVAL = 2000;
      const METER_INTERVAL = 10000;

      const importKw = getValue('1-0:1\\.7\\.0');
      const exportKw = getValue('1-0:2\\.7\\.0');

      const t1In = getValue('1-0:1\\.8\\.1');
      const t2In = getValue('1-0:1\\.8\\.2');
      const t1Out = getValue('1-0:2\\.8\\.1');
      const t2Out = getValue('1-0:2\\.8\\.2');

      const totalIn = t1In !== null && t2In !== null ? t1In + t2In : null;
      const totalOut = t1Out !== null && t2Out !== null ? t1Out + t2Out : null;

      const gasMatch = telegram.match(/0-[0-9]:24\\.2\\.1\\([^)]*\\)\\(([^)]+)\\)/);
      const gas = gasMatch ? parseFloat(gasMatch[1]) : null;

      const powerW = importKw !== null ? Math.max(0, Math.round(importKw * 1000)) : null;
      const returnedW = exportKw !== null ? Math.max(0, Math.round(exportKw * 1000)) : null;

      if (!this.firstTelegramProcessed) {
        this.firstTelegramProcessed = true;
        this.log(`Eerste geldige DSMR-telegram ontvangen: import=${powerW}W export=${returnedW}W importMeter=${totalIn}kWh exportMeter=${totalOut}kWh gas=${gas}m3`);
      }

      // Always keep the in-memory live state current. The widget can use
      // capability values, while this state prevents unnecessary Homey writes.
      if (powerW !== null) this.liveData.powerW = powerW;
      if (returnedW !== null) this.liveData.returnedW = returnedW;
      if (totalIn !== null) this.liveData.meterKwh = totalIn;
      if (totalOut !== null) this.liveData.returnedKwh = totalOut;
      if (gas !== null && Number.isFinite(gas)) this.liveData.gasM3 = gas;
      this.liveData.updatedAt = now;

      // Live power: update at most every 2 seconds and only when the value changed.
      if (powerW !== null &&
          (now - this.lastPowerUpdateAt >= POWER_INTERVAL) &&
          this.lastCapabilityValues.measure_power !== powerW) {
        this.lastPowerUpdateAt = now;
        this.lastCapabilityValues.measure_power = powerW;
        this.setCapabilityValue('measure_power', powerW)
          .catch(err => this.error('measure_power:', err));
      }

      if (returnedW !== null &&
          (now - this.lastReturnedPowerUpdateAt >= POWER_INTERVAL) &&
          this.lastCapabilityValues['measure_power.returned'] !== returnedW) {
        this.lastReturnedPowerUpdateAt = now;
        this.lastCapabilityValues['measure_power.returned'] = returnedW;
        this.setCapabilityValue('measure_power.returned', returnedW)
          .catch(err => this.error('measure_power.returned:', err));
      }

      // Cumulative meters are only written periodically. Homey Insights does
      // not benefit from receiving identical values every second.
      if (now - this.lastMeterUpdateAt >= METER_INTERVAL) {
        this.lastMeterUpdateAt = now;

        if (totalIn !== null &&
            this.lastCapabilityValues.meter_power !== totalIn) {
          this.lastCapabilityValues.meter_power = totalIn;
          this.setCapabilityValue('meter_power', totalIn)
            .catch(err => this.error('meter_power:', err));
        }

        if (totalOut !== null &&
            this.lastCapabilityValues['meter_power.returned'] !== totalOut) {
          this.lastCapabilityValues['meter_power.returned'] = totalOut;
          this.setCapabilityValue('meter_power.returned', totalOut)
            .catch(err => this.error('meter_power.returned:', err));
        }

        if (gas !== null && Number.isFinite(gas) &&
            this.lastCapabilityValues.meter_gas !== gas) {
          this.lastCapabilityValues.meter_gas = gas;
          this.setCapabilityValue('meter_gas', gas)
            .catch(err => this.error('meter_gas:', err));
        }
      }

      // Explicit custom Insight capabilities. The first valid telegram
      // therefore creates the first Insight event; later writes are throttled.
      if (powerW !== null && (now - this.lastInsightPowerUpdateAt >= POWER_INTERVAL)) {
        this.lastInsightPowerUpdateAt = now;
        this.setInsightValue('p1_grid_import_power', powerW);
        if (returnedW !== null) this.setInsightValue('p1_grid_export_power', returnedW);
      }

      if (now - this.lastInsightMeterUpdateAt >= METER_INTERVAL) {
        this.lastInsightMeterUpdateAt = now;
        if (totalIn !== null) this.setInsightValue('p1_imported_energy', totalIn);
        if (totalOut !== null) this.setInsightValue('p1_exported_energy', totalOut);
        if (gas !== null && Number.isFinite(gas)) this.setInsightValue('p1_gas_meter', gas);
      }

      // IMPORTANT: do NOT call setAvailable() on every telegram.
      // Availability is set when the TCP connection succeeds and when it fails.
    } catch (err) {
      this.error('Fout bij parsen DSMR telegram:', err);
    }
  }
}

module.exports = P1DongleDevice;
