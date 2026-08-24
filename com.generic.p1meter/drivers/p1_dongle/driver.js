'use strict';

const Homey = require('homey');

class P1DongleDriver extends Homey.Driver {
  async onInit() {
    this.log('P1 Dongle Driver has been initialized');
  }

  async onPair(session) {
    // We maken een handler aan genaamd 'save_config' die luistert naar de Save knop
    session.setHandler('save_config', async (data) => {
        if (!data.ip) {
            throw new Error('IP-adres is verplicht.');
        }

        // We sturen het geformatteerde apparaat terug naar het koppelingsscherm
        return {
            name: 'P1 Meter (' + data.ip + ')',
            data: { 
                id: data.ip // Unieke ID van het apparaat
            },
            settings: { 
                ip: data.ip, 
                polling_interval: Number(data.interval) || 10 
            }
        };
    });
  }
}

module.exports = P1DongleDriver;
