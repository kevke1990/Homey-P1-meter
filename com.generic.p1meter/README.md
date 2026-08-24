# Chargee Sparky Professional

Deze versie bevat een Homey Dashboard Widget voor de Chargee Sparky P1 Meter.

## Installeren op Homey Pro / Self-Hosted

```bash
cd /pad/naar/com.generic.p1meter
homey app run
```

De app gebruikt Homey Compose. De widget staat onder `widgets/energy_dashboard/` en bevat verplicht `preview-dark.png` en `preview-light.png`.

Voor permanente installatie:

```bash
homey app install
```

Vereist Homey v12.3+ en een lokale Homey (Cloud wordt niet ondersteund).

Na installatie: Dashboard/Home → widget toevoegen → Energy Dashboard → Chargee Sparky P1 Meter selecteren.
