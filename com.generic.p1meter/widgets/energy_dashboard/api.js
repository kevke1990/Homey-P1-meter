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

    // The driver keeps a small in-memory live snapshot. Use it when available
    // so the widget does not depend on a round-trip through Homey's capability
    // cache for every refresh. Fall back to the normal capabilities if needed.
    const live = device.liveData || {};
    const powerW = typeof live.powerW === 'number' ? live.powerW : cap('measure_power');
    const returnedW = typeof live.returnedW === 'number' ? live.returnedW : cap('measure_power.returned');
    const meterKwh = typeof live.meterKwh === 'number' ? live.meterKwh : cap('meter_power');
    const returnedKwh = typeof live.returnedKwh === 'number' ? live.returnedKwh : cap('meter_power.returned');
    const gasM3 = typeof live.gasM3 === 'number' ? live.gasM3 : cap('meter_gas');
    const updatedAt = Number(live.updatedAt) || 0;

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
      version: '1.4.4',
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
      updatedAt,
      stale: updatedAt > 0 ? (Date.now() - updatedAt > 30000) : true,
      generatedAt: Date.now()
    };
  }
};
