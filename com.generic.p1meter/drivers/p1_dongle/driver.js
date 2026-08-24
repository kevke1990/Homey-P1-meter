'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver is opgestart');
  }

  async onPair(session) {
    let pairingIp = '192.168.8.224';
    let pairingPort = 3602;

    // 1. Vang de gegevens op die je in de wizard invult
    session.setHandler('set_settings', async (data) => {
      if (data.ip) pairingIp = data.ip;
      if (data.port) pairingPort = parseInt(data.port, 10);
      return true;
    });

    // 2. Voeg het apparaat toe zodra je op Volgende/Toevoegen drukt
    session.setHandler('list_devices', async () => {
      return [
        {
          name: `Chargee Sparky P1 (${pairingIp})`,
          data: {
            id: `sparky_p1_${pairingIp}`
          },
          settings: {
            ip: pairingIp,
            port: pairingPort
          }
        }
      ];
    });
  }
}

module.exports = P1DongleDevice => P1DongleDriver; // of standaard module.exports = P1DongleDriver;
