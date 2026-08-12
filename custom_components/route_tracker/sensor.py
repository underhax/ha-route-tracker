"""Virtual sensor platform for Route Tracker.

The HA Recorder only writes a new row when the entity's primary state string
changes. Because device_tracker entities keep the same state (e.g. 'not_home')
while GPS attributes change, the detailed coordinate history is lost.

This module creates a virtual sensor for each tracked entity. The sensor's
state is set to the ISO-formatted timestamp of each update, which guarantees
a unique state string on every change and forces the Recorder to persist
every GPS coordinate.
"""

from collections.abc import Mapping
from datetime import UTC, date, datetime
from math import asin, cos, radians, sin, sqrt
from typing import TYPE_CHECKING, cast, override

from homeassistant.components.sensor import SensorEntity
from homeassistant.const import ATTR_BATTERY_LEVEL, ATTR_LATITUDE, ATTR_LONGITUDE
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, State, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import (
    EventStateChangedData,
    async_track_state_change_event,
)

if TYPE_CHECKING:
    from decimal import Decimal

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.helpers.entity_platform import AddEntitiesCallback
    from homeassistant.helpers.typing import StateType

from .const import (
    CONF_TRACKED_ENTITIES,
    CONF_TRACKER_FRIENDLY_NAMES,
    DEFAULT_MINIMAL_DISTANCE,
    LOGGER,
)

VIRTUAL_SENSOR_PREFIX = "virtual_device_tracker"


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in kilometers between two GPS points."""
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def _resolve_coordinates(
    hass: HomeAssistant, state: State
) -> tuple[float, float] | None:
    """Resolve latitude and longitude from a state, falling back to its zone."""
    lat: object = state.attributes.get(ATTR_LATITUDE)
    lon: object = state.attributes.get(ATTR_LONGITUDE)

    if lat is not None and lon is not None:
        try:
            return float(str(lat)), float(str(lon))
        except ValueError, TypeError:
            pass

    state_val = state.state
    if state_val and state_val.lower() not in ("not_home", "unknown", "unavailable"):
        zone_state = hass.states.get(f"zone.{state_val.lower()}")
        if zone_state:
            z_lat: object = zone_state.attributes.get(ATTR_LATITUDE)
            z_lon: object = zone_state.attributes.get(ATTR_LONGITUDE)
            if z_lat is not None and z_lon is not None:
                try:
                    return float(str(z_lat)), float(str(z_lon))
                except ValueError, TypeError:
                    pass

    return None


def _get_battery_level(hass: HomeAssistant, state: State) -> float | None:
    """Extract battery level for a tracker."""
    bat = state.attributes.get(ATTR_BATTERY_LEVEL)
    if isinstance(bat, (int, float, str)):
        try:
            return float(bat)
        except ValueError:
            pass

    ent_reg = er.async_get(hass)
    tracker_entry = ent_reg.async_get(state.entity_id)
    if not tracker_entry or not tracker_entry.device_id:
        return None

    device_id = tracker_entry.device_id
    device_entities = er.async_entries_for_device(
        ent_reg, device_id, include_disabled_entities=False
    )

    battery_sensors = [
        entry
        for entry in device_entities
        if entry.domain == "sensor"
        and (
            entry.original_device_class == "battery" or entry.device_class == "battery"
        )
    ]

    if len(battery_sensors) == 1:
        bat_state = hass.states.get(battery_sensors[0].entity_id)
        if bat_state and bat_state.state not in ("unknown", "unavailable"):
            try:
                return float(bat_state.state)
            except ValueError, TypeError:
                pass

    return None


def extract_extra_attributes(attributes: Mapping[str, object]) -> dict[str, object]:
    """Extract optional attributes safely."""
    extra: dict[str, object] = {}

    source_type = attributes.get("source_type")
    if (
        isinstance(source_type, str)
        and source_type.strip()
        and source_type != "unknown"
    ):
        extra["source_type"] = source_type

    for key in ("gps_accuracy", "altitude", "speed"):
        val = attributes.get(key)
        if val is not None:
            try:
                val_f = float(str(val))
                if val_f != 0.0:
                    extra[key] = val_f
            except ValueError, TypeError:
                pass

    return extra


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Route Tracker virtual sensors from a config entry."""
    options: Mapping[str, object] = cast("Mapping[str, object]", entry.options)
    tracked_val: object = options.get(CONF_TRACKED_ENTITIES, [])
    tracked: list[str]
    if isinstance(tracked_val, list):
        tracked_list = cast("list[object]", tracked_val)
        tracked = [
            entity_id
            for entity_id in tracked_list
            if isinstance(entity_id, str) and entity_id.startswith("device_tracker.")
        ]
    else:
        tracked = []

    friendly_names_val = options.get(CONF_TRACKER_FRIENDLY_NAMES, {})
    friendly_names: dict[str, str]
    if isinstance(friendly_names_val, Mapping):
        configured_names = cast("Mapping[object, object]", friendly_names_val)
        friendly_names = {
            entity_id: name.strip()
            for entity_id, name in configured_names.items()
            if isinstance(entity_id, str)
            and entity_id in tracked
            and isinstance(name, str)
            and name.strip()
        }
    else:
        friendly_names = {}

    min_val: object = options.get("minimal_distance", DEFAULT_MINIMAL_DISTANCE)
    minimal_distance: float
    try:
        minimal_distance = float(str(min_val))
    except TypeError, ValueError:
        minimal_distance = DEFAULT_MINIMAL_DISTANCE

    entities = [
        RouteTrackerSensor(
            hass,
            entity_id,
            minimal_distance,
            friendly_names.get(entity_id),
        )
        for entity_id in tracked
    ]
    async_add_entities(entities, update_before_add=True)


