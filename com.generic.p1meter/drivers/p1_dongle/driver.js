'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver is opgestart');

    // Controleer direct bij het starten van de driver of het apparaat al bestaat
    this.ensureDeviceExists();
  }

  async ensureDeviceExists() {
    try {
      const devices = this.getDevices();

      if (devices.length === 0) {
        this.log('Geen P1 meter gevonden in deze driver, automatisch aanmaken...');

        // Dit is de officiële SDK v3 manier om vanuit de driver een apparaat toe te voegen
        await this.createDevice({
          name: 'P1 Meter (Chargee Sparky)',
          data: {
            id: 'sparky_p1_192.168.8.224'
          },
          settings: {
            ip: '192.168.8.224',
            polling_interval: 10
          }
        });

        this.log('P1 Meter is succesvol aangemaakt door de driver!');
      } else {
        this.log('P1 Meter bestaat al.');
      }
    } catch (err) {
      this.error('Fout bij automatisch aanmaken vanuit driver:', err);
    }
  }
}

module.exports = P1DongleDriver;
