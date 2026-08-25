# Chargee Sparky Professional Dashboard — Homey CLI 4.0.5

This package uses Homey Compose correctly. The app manifest source is `.homeycompose/app.json`; do not manually create or edit a root `app.json`.

Widget source:
`widgets/energy_dashboard/widget.compose.json`

Required widget assets:
- preview-dark.png
- preview-light.png
- public/index.html
- api.js

Install:
1. Replace the old project directory with this package.
2. `homey app validate`
3. `homey app run`

The widget uses the app-scoped device selector, so no global API permission is required.
