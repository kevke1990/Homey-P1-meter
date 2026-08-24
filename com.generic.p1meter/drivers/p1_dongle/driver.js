'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver is opgestart');

    // Wacht even tot de driver volledig is geladen en maak het apparaat dan direct aan
    setTimeout(() => {
      this.autoCreateDevice();
    }, 1000);
  }

  async autoCreateDevice() {
    try {
      const devices = this.getDevices();

      if (devices.length === 0) {
        this.log('Geen apparaten gevonden, Chargee Sparky automatisch aanmaken...');

        await this.homey.drivers.getDriver('p1_dongle').createDevice({
          name: 'Chargee Sparky P1 Meter',
          data: {
            id: 'sparky_p1_192.168.8.224'
          },
          settings: {
            ip: '192.168.8.224',
            port: 3602,
            polling_interval: 10
          }
        });

        this.log('Chargee Sparky is succesvol automatisch toegevoegd aan Homey!');
      } else {
        this.log('Apparaat bestaat al in deze driver.');
      }
    } catch (err) {
      this.error('Fout bij automatisch aanmaken:', err);
    }
  }
}

module.exports = P1DongleDriver;
