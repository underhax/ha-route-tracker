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
from decimal import Decimal
from math import asin, cos, radians, sin, sqrt
from typing import cast

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_LATITUDE, ATTR_LONGITUDE
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import (
    EventStateChangedData,
    async_track_state_change_event,
)
from homeassistant.helpers.typing import StateType
from typing_extensions import override

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


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Route Tracker virtual sensors from a config entry."""
    options: Mapping[str, object] = cast(Mapping[str, object], entry.options)
    tracked_val: object = options.get(CONF_TRACKED_ENTITIES, [])
    tracked: list[str]
    if isinstance(tracked_val, list):
        tracked_list = cast(list[object], tracked_val)
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
        configured_names = cast(Mapping[object, object], friendly_names_val)
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
    except (TypeError, ValueError):
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

        lat: object = new_state.attributes.get(ATTR_LATITUDE)
        lon: object = new_state.attributes.get(ATTR_LONGITUDE)

        if lat is None or lon is None:
            return

        try:
            lat_f = float(str(lat))
            lon_f = float(str(lon))
        except (ValueError, TypeError):
            return

        if (
            self._last_lat is not None
            and self._last_lon is not None
            and _haversine(self._last_lat, self._last_lon, lat_f, lon_f)
            < self._minimal_distance
        ):
            return

        self._last_lat = lat_f
        self._last_lon = lon_f
        self._attr_native_value = datetime.now(tz=UTC).isoformat()
        self._attr_extra_state_attributes = {
            ATTR_LATITUDE: lat_f,
            ATTR_LONGITUDE: lon_f,
            "source_entity": self._source_entity_id,
        }
        self.async_write_ha_state()

    @callback
    def _sync_from_source(self) -> None:
        """Copy the current state of the source entity on startup."""
        source = self.hass.states.get(self._source_entity_id)
        if source is None:
            LOGGER.warning("Source entity %s not found", self._source_entity_id)
            return

        lat: object = source.attributes.get(ATTR_LATITUDE)
        lon: object = source.attributes.get(ATTR_LONGITUDE)

        if lat is not None and lon is not None:
            try:
                lat_f = float(str(lat))
                lon_f = float(str(lon))
            except (ValueError, TypeError):
                return
            self._attr_native_value = datetime.now(tz=UTC).isoformat()
            self._attr_extra_state_attributes = {
                ATTR_LATITUDE: lat_f,
                ATTR_LONGITUDE: lon_f,
                "source_entity": self._source_entity_id,
            }
