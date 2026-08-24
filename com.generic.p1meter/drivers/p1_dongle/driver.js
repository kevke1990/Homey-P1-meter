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
    // When the user has entered the IP address in settings.html and clicks "Save"
    session.setHandler('save_settings', async (data) => {
      // Validate IP address format (basic validation)
      const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
      if (!data.ipAddress || !ipRegex.test(data.ipAddress)) {
        throw new Error('Invalid IP Address');
      }

      // Check if we can reach the device to verify it's a P1 meter
      // In a real app, you would make a fetch request to the IP here
      // For pairing, we assume it's correct if the IP format is valid,
      // but best practice is to test the connection.

      const deviceId = `p1_${data.ipAddress.replace(/\./g, '_')}`;

      return {
        name: `P1 Meter (${data.ipAddress})`,
        data: {
          id: deviceId
        },
        settings: {
          ipAddress: data.ipAddress,
          pollInterval: data.pollInterval || 10 // Default to 10 seconds
        }
      };
    });
  }
}

module.exports = P1DongleDriver;
