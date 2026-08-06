# Route Tracker

<img src="custom_components/route_tracker/brand/icon.png" width="100" height="100" alt="Route Tracker">

Route Tracker is a Home Assistant custom integration and Lovelace card for viewing daily routes from selected `device_tracker` entities. It creates event-driven virtual sensors for selected device trackers so GPS attribute updates are retained by the Home Assistant Recorder, then renders the recorded route on a map.

---

[![ShellCheck Lint](https://github.com/underhax/ha-route-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/underhax/ha-route-tracker/actions/workflows/ci.yml)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
[![GitHub last commit](https://img.shields.io/github/last-commit/underhax/ha-route-tracker)](https://github.com/underhax/ha-route-tracker/commits/main)
[![GitHub issues](https://img.shields.io/github/issues/underhax/ha-route-tracker)](https://github.com/underhax/ha-route-tracker/issues)
[![GitHub repo size](https://img.shields.io/github/repo-size/underhax/ha-route-tracker)](https://github.com/underhax/ha-route-tracker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Compatibility

Tested with:

- Home Assistant 2026.8.0
- HACS 2.0.5

## Installation

> [!CAUTION]
> Install Route Tracker through HACS or from a GitHub Release archive.
>
> Do not install a GitHub source archive or clone the repository into `custom_components`: source archives do not include the compiled frontend assets required by the Lovelace card.

### HACS (Recommended)

> [!NOTE]
> See the [HACS documentation](https://hacs.xyz/docs/faq/custom_repositories) for details.

1. Open **HACS** and select **Custom repositories**.
2. Add `https://github.com/underhax/ha-route-tracker` as an **Integration** repository.
3. Install **Route Tracker**.
4. Restart Home Assistant.

### Manual installation

> [!NOTE]
> The Home Assistant configuration directory contains `configuration.yaml`. Home Assistant OS and Home Assistant Container expose it as the `config` directory.

1. Download `route_tracker.zip` from [GitHub Releases](https://github.com/underhax/ha-route-tracker/releases).
2. Create `custom_components/route_tracker/` in the Home Assistant configuration directory if it does not exist.
3. Extract the archive contents into that directory.
4. Restart Home Assistant.

## Integration setup

1. Open **Settings** > **Devices & services**.
2. Select **Add integration** and choose **Route Tracker**.
3. Enter a name for the integration.
4. Open the integration's **Configure** dialog.
5. Select every `device_tracker` whose GPS updates must be retained.
6. Set the minimum distance between recorded points.

The integration supports one configuration entry.

### Virtual sensors

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

## Lovelace card

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
```

Optional YAML configuration parameters:
- `theme_mode`: `auto` (follows Home Assistant's theme), `light`, or `dark`.
- `map_provider`: `osm_default` (OpenStreetMap DE), `carto_voyager` (CartoDB Voyager), or `esri_satellite` (Esri Satellite).

The map interface provides built-in controls to switch between available map providers and manually toggle the map's light/dark mode on the fly.


The example assumes `device_tracker.phone` is selected in the integration and linked to `person.alex`.

If `entities` is omitted, the card lists every selected `device_tracker` and every `person` linked to at least one selected tracker.

## Route history

Route Tracker requests history for the selected day through the authenticated Home Assistant frontend session. The selected date uses the Home Assistant timezone when available and falls back to the browser timezone only when necessary.

Routes are available only after the corresponding virtual sensor begins receiving GPS updates. Existing history cannot be reconstructed. A source tracker must provide valid latitude and longitude attributes.

## Privacy and security

Route Tracker does not require an API key, a long-lived access token, or an external route service. History requests use the current authenticated Home Assistant session.

Route Tracker uses map tiles from `https://tile.openstreetmap.de/` (default), `https://cartocdn.com/` (Voyager), and `https://arcgisonline.com/` (Satellite). The browser connects to these services while rendering the map. Consider these external requests when evaluating your network and location-privacy requirements.

## Development

See [DEVELOPMENT](DEVELOPMENT.md) for local setup, builds, checks, and tests.

## Support

Report defects through the [issue tracker](https://github.com/underhax/ha-route-tracker/issues).

## License

Route Tracker is released under the [MIT License](LICENSE).
