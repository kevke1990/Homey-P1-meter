'use strict';

/*
 * Chargee Sparky v1.3
 *
 * The widget is deliberately live-only.
 * Historical energy data is no longer stored in device settings.
 * Homey itself records the capability history and uses it for Insights
 * and Homey Energy because the P1 driver is configured as a cumulative
 * measuring device.
 */

let cachedDriver = null;
let cachedDevice = null;
let cachedDeviceId = null;

module.exports = {
  async getData({ homey, query }) {
    const deviceId = query?.deviceId;
    if (!deviceId) {
      return { error: 'Geen Chargee Sparky apparaat geselecteerd.' };
    }

    // Cache the driver/device object. Widget refreshes should not repeatedly
    // enumerate the driver when the selected device has not changed.
    if (!cachedDevice || cachedDeviceId !== deviceId) {
      cachedDriver = cachedDriver || homey.drivers.getDriver('p1_dongle');
      const devices = cachedDriver.getDevices();
      cachedDevice = devices.find(d => {
        try {
          return d.getId() === deviceId;
        } catch (err) {
          return d.id === deviceId;
        }
      }) || null;
      cachedDeviceId = cachedDevice ? deviceId : null;
    }

    const device = cachedDevice;

    if (!device) {
      return { error: 'P1-meter niet gevonden.' };
    }

    const cap = id => {
      try {
        const value = device.getCapabilityValue(id);
        return value === undefined ? null : value;
      } catch (err) {
        return null;
      }
    };

    const powerW = cap('measure_power');
    const returnedW = cap('measure_power.returned');
    const meterKwh = cap('meter_power');
    const returnedKwh = cap('meter_power.returned');
    const gasM3 = cap('meter_gas');

    let status = 'balanced';
    let statusText = 'Geen netto afname of teruglevering';
    if (typeof powerW === 'number' && powerW > 1) {
      status = 'import';
      statusText = 'U gebruikt nu stroom van het elektriciteitsnet';
    } else if (typeof returnedW === 'number' && returnedW > 1) {
      status = 'export';
      statusText = 'U levert nu stroom terug aan het elektriciteitsnet';
    }

    return {
      version: '1.3.0',
      online: device.getAvailable(),
      deviceName: device.getName(),
      status,
      statusText,
      now: {
        powerW,
        returnedW,
        meterKwh,
        returnedKwh,
        gasM3
      },
      energy: {
        cumulative: true,
        importedCapability: 'meter_power',
        exportedCapability: 'meter_power.returned',
        gasCapability: 'meter_gas'
      },
      generatedAt: Date.now()
    };
  }
};
