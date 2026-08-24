'use strict';

const Homey = require('homey');

class GenericP1MeterApp extends Homey.App {
  async onInit() {
    this.log('Generic P1 Meter App is gestart');
  }
}

module.exports = GenericP1MeterApp;
