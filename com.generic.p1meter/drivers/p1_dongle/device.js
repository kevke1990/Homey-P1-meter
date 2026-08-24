'use strict';

const Homey = require('homey');
// Using node-fetch for API requests, Homey SDK 3 supports fetch globally or via require depending on node version,
// but it's recommended to use built-in fetch if available or a simple http request.
// In modern Homey SDK, global.fetch is available.

class P1DongleDevice extends Homey.Device {
  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('P1 Dongle Device has been initialized');

    // Setup polling logic
    this.setupPolling();
  }

  /**
   * Called when device is deleted
   */
  async onDeleted() {
    this.log('P1 Dongle Device deleted');
    this.stopPolling();
  }

  /**
   * Called when device settings are updated
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('ipAddress') || changedKeys.includes('pollInterval')) {
      this.log('Settings changed, restarting polling');
      this.stopPolling();
      this.setupPolling();
    }
  }

  setupPolling() {
    const settings = this.getSettings();
    const pollInterval = settings.pollInterval || 10; // in seconds

    // Poll immediately
    this.pollDevice();

    // Then set interval
    this.pollIntervalId = this.homey.setInterval(() => {
      this.pollDevice();
    }, pollInterval * 1000);
  }

  stopPolling() {
    if (this.pollIntervalId) {
      this.homey.clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  async pollDevice() {
    const settings = this.getSettings();
    const ip = settings.ipAddress;

    if (!ip) {
      this.log('No IP address configured');
      return;
    }

    // Configure the specific endpoint here. For many P1 dongles like Chargee Sparky,
    // HomeWizard P1, or custom ESPHome builds, it's usually a standard /api/v1/data or similar.
    // CHANGE THIS URL TO MATCH YOUR SPECIFIC DONGLE'S API ENDPOINT
    const url = `http://${ip}/api/v1/data`;

    try {
      // Add a timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // We got valid data, mark device as available
      this.setAvailable().catch(this.error);

      // Parse the JSON data and update capabilities
      await this.processData(data);

    } catch (error) {
      this.error('Polling error:', error.message);
      // If network timeout or other error occurs, mark device as unavailable
      this.setUnavailable(error.message).catch(this.error);
    }
  }

  /**
   * Process the JSON data and update Homey capabilities.
   * Map the specific JSON payload keys (from devices like the Sparky)
   * to the generic Homey capabilities.
   */
  async processData(data) {
    try {
      // ====================================================================
      // MAPPING INSTRUCTIONS:
      // Change the 'data.xyz' paths below to match the JSON structure
      // returned by your specific P1 dongle.
      // Example for HomeWizard P1: data.active_power_w, data.total_power_import_kwh
      // Example for Chargee Sparky: map to their specific JSON keys
      // ====================================================================

      // 1. Live Usage (Watts)
      // Homey measure_power capability expects Watts (W).
      // Negative value usually indicates returning power to grid.
      // Or they are split into import/export.

      // Example mapping (adjust to actual JSON keys):
      const livePowerImportW = data.active_power_w !== undefined ? data.active_power_w : 0;
      const livePowerExportW = data.active_power_export_w !== undefined ? data.active_power_export_w : 0;

      // Update measure_power (currently consuming)
      if (livePowerImportW !== undefined) {
         this.setCapabilityValue('measure_power', Number(livePowerImportW)).catch(this.error);
      }

      // Update measure_power.returned (currently producing/returning)
      if (livePowerExportW !== undefined) {
         this.setCapabilityValue('measure_power.returned', Number(livePowerExportW)).catch(this.error);
      }

      // 2. Cumulative Total Usage (kWh)
      // Homey Insights uses these to track historical usage over time.
      // meter_power expects kWh.

      // Example mapping (adjust to actual JSON keys):
      const totalConsumedT1 = data.total_power_import_t1_kwh;
      const totalConsumedT2 = data.total_power_import_t2_kwh;
      const totalProducedT1 = data.total_power_export_t1_kwh;
      const totalProducedT2 = data.total_power_export_t2_kwh;

      if (totalConsumedT1 !== undefined) {
        this.setCapabilityValue('meter_power.consumed_t1', Number(totalConsumedT1)).catch(this.error);
      }
      if (totalConsumedT2 !== undefined) {
        this.setCapabilityValue('meter_power.consumed_t2', Number(totalConsumedT2)).catch(this.error);
      }
      if (totalProducedT1 !== undefined) {
        this.setCapabilityValue('meter_power.produced_t1', Number(totalProducedT1)).catch(this.error);
      }
      if (totalProducedT2 !== undefined) {
        this.setCapabilityValue('meter_power.produced_t2', Number(totalProducedT2)).catch(this.error);
      }

      // Calculate total overall consumed/produced for generic meter_power
      if (totalConsumedT1 !== undefined && totalConsumedT2 !== undefined) {
        const totalConsumed = Number(totalConsumedT1) + Number(totalConsumedT2);
        this.setCapabilityValue('meter_power', totalConsumed).catch(this.error);
      }

      if (totalProducedT1 !== undefined && totalProducedT2 !== undefined) {
        const totalProduced = Number(totalProducedT1) + Number(totalProducedT2);
        this.setCapabilityValue('meter_power.returned', totalProduced).catch(this.error);
      }

      // 3. Gas Usage (m3)
      // meter_gas expects m3.

      // Example mapping (adjust to actual JSON keys):
      const totalGas = data.total_gas_m3;

      if (totalGas !== undefined) {
        this.setCapabilityValue('meter_gas', Number(totalGas)).catch(this.error);
      }

    } catch (err) {
      this.error('Error processing data:', err);
    }
  }
}

module.exports = P1DongleDevice;
