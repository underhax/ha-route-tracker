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
from custom_components.route_tracker.sensor import (
    RouteTrackerSensor,
    async_setup_entry,
    extract_extra_attributes,
)


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


async def test_setup_with_invalid_options(hass: HomeAssistant) -> None:
    """Ensure invalid options fall back gracefully."""
    entry = ConfigEntry(
        version=1,
        minor_version=1,
        domain=DOMAIN,
        title="Route Tracker",
        data={},
        source=config_entries.SOURCE_USER,
        options={
            CONF_TRACKED_ENTITIES: "not_a_list",
            CONF_TRACKER_FRIENDLY_NAMES: "not_a_dict",
            "minimal_distance": "not_a_number",
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

    assert len(added_entities) == 0


async def test_sensor_lifecycle_and_state_changes(hass: HomeAssistant) -> None:
    """Test full lifecycle of the virtual sensor and its response to GPS updates."""
    hass.states.async_set(
        "device_tracker.phone", "home", {"latitude": 50.0, "longitude": 10.0}
    )

    sensor = RouteTrackerSensor(
        hass,
        "device_tracker.phone",
        0.05,
        "Phone",
    )

    await sensor.async_added_to_hass()

    assert sensor.extra_state_attributes is not None
    assert sensor.extra_state_attributes.get("latitude") == 50.0
    assert sensor.extra_state_attributes.get("longitude") == 10.0
    initial_state = sensor.native_value
    assert initial_state is not None

    hass.states.async_set(
        "device_tracker.phone", "not_home", {"latitude": 50.0000, "longitude": 10.0}
    )
    await hass.async_block_till_done()

    state_after_first_update = sensor.native_value
    assert state_after_first_update != initial_state

    hass.states.async_set(
        "device_tracker.phone", "not_home", {"latitude": 50.0001, "longitude": 10.0}
    )
    await hass.async_block_till_done()

    assert sensor.native_value == state_after_first_update

    hass.states.async_set(
        "device_tracker.phone", "not_home", {"latitude": 50.01, "longitude": 10.0}
    )
    await hass.async_block_till_done()

    assert sensor.native_value != state_after_first_update
    assert sensor.extra_state_attributes is not None
    assert sensor.extra_state_attributes.get("latitude") == 50.01

    hass.states.async_set(
        "device_tracker.phone", "not_home", {"latitude": None, "longitude": 10.0}
    )
    await hass.async_block_till_done()

    hass.states.async_set(
        "device_tracker.phone", "not_home", {"latitude": "invalid", "longitude": 10.0}
    )
    await hass.async_block_till_done()

    _ = hass.states.async_remove("device_tracker.phone")
    await hass.async_block_till_done()

    await sensor.async_will_remove_from_hass()

    sensor_missing = RouteTrackerSensor(hass, "device_tracker.missing", 0.05, None)
    await sensor_missing.async_added_to_hass()
    assert sensor_missing.native_value is None

    hass.states.async_set(
        "device_tracker.bad", "home", {"latitude": "invalid", "longitude": 10.0}
    )
    sensor_bad = RouteTrackerSensor(hass, "device_tracker.bad", 0.05, None)
    await sensor_bad.async_added_to_hass()
    assert sensor_bad.native_value is None

    await sensor_missing.async_will_remove_from_hass()
    await sensor_bad.async_will_remove_from_hass()


def test_extract_extra_attributes() -> None:
    """Test extraction of optional GPS attributes."""
    attrs = {
        "source_type": "gps",
        "gps_accuracy": 15,
        "altitude": 100.5,
        "speed": 60,
    }
    extracted = extract_extra_attributes(attrs)
    assert extracted == {
        "source_type": "gps",
        "gps_accuracy": 15.0,
        "altitude": 100.5,
        "speed": 60.0,
    }

    invalid_attrs = {
        "source_type": "unknown",
        "gps_accuracy": 0,
        "altitude": "invalid",
        "speed": None,
    }
    assert extract_extra_attributes(invalid_attrs) == {}

    zero_attrs = {
        "source_type": "   ",
        "gps_accuracy": 0.0,
        "altitude": 0.0,
        "speed": 0.0,
    }
    assert extract_extra_attributes(zero_attrs) == {}


async def test_sensor_resolves_coordinates_from_zone(hass: HomeAssistant) -> None:
    """Test that a router-based tracker inherits coordinates from its current zone."""
    hass.states.async_set("zone.work", "zoning", {"latitude": 0.0, "longitude": 0.0})

    hass.states.async_set(
        "device_tracker.router_phone", "work", {"source_type": "router"}
    )

    sensor = RouteTrackerSensor(hass, "device_tracker.router_phone", 0.05, None)
    await sensor.async_added_to_hass()

    assert sensor.native_value is not None
    assert sensor.extra_state_attributes is not None
    assert sensor.extra_state_attributes["latitude"] == 0.0
    assert sensor.extra_state_attributes["longitude"] == 0.0

    hass.states.async_set("zone.school", "zoning", {"latitude": 0.0, "longitude": 0.0})
    hass.states.async_set(
        "device_tracker.router_phone", "school", {"source_type": "router"}
    )
    await hass.async_block_till_done()

    assert sensor.extra_state_attributes["latitude"] == 0.0
    assert sensor.extra_state_attributes["longitude"] == 0.0

    hass.states.async_set(
        "zone.bad", "zoning", {"latitude": "invalid", "longitude": 0.0}
    )
    hass.states.async_set(
        "device_tracker.router_phone", "bad", {"source_type": "router"}
    )
    await hass.async_block_till_done()

    assert sensor.extra_state_attributes["latitude"] == 0.0
    assert sensor.extra_state_attributes["longitude"] == 0.0

    await sensor.async_will_remove_from_hass()
