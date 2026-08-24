'use strict';

const Homey = require('homey');
const net = require('net');

class P1DongleDevice extends Homey.Device {
  async onInit() {
    this.log('P1 Dongle Device (Sparky TCP) is geïnitialiseerd');
    
    this.buffer = '';
    this.connectTcp();
  }

  async onDeleted() {
    this.log('P1 Dongle Device verwijderd');
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
    const settings = this.getSettings();
    const host = settings.ip || '192.168.8.224';
    const port = settings.port || 3602; // Chargee Sparky DSMR TCP poort

    this.log(`Verbinden met Chargee Sparky op ${host}:${port}...`);

    this.client = new net.Socket();

    this.client.connect(port, host, () => {
      this.log('Verbonden met TCP-stream van de Sparky!');
      this.setAvailable().catch(this.error);
    });

    this.client.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.parseTelegramBuffer();
    });

    this.client.on('error', (err) => {
      this.error('TCP Socket fout:', err.message);
      this.setUnavailable(err.message).catch(this.error);
    });

    this.client.on('close', () => {
      this.log('TCP verbinding gesloten. Over 10 seconden opnieuw verbinden...');
      this.setUnavailable('Verbinding verbroken').catch(this.error);
      
      // Automatisch herverbinden na 10 seconden
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.connectTcp();
      }, 10000);
    });
  }

  disconnectTcp() {
    clearTimeout(this.reconnectTimer);
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }

  parseTelegramBuffer() {
    // DSMR telegrammen beginnen met '/' en eindigen met '!' gevolgd door een CRC checksum
    let endIndex;
    while ((endIndex = this.buffer.indexOf('!')) !== -1) {
      // Check of het hele telegram binnen is (inclusief checksum achter '!')
      if (this.buffer.length >= endIndex + 5) {
        const telegram = this.buffer.substring(0, endIndex + 5);
        this.buffer = this.buffer.substring(endIndex + 5); // Rest bewaren
        
        this.processTelegram(telegram);
      } else {
        break; // Wacht op meer data voor dit telegram
      }
    }

    // Voorkom dat de buffer oneindig groeit als er geen '/' wordt gevonden
    if (this.buffer.length > 65536) {
      this.buffer = '';
    }
  }

  processTelegram(telegram) {
    try {
      this.setAvailable().catch(this.error);

      // Helper functie om waardes uit DSMR OBIS codes te halen (bijv. 1-0:1.7.0(00.423*kW))
      const getValue = (obisCode) => {
        const regex = new RegExp(obisCode + '\\(([^\\*\\)]+)(?:\\*([a-zA-Z]+))?\\)');
        const match = telegram.match(regex);
        return match ? parseFloat(match[1]) : null;
      };

      // 1. Actueel vermogen (Watts) omzetten naar W
      const powerImportKW = getValue('1-0:1\\.7\\.0'); // Huidig verbruik
      const powerExportKW = getValue('1-0:2\\.7\\.0'); // Huidige teruglevering

      if (powerImportKW !== null) {
        this.setCapabilityValue('measure_power', Math.round(powerImportKW * 1000)).catch(this.error);
      }
      if (powerExportKW !== null) {
        this.setCapabilityValue('measure_power.returned', Math.round(powerExportKW * 1000)).catch(this.error);
      }

      // 2. Cumulatieve standen (kWh) voor T1 en T2
      const t1Consumed = getValue('1-0:1\\.8\\.1');
      const t2Consumed = getValue('1-0:1\\.8\\.2');
      const t1Produced = getValue('1-0:2\\.8\\.1');
      const t2Produced = getValue('1-0:2\\.8\\.2');

      if (t1Consumed !== null) this.setCapabilityValue('meter_consumed_t1', t1Consumed).catch(this.error);
      if (t2Consumed !== null) this.setCapabilityValue('meter_consumed_t2', t2Consumed).catch(this.error);
      if (t1Produced !== null) this.setCapabilityValue('meter_produced_t1', t1Produced).catch(this.error);
      if (t2Produced !== null) this.setCapabilityValue('meter_produced_t2', t2Produced).catch(this.error);

      if (t1Consumed !== null && t2Consumed !== null) {
        this.setCapabilityValue('meter_power', t1Consumed + t2Consumed).catch(this.error);
      }
      if (t1Produced !== null && t2Produced !== null) {
        this.setCapabilityValue('meter_power.returned', t1Produced + t2Produced).catch(this.error);
      }

      // 3. Gas (m3) - OBIS code verschilt per slimme meter (vaak 0-1:24.2.1 of m-bus)
      const gasMatch = telegram.match(/0-[0-9]:24\.2\.1\([^)]+\)\(([^)]+)\)/);
      if (gasMatch) {
        const gasValue = parseFloat(gasMatch[1]);
        if (!isNaN(gasValue)) {
          this.setCapabilityValue('meter_gas', gasValue).catch(this.error);
        }
      }

    } catch (err) {
      this.error('Fout bij parsen DSMR telegram:', err);
    }
  }
}

module.exports = P1DongleDevice;
