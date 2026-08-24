'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized
   */
  async onInit() {
    this.log('P1 Dongle Driver has been initialized');
  }

  /**
   * Handle pairing process
   * We need to define manual IP pairing
   */
  async onPair(session) {
    // We don't need a save_settings handler here because we are directly
    // creating the device via Homey.createDevice() from the frontend pairing view (settings.html).
  }
}

module.exports = P1DongleDriver;
