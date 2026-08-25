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
    this.reconnectDelay = 5000;

    // Keep the last values locally for the dashboard. Homey remains the
    // source of truth for Energy and Insights through the standard capabilities.
    this.liveData = {
      powerW: null,
      returnedW: null,
      meterKwh: null,
      returnedKwh: null,
      gasM3: null,
      updatedAt: 0,
    };

    // Avoid unnecessary writes while still updating live power frequently.
    this.lastValues = Object.create(null);
    this.lastPowerWriteAt = 0;
    this.lastReturnedPowerWriteAt = 0;
    this.lastMeterWriteAt = 0;
    this.firstTelegramProcessed = false;

    // Make sure the device uses Homey's normal cumulative energy model.
    // The same configuration is present in driver.compose.json for newly paired devices.
    try {
      await this.setEnergy({
        cumulative: true,
        cumulativeImportedCapability: 'meter_power',
        cumulativeExportedCapability: 'meter_power.returned',
      });
    } catch (err) {
      this.error('Kon Homey Energy-configuratie niet instellen:', err);
    }

    this.connectTcp();
  }

  async onUninit() {
    this.destroyed = true;
    this.disconnectTcp();
  }

  async onDeleted() {
    this.destroyed = true;
    this.disconnectTcp();
    this.log('P1 Dongle Device verwijderd');
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('ip') || changedKeys.includes('port')) {
      this.log('Netwerkinstellingen gewijzigd; TCP-verbinding wordt herstart.');
      this.reconnectDelay = 5000;
      this.disconnectTcp();
      this.connectTcp();
    }
  }

  connectTcp() {
    if (this.destroyed) return;

    this.disconnectTcp();

    const settings = this.getSettings();
    const host = String(settings.ip || '192.168.8.224').trim();
    const port = Number(settings.port) || 3602;

    this.log(`Verbinden met Chargee Sparky op ${host}:${port}...`);

    const socket = new net.Socket();
    this.client = socket;
    socket.setTimeout(15000);

    socket.connect(port, host, async () => {
      if (this.client !== socket || this.destroyed) {
        socket.destroy();
        return;
      }

      this.reconnectDelay = 5000;
      this.log(`Verbonden met P1 TCP-stream op ${host}:${port}`);

      try {
        await this.setAvailable();
      } catch (err) {
        this.error('setAvailable:', err);
      }
    });

    socket.on('data', chunk => {
      if (this.destroyed || this.client !== socket) return;
      this.buffer += chunk.toString('utf8');
      this.parseTelegramBuffer();
    });

    socket.on('timeout', () => {
      this.error('TCP Socket timeout; verbinding wordt opnieuw opgebouwd.');
      socket.destroy();
    });

    socket.on('error', err => {
      if (this.client !== socket || this.destroyed) return;
      this.error(`TCP Socket fout: ${err.message}`);
      this.setUnavailable(err.message).catch(setErr => this.error('setUnavailable:', setErr));
    });

    socket.on('close', () => {
      if (this.client === socket) this.client = null;
      if (this.destroyed) return;

      this.log(`TCP verbinding gesloten; opnieuw verbinden over ${Math.round(this.reconnectDelay / 1000)} seconden.`);
      this.setUnavailable('Verbinding verbroken').catch(err => this.error('setUnavailable:', err));

      clearTimeout(this.reconnectTimer);
      const delay = this.reconnectDelay;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
      this.reconnectTimer = setTimeout(() => this.connectTcp(), delay);
    });
  }

  disconnectTcp() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    const socket = this.client;
    this.client = null;
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
    }
  }

  parseTelegramBuffer() {
    let endIndex;

    while ((endIndex = this.buffer.indexOf('!')) !== -1) {
      // DSMR telegrams end in ! followed by CRC (4 hex chars). Some P1 bridges
      // may omit the CRC; accepting the telegram at ! keeps compatibility with
      // those bridges while the normal 4-character CRC is still consumed when present.
      const remaining = this.buffer.length - endIndex;
      if (remaining < 5) return;

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
      // Read the first numeric value in an OBIS field. Escape the OBIS code
      // here instead of embedding regex escapes in the caller; this avoids
      // JavaScript string/RegExp escaping problems.
      const getValue = obisCode => {
        const escaped = obisCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = telegram.match(new RegExp(`${escaped}\\(\\s*([-+]?\\d+(?:[.,]\\d+)?)`));
        if (!match) return null;
        const value = Number.parseFloat(match[1].replace(',', '.'));
        return Number.isFinite(value) ? value : null;
      };

      const now = Date.now();
      const POWER_INTERVAL = 2000;
      const METER_INTERVAL = 10000;

      // DSMR OBIS values are expressed in kW for instantaneous power.
      const importKw = getValue('1-0:1.7.0');
      const exportKw = getValue('1-0:2.7.0');

      const t1In = getValue('1-0:1.8.1');
      const t2In = getValue('1-0:1.8.2');
      const t1Out = getValue('1-0:2.8.1');
      const t2Out = getValue('1-0:2.8.2');

      const totalIn = t1In !== null && t2In !== null ? t1In + t2In : null;
      const totalOut = t1Out !== null && t2Out !== null ? t1Out + t2Out : null;

      // Gas is normally 0-1:24.2.1; the flexible expression also accepts
      // bridges that expose another DSMR channel prefix.
      const gasMatch = telegram.match(/(?:^|\n)0-[0-9]:24\.2\.1\([^)]*\)\(([^)]+)\)/);
      const gas = gasMatch ? Number.parseFloat(gasMatch[1]) : null;

      const powerW = importKw !== null ? Math.max(0, Math.round(importKw * 1000)) : null;
      const returnedW = exportKw !== null ? Math.max(0, Math.round(exportKw * 1000)) : null;

      if (!this.firstTelegramProcessed) {
        this.firstTelegramProcessed = true;
        this.log(`Eerste geldige DSMR-telegram ontvangen: import=${powerW}W export=${returnedW}W importMeter=${totalIn}kWh exportMeter=${totalOut}kWh gas=${gas}m3`);
      }

      if (powerW !== null) this.liveData.powerW = powerW;
      if (returnedW !== null) this.liveData.returnedW = returnedW;
      if (totalIn !== null) this.liveData.meterKwh = totalIn;
      if (totalOut !== null) this.liveData.returnedKwh = totalOut;
      if (gas !== null && Number.isFinite(gas)) this.liveData.gasM3 = gas;
      this.liveData.updatedAt = now;

      // First value is written immediately; unchanged values are skipped.
      if (powerW !== null &&
          (now - this.lastPowerWriteAt >= POWER_INTERVAL) &&
          this.lastValues.measure_power !== powerW) {
        this.lastPowerWriteAt = now;
        this.lastValues.measure_power = powerW;
        this.writeCapability('measure_power', powerW);
      }

      if (returnedW !== null &&
          (now - this.lastReturnedPowerWriteAt >= POWER_INTERVAL) &&
          this.lastValues['measure_power.returned'] !== returnedW) {
        // Keep both live power capabilities on the same normal cadence.
        this.lastReturnedPowerWriteAt = now;
        this.lastValues['measure_power.returned'] = returnedW;
        this.writeCapability('measure_power.returned', returnedW);
      }

      // Cumulative values are deliberately throttled to avoid flooding Homey.
      if (now - this.lastMeterWriteAt >= METER_INTERVAL) {
        this.lastMeterWriteAt = now;

        if (totalIn !== null && this.lastValues.meter_power !== totalIn) {
          this.lastValues.meter_power = totalIn;
          this.writeCapability('meter_power', totalIn);
        }

        if (totalOut !== null && this.lastValues['meter_power.returned'] !== totalOut) {
          this.lastValues['meter_power.returned'] = totalOut;
          this.writeCapability('meter_power.returned', totalOut);
        }

        if (gas !== null && Number.isFinite(gas) && this.lastValues.meter_gas !== gas) {
          this.lastValues.meter_gas = gas;
          this.writeCapability('meter_gas', gas);
        }
      }
    } catch (err) {
      this.error('Fout bij parsen DSMR telegram:', err);
    }
  }

  writeCapability(capability, value) {
    this.setCapabilityValue(capability, value)
      .catch(err => this.error(`${capability}:`, err));
  }
}

module.exports = P1DongleDevice;
