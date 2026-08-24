'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver is opgestart');
  }

  async onPairListDevices() {
    return [
      {
        name: 'Chargee Sparky P1 Meter',
        data: {
          id: 'sparky_p1_192.168.8.224'
        },
        settings: {
          ip: '192.168.8.224',
          port: 3602,
          polling_interval: 10
        }
      }
    ];
  }
}

module.exports = P1DongleDriver;
