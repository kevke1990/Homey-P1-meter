'use strict';

const Homey = require('homey');

class GenericP1MeterApp extends Homey.App {
  async onInit() {
    this.log('Generic P1 Meter App is gestart');

    // Wacht 2 seconden zodat alles is geladen
    setTimeout(() => {
      this.ensureDeviceCreated();
    }, 2000);
  }

  async ensureDeviceCreated() {
    try {
      const driver = await this.homey.drivers.getDriver('p1_dongle');
      const devices = driver.getDevices();

      if (devices.length === 0) {
        this.log('Geen P1 meter gevonden, automatische aanmaak starten via homey.drivers...');
        
        // Correcte SDK v3 methode om een apparaat toe te voegen via de driver ID
        await this.homey.drivers.createDevice({
          driverId: 'p1_dongle',
          name: 'P1 Meter (Chargee Sparky)',
          data: {
            id: 'sparky_p1_192.168.8.224'
          },
          settings: {
            ip: '192.168.8.224',
            polling_interval: 10
          }
        });

        this.log('P1 Meter is automatisch succesvol aangemaakt!');
      } else {
        this.log('P1 Meter bestaat al.');
      }
    } catch (err) {
      this.error('Fout bij automatisch aanmaken van apparaat:', err);
    }
  }
}

module.exports = GenericP1MeterApp;
