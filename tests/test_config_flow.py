from collections.abc import Awaitable, Callable
from types import MappingProxyType
from typing import cast

import pytest
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.discovery_flow import DiscoveryKey
from voluptuous_serialize import convert

from custom_components.route_tracker.config_flow import (
    tracker_friendly_names,
    validate_device_tracker_entity_ids,
)
from custom_components.route_tracker.const import (
    CONF_TRACKED_ENTITIES,
    CONF_TRACKER_FRIENDLY_NAMES,
    DEFAULT_MINIMAL_DISTANCE,
    DOMAIN,
)


async def test_form_success(hass: HomeAssistant) -> None:
    """Test we get the form and create an entry."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result.get("type") == FlowResultType.FORM
    assert result.get("errors") == {}

    flow_id = str(result.get("flow_id", ""))

    async_configure = cast(
        Callable[[str, dict[str, str]], Awaitable[dict[str, object]]],
        hass.config_entries.flow.async_configure,
    )
    result2 = await async_configure(
        flow_id,
        {
            CONF_NAME: "My Route Tracker",
        },
    )
    assert result2.get("type") == FlowResultType.CREATE_ENTRY
    assert result2.get("title") == "My Route Tracker"
    assert result2.get("data") == {
        CONF_NAME: "My Route Tracker",
    }


async def test_single_instance_allowed(hass: HomeAssistant) -> None:
    """Test that only a single instance of the integration is allowed."""
    _ = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": config_entries.SOURCE_USER},
        data={CONF_NAME: "First Instance"},
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )

    assert result.get("type") == FlowResultType.ABORT
    assert result.get("reason") == "already_configured"


async def test_options_flow_collects_device_trackers_and_friendly_names(
    hass: HomeAssistant,
) -> None:
    """Ensure each retained tracker can receive an optional display name."""
    discovery_keys: MappingProxyType[str, tuple[DiscoveryKey, ...]] = MappingProxyType(
        {}
    )
    entry = config_entries.ConfigEntry(
        version=1,
        minor_version=1,
        domain=DOMAIN,
        title="Route Tracker",
        data={},
        source=config_entries.SOURCE_USER,
        options={},
        discovery_keys=discovery_keys,
        subentries_data=None,
        unique_id=None,
    )
    await hass.config_entries.async_add(entry)
    await hass.async_block_till_done()

    result = await hass.config_entries.options.async_init(entry.entry_id)

    assert result.get("type") == FlowResultType.FORM
    data_schema = cast(vol.Schema, result.get("data_schema"))
    assert convert(data_schema, custom_serializer=cv.custom_serializer)
    assert data_schema({}) == {
        CONF_TRACKED_ENTITIES: [],
        "minimal_distance": DEFAULT_MINIMAL_DISTANCE,
    }

    flow_id = str(result.get("flow_id", ""))
    async_configure_options = cast(
        Callable[[str, dict[str, object]], Awaitable[dict[str, object]]],
        hass.config_entries.options.async_configure,
    )
    name_result = await async_configure_options(
        flow_id,
        {
            CONF_TRACKED_ENTITIES: ["device_tracker.phone"],
            "minimal_distance": 0.1,
        },
    )

    assert name_result.get("type") == FlowResultType.FORM
    assert name_result.get("step_id") == "friendly_names"

    name_schema = cast(vol.Schema, name_result.get("data_schema"))
    assert name_schema({"device_tracker.phone": "Phone history"}) == {
        "device_tracker.phone": "Phone history"
    }

    entry_result = await async_configure_options(
        flow_id,
        {"device_tracker.phone": "Phone history"},
    )

    assert entry_result.get("type") == FlowResultType.CREATE_ENTRY
    assert entry_result.get("data") == {
        CONF_TRACKED_ENTITIES: ["device_tracker.phone"],
        "minimal_distance": 0.1,
        CONF_TRACKER_FRIENDLY_NAMES: {"device_tracker.phone": "Phone history"},
    }


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ([], []),
        (["device_tracker.phone"], ["device_tracker.phone"]),
        (["person.alex"], None),
        (["device_tracker.phone", "person.alex"], None),
    ],
)
def test_only_device_trackers_are_valid_tracking_sources(
    value: object, expected: list[str] | None
) -> None:
    """Prevent person entities from entering the authoritative tracker set."""
    if expected is None:
        with pytest.raises(vol.Invalid):
            _ = validate_device_tracker_entity_ids(value)
        return

    assert validate_device_tracker_entity_ids(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (
            {
                "device_tracker.phone": " Phone history ",
                "device_tracker.empty": " ",
                "person.alex": "Alex history",
            },
            {"device_tracker.phone": "Phone history"},
        ),
        (None, {}),
    ],
)
def test_tracker_friendly_names_ignore_empty_and_unsupported_values(
    value: object, expected: dict[str, str]
) -> None:
    """Keep the fallback name when no display name was provided."""
    assert tracker_friendly_names(value) == expected
