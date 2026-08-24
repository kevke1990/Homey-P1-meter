'use strict';

module.exports = {
  async getData({ homey, settings }) {
    const ids = await homey.getDeviceIds();
    const deviceId = ids && ids[0];

    if (!deviceId) {
      return { error: 'Geen Chargee Sparky P1 Meter geselecteerd.' };
    }

    const device = await homey.devices.getDevice({ id: deviceId });
    const capabilities = device.capabilitiesObj || {};
    const value = id => capabilities[id]?.value ?? null;

    return {
      online: device.available !== false,
      deviceName: device.name,
      powerW: value('measure_power'),
      returnedW: value('measure_power.returned'),
      meterKwh: value('meter_power'),
      returnedKwh: value('meter_power.returned'),
      gasM3: value('meter_gas'),
      prices: {
        electricity: Number(settings?.electricity_price ?? 0.30),
        feedin: Number(settings?.feedin_price ?? 0.15),
        gas: Number(settings?.gas_price ?? 1.00)
      },
      generatedAt: Date.now()
    };
  }
};
