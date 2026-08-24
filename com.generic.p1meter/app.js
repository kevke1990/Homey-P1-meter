'use strict';

const Homey = require('homey');

class GenericP1MeterApp extends Homey.App {
  /**
   * onInit is called when the app is initialized
   */
  async onInit() {
    this.log('Generic P1 Meter App has been initialized');
  }
}

module.exports = GenericP1MeterApp;
