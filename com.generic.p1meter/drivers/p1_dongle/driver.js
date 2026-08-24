'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver is opgestart');
  }

  // De officiële SDK v3 methode werkt feilloos i.c.m. de list_devices + add_devices templates
  async onPairListDevices() {
    this.log('Apparaatlijst opgehaald voor pairing...');
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
