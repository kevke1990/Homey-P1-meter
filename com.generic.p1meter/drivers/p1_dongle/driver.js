'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver is opgestart');

    // Automatische bypass: direct aanmaken als het apparaat nog niet bestaat
    this.checkAndCreateDevice();
  }

  async checkAndCreateDevice() {
    try {
      const devices = this.getDevices();
      if (devices.length === 0) {
        this.log('Geen apparaten gevonden, apparaat direct registreren in Homey...');
        
        // De correcte SDK v3 achterdeur om een apparaat programmatisch toe te voegen
        await this.addDevice({
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
        
        this.log('Apparaat is succesvol automatisch toegevoegd!');
      } else {
        this.log('Apparaat bestaat al.');
      }
    } catch (err) {
      this.error('Fout bij automatisch toevoegen:', err);
    }
  }
}

module.exports = P1DongleDriver;