class RouteTrackerSensor(SensorEntity):
    """Virtual sensor that mirrors GPS attributes with a changing state."""

    hass: HomeAssistant
    _attr_has_entity_name: bool = True
    _attr_should_poll: bool = False
    _source_entity_id: str
    _minimal_distance: float
    _attr_unique_id: str | None
    _attr_name: str | None
    entity_id: str
    _attr_native_value: StateType | date | datetime | Decimal
    _attr_extra_state_attributes: dict[str, object]
    _last_lat: float | None
    _last_lon: float | None
    _unsub: CALLBACK_TYPE | None

    def __init__(
        self,
        hass: HomeAssistant,
        source_entity_id: str,
        minimal_distance: float,
        friendly_name: str | None,
    ) -> None:
        """Initialize the virtual sensor from a source entity.

        Uses the legacy naming convention (sensor.virtual_device_tracker_*)
        to preserve backward compatibility with history data accumulated
        by the original route_tracker integration.
        """
        self.hass = hass
        self._source_entity_id = source_entity_id
        self._minimal_distance = minimal_distance
        self._last_lat = None
        self._last_lon = None
        self._attr_unique_id = f"route_gps_{source_entity_id.replace('.', '_')}"
        self._attr_name = (
            friendly_name or f"virtual_{source_entity_id.replace('.', '_')}"
        )
        self.entity_id = f"sensor.virtual_{source_entity_id.replace('.', '_')}"
        self._unsub = None

        self._attr_native_value = None
        self._attr_extra_state_attributes = {}

    @override
    async def async_added_to_hass(self) -> None:
        """Start listening to state changes of the source entity."""
        self._unsub = async_track_state_change_event(
            self.hass, [self._source_entity_id], self._handle_state_change
        )
        self._sync_from_source()

    @override
    async def async_will_remove_from_hass(self) -> None:
        """Clean up the state listener."""
        if self._unsub:
            self._unsub()
            self._unsub = None

    @callback
    def _handle_state_change(self, event: Event[EventStateChangedData]) -> None:
        """React to any state change (including attribute-only) of the source."""
        new_state = event.data.get("new_state")
        if new_state is None:
            return

        coords = _resolve_coordinates(self.hass, new_state)
        if coords is None:
            return

        lat_f, lon_f = coords

        if (
            self._last_lat is not None
            and self._last_lon is not None
            and _haversine(self._last_lat, self._last_lon, lat_f, lon_f)
            < self._minimal_distance
        ):
            return

        self._last_lat = lat_f
        self._last_lon = lon_f

        extra_attrs = {
            ATTR_LATITUDE: lat_f,
            ATTR_LONGITUDE: lon_f,
            "source_entity": self._source_entity_id,
            **extract_extra_attributes(new_state.attributes),
        }

        battery_level = _get_battery_level(self.hass, new_state)
        if battery_level is not None:
            extra_attrs[ATTR_BATTERY_LEVEL] = battery_level

        self._attr_native_value = datetime.now(tz=UTC).isoformat()
        self._attr_extra_state_attributes = extra_attrs
        self.async_write_ha_state()

    @callback
    def _sync_from_source(self) -> None:
        """Copy the current state of the source entity on startup."""
        source = self.hass.states.get(self._source_entity_id)
        if source is None:
            LOGGER.warning("Source entity %s not found", self._source_entity_id)
            return

        coords = _resolve_coordinates(self.hass, source)
        if coords is not None:
            lat_f, lon_f = coords

            extra_attrs = {
                ATTR_LATITUDE: lat_f,
                ATTR_LONGITUDE: lon_f,
                "source_entity": self._source_entity_id,
                **extract_extra_attributes(source.attributes),
            }

            battery_level = _get_battery_level(self.hass, source)
            if battery_level is not None:
                extra_attrs[ATTR_BATTERY_LEVEL] = battery_level

            self._attr_native_value = datetime.now(tz=UTC).isoformat()
            self._attr_extra_state_attributes = extra_attrs
