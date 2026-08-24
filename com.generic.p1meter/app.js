'use strict';

const Homey = require('homey');

class GenericP1MeterApp extends Homey.App {
  async onInit() {
    this.log('Generic P1 Meter App is gestart');

    // Wacht even zodat alles is geladen
    setTimeout(() => {
      this.ensureDeviceCreated();
    }, 2000);
  }

  async ensureDeviceCreated() {
    try {
      const driver = await this.homey.drivers.getDriver('p1_dongle');
      const devices = driver.getDevices();

      if (devices.length === 0) {
        this.log('Geen P1 meter gevonden, automatische aanmaak starten via driver...');
        
        // Correcte SDK v3 manier om een apparaat aan te maken via de driver instantie
        await driver.createDevice({
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
