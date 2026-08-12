from types import MappingProxyType
from typing import TYPE_CHECKING
from unittest.mock import patch

from homeassistant.config_entries import ConfigEntry

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers import device_registry as dr
    from homeassistant.helpers import entity_registry as er

from custom_components.route_tracker.sensor import RouteTrackerSensor


async def test_battery_level_extraction(
    hass: HomeAssistant,
    device_registry: dr.DeviceRegistry,
    entity_registry: er.EntityRegistry,
) -> None:
    entry = ConfigEntry(
        version=1,
        minor_version=1,
        domain="test",
        title="test",
        data={},
        source="user",
        options={},
        discovery_keys=MappingProxyType({}),
        subentries_data=None,
        unique_id=None,
    )

    with patch.object(
        hass.config_entries,
        "async_get_entry",
        return_value=entry,
    ):
        device = device_registry.async_get_or_create(
            config_entry_id=entry.entry_id, identifiers={("test", "test_id")}
        )

    tracker_entry = entity_registry.async_get_or_create(
        "device_tracker", "test", "tracker", device_id=device.id
    )

    battery_entry = entity_registry.async_get_or_create(
        "sensor",
        "test",
        "battery",
        device_id=device.id,
        original_device_class="battery",
    )

    hass.states.async_set(battery_entry.entity_id, "64")

    hass.states.async_set(
        tracker_entry.entity_id, "home", {"latitude": 0.0, "longitude": 0.0}
    )

    sensor = RouteTrackerSensor(hass, tracker_entry.entity_id, 0.05, None)
    await sensor.async_added_to_hass()

    assert sensor.extra_state_attributes is not None
    assert sensor.extra_state_attributes.get("battery_level") == 64.0

    hass.states.async_set(battery_entry.entity_id, "63")
    hass.states.async_set(
        tracker_entry.entity_id, "home", {"latitude": 1.0, "longitude": 1.0}
    )
    await hass.async_block_till_done()

    assert sensor.extra_state_attributes.get("battery_level") == 63.0

    battery2_entry = entity_registry.async_get_or_create(
        "sensor",
        "test",
        "battery2",
        device_id=device.id,
        original_device_class="battery",
    )
    hass.states.async_set(battery2_entry.entity_id, "100")

    hass.states.async_set(
        tracker_entry.entity_id, "home", {"latitude": 2.0, "longitude": 2.0}
    )
    await hass.async_block_till_done()

    assert "battery_level" not in sensor.extra_state_attributes

    hass.states.async_set(
        tracker_entry.entity_id,
        "home",
        {"latitude": 3.0, "longitude": 3.0, "battery_level": 55},
    )
    await hass.async_block_till_done()

    assert sensor.extra_state_attributes.get("battery_level") == 55.0

    hass.states.async_set(
        tracker_entry.entity_id,
        "home",
        {"latitude": 4.0, "longitude": 4.0, "battery_level": "invalid"},
    )
    await hass.async_block_till_done()
    assert "battery_level" not in sensor.extra_state_attributes

    entity_registry.async_remove(battery2_entry.entity_id)

    hass.states.async_set(battery_entry.entity_id, "invalid")

    hass.states.async_set(
        tracker_entry.entity_id, "home", {"latitude": 5.0, "longitude": 5.0}
    )
    await hass.async_block_till_done()

    assert "battery_level" not in sensor.extra_state_attributes
