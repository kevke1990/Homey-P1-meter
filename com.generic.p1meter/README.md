# Chargee Sparky P1 Meter — v1.4.4

Stable P1/DSMR driver for Homey Self-Hosted / Homey SDK 3.

## v1.4.4
- Removed the experimental custom `p1_*` capabilities that caused `Invalid Capability` (404) errors.
- Uses only Homey standard energy capabilities: `measure_power`, `measure_power.returned`, `meter_power`, `meter_power.returned`, `meter_gas`.
- Keeps Homey Energy configured as cumulative import/export.
- Live dashboard reads the driver's in-memory P1 snapshot first, with capability fallback.
- Adds a stale-data indicator in the dashboard.
- Safer TCP lifecycle with exponential reconnect backoff up to 60 seconds.
- Cleans up sockets on app/device shutdown.
- No second historical database and no custom Insight layer. Homey remains responsible for Insights/History.

## Install
1. Stop the running app with `CTRL+C`.
2. Replace the contents of `com.generic.p1meter` with this package.
3. Run `homey app validate --level publish`.
4. Run `homey app run`.

Do not remove/re-pair the existing device unless Homey specifically requires it.
