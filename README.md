# Route Tracker

<img src="https://raw.githubusercontent.com/underhax/ha-route-tracker/main/custom_components/route_tracker/brand/icon.svg" width="100" height="100" alt="Route Tracker">

Route Tracker is a Home Assistant custom integration and Lovelace card for viewing daily routes from selected `device_tracker` entities. It creates event-driven virtual sensors for selected device trackers so GPS attribute updates are retained by the Home Assistant Recorder, then renders the recorded route on a map.

---

[![ShellCheck Lint](https://github.com/underhax/ha-route-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/underhax/ha-route-tracker/actions/workflows/ci.yml)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
[![GitHub last commit](https://img.shields.io/github/last-commit/underhax/ha-route-tracker)](https://github.com/underhax/ha-route-tracker/commits/main)
[![GitHub issues](https://img.shields.io/github/issues/underhax/ha-route-tracker)](https://github.com/underhax/ha-route-tracker/issues)
[![GitHub repo size](https://img.shields.io/github/repo-size/underhax/ha-route-tracker)](https://github.com/underhax/ha-route-tracker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Privacy and security

Route Tracker does not require an API key, a long-lived access token, or an external route service for its core functionality. History requests use the current authenticated Home Assistant session.

Route Tracker uses map tiles from [OpenStreetMap DE](https://tile.openstreetmap.de/) (default), [Carto Voyager](https://cartocdn.com/), or [ArcGIS Satellite](https://arcgisonline.com/) depending on your configuration. The browser connects to the selected service while rendering the map.

If you manually enable the "Geocoding" or "Routing" features in the card settings, be aware that these features transmit your coordinates to third-party services distinct from your configured map provider. Your coordinates will be sent **only** when you explicitly click the corresponding links in the map popup:
- **Geocoding:** Sends coordinate data to the [Nominatim API](https://nominatim.openstreetmap.org/) to reverse-geocode GPS coordinates into a human-readable address.
- **Routing:** Opens external routing services ([OpenStreetMap](https://www.openstreetmap.org/), [Google Maps](https://www.google.com/maps/), [Apple Maps](https://www.apple.com/maps/), or [Yandex Maps](https://yandex.com/maps/)) and passes the track point's coordinates via the URL. As the route origin, it will also pass either your device's current physical location or a Home Assistant Zone's center coordinates, depending on your configuration.

Consider these external requests when evaluating your network and location-privacy requirements.

## Compatibility

Tested with:

- Home Assistant 2026.8.1
- HACS 2.0.5

## Installation

Install Route Tracker through HACS or from a GitHub Release archive.

> [!CAUTION]
> Source code archives do not include the compiled frontend assets required by the Lovelace card and will not work. Do **not** install a GitHub source archive or clone the repository directly into `custom_components`.

### HACS (Recommended)

> [!NOTE]
> See the [HACS documentation](https://hacs.xyz/docs/faq/custom_repositories) for details.

1. Open **HACS** and select **Custom repositories**.
2. Add `https://github.com/underhax/ha-route-tracker` as an **Integration** repository.
3. Install **Route Tracker**.
4. Restart Home Assistant.

### Manual installation

<details><summary>Show instructions</summary>

> Note:
> The Home Assistant configuration directory contains `configuration.yaml`. Home Assistant OS and Home Assistant Container expose it as the `config` directory.

1. Download `route_tracker.zip` from [GitHub Releases](https://github.com/underhax/ha-route-tracker/releases).
2. Create `custom_components/route_tracker/` in the Home Assistant configuration directory if it does not exist.
3. Extract the archive contents into that directory.
4. Restart Home Assistant.

</details>

## Integration setup

1. Open **Settings** > **Devices & services**.
2. Select **Add integration** and choose **Route Tracker**.
3. Enter a name for the integration.
4. Open the integration's **Configure** dialog.
5. Select every `device_tracker` whose GPS updates must be retained.
6. Set the minimum distance between recorded points.

The integration supports one configuration entry.

### Virtual sensors

<details><summary>Learn more about virtual sensors</summary>

Route Tracker creates a virtual sensor only for each selected `device_tracker`. Its entity ID follows this pattern:

```text
sensor.virtual_device_tracker_<tracker_object_id>
```

For example, selecting `device_tracker.phone` creates:

```text
sensor.virtual_device_tracker_phone
```

After selecting trackers in the integration options, Route Tracker prompts for an optional display name for each virtual sensor. Empty fields retain the entity-derived default name, and the names can be changed by reopening the integration options.

The sensor state is the UTC ISO 8601 timestamp of the last accepted GPS update. Its attributes are `latitude`, `longitude`, `source_entity`, and `friendly_name`. The changing timestamp state gives Recorder a distinct state change to persist.

The integration threshold is applied before the virtual sensor is updated. It accepts values from `0.01` to `1.0` km and defaults to `0.05` km.

</details>

## Lovelace card

| Static Preview | Animated Demo (AVIF) |
| :---: | :---: |
| <a href="https://raw.githubusercontent.com/underhax/ha-route-tracker/main/.github/demo/demo.webp" target="_blank"><img src="https://raw.githubusercontent.com/underhax/ha-route-tracker/main/.github/demo/demo.webp" width="350" alt="Static Preview"></a> | <a href="https://raw.githubusercontent.com/underhax/ha-route-tracker/main/.github/demo/demo.avif" target="_blank"><img src="https://raw.githubusercontent.com/underhax/ha-route-tracker/main/.github/demo/demo.avif" width="350" alt="Animated Demo (Modern Browser Required)"></a> |

### Add the resource

> [!NOTE]
> Route Tracker automatically registers its Lovelace resource. Manual registration is only required if you manage your dashboards in YAML mode.

If using YAML mode, add the following to your `configuration.yaml`:

```yaml
lovelace:
  resources:
    - url: /route_tracker/route-tracker-card.js
      type: module
```

### Add and configure the card

Add **Route Tracker** from the card picker. The visual editor configures the default map provider, map theme, tracked entities, and zones. Both tracked entities and zones support optional custom display names. YAML is optional and available through the card editor's code view.

The card always offers the `device_tracker` entities selected in the integration. A `person` appears in the card editor only when at least one of its linked device trackers is also selected in the integration. A tracker linked to a person but not selected in Route Tracker does not make that person available.

**Additional Features**

The visual editor includes an "Additional Features" section to enhance map popups when you click on a recorded point:
- **Geocoding:** Adds a popup action to reverse-geocode the point's coordinates into a physical address using the Nominatim API.
- **Routing:** Adds a popup link to get directions to the point via an external service. You can configure the starting point (either your device's current location or the center coordinates of a specific Home Assistant Zone) and choose your preferred routing provider (OpenStreetMap, Google Maps, Apple Maps, or Yandex Maps).

<details><summary>Show YAML configuration</summary>

*Example with all features explicitly configured:*

```yaml
type: custom:route-tracker-card
entities:
  - entity: person.alex
    name: Alex
  - entity: device_tracker.phone
    name: Phone
zones:
  - entity: zone.home
    name: Home
theme_mode: auto
map_provider: osm_default
enable_geocoding: true
enable_routing: true
route_origin: zone.home
routing_provider: osm
```

The example above assumes `device_tracker.phone` is selected in the integration and linked to `person.alex`.

A minimal, valid configuration requires only the card type:

```yaml
type: custom:route-tracker-card
```

By default, this minimal configuration will:
- List every `device_tracker` selected during integration setup, and every `person` linked to those trackers.
- Automatically follow the Home Assistant theme (`auto`).
- Use the OpenStreetMap DE map provider (`osm_default`).
- Display only the time, date, and coordinates when clicking on a route point (geocoding and routing are off by default).

| Parameter | Accepted Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `entities` | List of entity objects | All configured trackers and linked persons | Trackers or persons available in the card's selector to draw routes for. Each can have an optional `name` override. |
| `zones` | List of entity objects | None | Zones to display on the map. Each can have an optional `name` override. |
| `theme_mode` | `auto`, `light`, `dark` | `auto` | Forces the map to render in a specific theme, or follow HA. |
| `map_provider` | `osm_default`, `carto_voyager`, `esri_satellite` | `osm_default` | The base map tile provider. |
| `enable_geocoding` | `true`, `false` | `false` | Adds a popup action to reverse-geocode the point's coordinates into a physical address. |
| `enable_routing` | `true`, `false` | `false` | Adds a popup link to get directions to the point via an external service. |
| `route_origin` | `device` or zone entity ID (e.g. `zone.home`) | `device` | The starting point for the route. `device` uses your current physical location, while a zone uses its center coordinates. |
| `routing_provider` | `osm`, `google`, `apple`, `yandex` | `osm` | The external service used to build the route. |

</details>

The map interface also provides built-in controls to switch between available map providers and manually toggle the map's light/dark mode on the fly.

## Route history

Route Tracker requests history for the selected day through the authenticated Home Assistant frontend session. The selected date uses the Home Assistant timezone when available and falls back to the browser timezone only when necessary.

Routes are available only after the corresponding virtual sensor begins receiving GPS updates. Existing history cannot be reconstructed. A source tracker must provide valid latitude and longitude attributes.

## Development

See [DEVELOPMENT](DEVELOPMENT.md) for local setup, builds, checks, and tests.
