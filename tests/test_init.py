"""Tests for Route Tracker integration setup and removal."""

from collections.abc import Awaitable, Callable
from typing import cast
from unittest.mock import MagicMock, patch

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import KEY_ALLOW_CONFIGURED_CORS

from custom_components.route_tracker import (
    async_remove_entry,
    async_setup_entry,
    async_unload_entry,
)


async def test_async_setup_entry_registers_lovelace(
    hass: HomeAssistant,
) -> None:
    """Test that setup computes frontend hash and passes it to registration."""
    entry = MagicMock(spec=ConfigEntry)

    with (
        patch(
            "custom_components.route_tracker.async_register_resource"
        ) as mock_register,
        patch("custom_components.route_tracker._register_static_path"),
        patch("homeassistant.config_entries.ConfigEntries.async_forward_entry_setups"),
        patch(
            "custom_components.route_tracker.compute_frontend_hash",
            return_value="abc123def456",
        ),
    ):
        _ = await async_setup_entry(hass, entry)

        mock_register.assert_called_once_with(hass, "abc123def456")


async def test_async_remove_entry_unregisters_lovelace(
    hass: HomeAssistant,
) -> None:
    """Test that removing the entry unregisters the lovelace resource."""
    entry = MagicMock(spec=ConfigEntry)

    with patch(
        "custom_components.route_tracker.async_unregister_resource"
    ) as mock_unregister:
        await async_remove_entry(hass, entry)

        mock_unregister.assert_called_once_with(hass)


async def test_async_unload_entry_does_not_unregister(
    hass: HomeAssistant,
) -> None:
    """Test that unloading the entry does not unregister the resource."""
    entry = MagicMock(spec=ConfigEntry)

    with (
        patch(
            "custom_components.route_tracker.async_unregister_resource"
        ) as mock_unregister,
        patch(
            "homeassistant.config_entries.ConfigEntries.async_unload_platforms"
        ) as mock_unload,
    ):
        mock_unload.return_value = True
        result = await async_unload_entry(hass, entry)

        assert result is True
        mock_unregister.assert_not_called()


async def test_register_static_path_indirect(hass: HomeAssistant) -> None:
    """Test that static path is registered during setup."""
    hass.http = MagicMock()
    entry = MagicMock(spec=ConfigEntry)

    with (
        patch("custom_components.route_tracker.async_register_resource"),
        patch("homeassistant.config_entries.ConfigEntries.async_forward_entry_setups"),
        patch("custom_components.route_tracker.RouteTrackerStaticResource"),
        patch(
            "custom_components.route_tracker.compute_frontend_hash",
            return_value="abc123def456",
        ),
    ):
        _ = await async_setup_entry(hass, entry)

    mock_app = cast(MagicMock, hass.http.app)
    mock_router = cast(MagicMock, mock_app.router)
    mock_register = cast(MagicMock, mock_router.register_resource)
    mock_register.assert_called_once()

    mock_getitem = cast(MagicMock, mock_app.__getitem__)
    mock_getitem.assert_called_with(KEY_ALLOW_CONFIGURED_CORS)
    mock_cors = cast(MagicMock, mock_getitem.return_value)
    mock_cors.assert_called_once()


async def test_async_update_listener_indirect(hass: HomeAssistant) -> None:
    """Test that the update listener reloads the entry."""
    entry = MagicMock(spec=ConfigEntry)
    entry.entry_id = "test_entry_id"

    with (
        patch("custom_components.route_tracker.async_register_resource"),
        patch("custom_components.route_tracker._register_static_path"),
        patch("homeassistant.config_entries.ConfigEntries.async_forward_entry_setups"),
        patch(
            "custom_components.route_tracker.compute_frontend_hash",
            return_value="abc123def456",
        ),
    ):
        _ = await async_setup_entry(hass, entry)

    add_update_listener = cast(MagicMock, entry.add_update_listener)
    listener = cast(
        Callable[[HomeAssistant, ConfigEntry], Awaitable[None]],
        add_update_listener.call_args[0][0],
    )

    with patch(
        "homeassistant.config_entries.ConfigEntries.async_reload"
    ) as mock_reload:
        await listener(hass, entry)
        mock_reload.assert_called_once_with("test_entry_id")
