# Chargee Sparky P1 Meter – Professional Energy Dashboard

Deze versie bevat naast de P1-driver een volledig custom Homey Dashboard Widget.

## Belangrijk
De standaard Homey device-pagina wordt door Homey zelf opgebouwd uit capabilities. Een app kan die standaard device-pagina niet volledig vervangen door een eigen HTML-dashboard. Daarom is het professionele dashboard geïmplementeerd als een Homey Dashboard Widget.

Homey Widgets vereisen Homey Pro/local en compatibility >= 12.3.0.

## Widget
Widget: `Energy Dashboard`

Bij het toevoegen van de widget:
1. Selecteer `Chargee Sparky P1 Meter`.
2. Stel eventueel de stroomprijs, terugleververgoeding en gasprijs in.
3. De widget toont live verbruik, actuele teruglevering, netto verbruik, totale meterstanden en grafieken voor 24 uur en 7 dagen.

Historische grafieken worden opgebouwd uit Homey Insights. Cumulatieve meterstanden worden omgerekend naar verbruik/teruglevering door de positieve verschillen tussen meetpunten te berekenen.

## Driver
De P1-driver gebruikt:
- measure_power = huidig verbruik uit het net
- measure_power.returned = huidig vermogen naar het net
- meter_power = cumulatief verbruik in kWh
- meter_power.returned = cumulatieve teruglevering in kWh
- meter_gas = cumulatieve gasmeterstand in m³
