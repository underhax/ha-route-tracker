from collections.abc import Iterable
from types import MappingProxyType

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import Entity

from custom_components.route_tracker.const import (
    CONF_TRACKED_ENTITIES,
    CONF_TRACKER_FRIENDLY_NAMES,
    DEFAULT_MINIMAL_DISTANCE,
    DOMAIN,
)
from custom_components.route_tracker.sensor import RouteTrackerSensor, async_setup_entry


def test_sensor_uses_custom_friendly_name(hass: HomeAssistant) -> None:
    """Ensure a configured display name takes precedence over the fallback."""
    sensor = RouteTrackerSensor(
        hass,
        "device_tracker.phone",
        DEFAULT_MINIMAL_DISTANCE,
        "Phone history",
    )

    assert sensor.name == "Phone history"
    assert sensor.entity_id == "sensor.virtual_device_tracker_phone"


def test_sensor_uses_entity_derived_name_when_name_is_empty(
    hass: HomeAssistant,
) -> None:
    """Preserve the established name when a tracker has no custom label."""
    sensor = RouteTrackerSensor(
        hass,
        "device_tracker.phone",
        DEFAULT_MINIMAL_DISTANCE,
        None,
    )

    assert sensor.name == "virtual_device_tracker_phone"


async def test_setup_creates_sensors_only_for_device_trackers(
    hass: HomeAssistant,
) -> None:
    """Defend retained GPS history from unsupported persisted entities."""
    entry = ConfigEntry(
        version=1,
        minor_version=1,
        domain=DOMAIN,
        title="Route Tracker",
        data={},
        source=config_entries.SOURCE_USER,
        options={
            CONF_TRACKED_ENTITIES: ["device_tracker.phone", "person.alex"],
            CONF_TRACKER_FRIENDLY_NAMES: {
                "device_tracker.phone": "Phone history",
                "person.alex": "Alex history",
            },
        },
        discovery_keys=MappingProxyType({}),
        subentries_data=None,
        unique_id=None,
    )
    added_entities: list[Entity] = []

    def add_entities(
        new_entities: Iterable[Entity], update_before_add: bool = False
    ) -> None:
        assert update_before_add
        added_entities.extend(new_entities)

    await async_setup_entry(hass, entry, add_entities)

    assert len(added_entities) == 1
    assert isinstance(added_entities[0], RouteTrackerSensor)
    assert added_entities[0].name == "Phone history"
