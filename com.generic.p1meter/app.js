'use strict';

const Homey = require('homey');

class GenericP1MeterApp extends Homey.App {
  async onInit() {
    this.log('Chargee Sparky P1 Meter is gestart');
  }
}

module.exports = GenericP1MeterApp;
