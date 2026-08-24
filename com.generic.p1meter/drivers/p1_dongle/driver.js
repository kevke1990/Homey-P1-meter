'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver is opgestart');
  }

  /**
   * Deze ingebouwde SDK v3 methode toont automatisch een lijst 
   * met apparaten in de Homey app die je direct kunt toevoegen.
   */
  async onPairListDevices() {
    return [
      {
        name: 'P1 Meter (Chargee Sparky)',
        data: {
          id: 'sparky_p1_192.168.8.224'
        },
        settings: {
          ip: '192.168.8.224',
          polling_interval: 10
        }
      }
    ];
  }
}

module.exports = P1DongleDriver;
