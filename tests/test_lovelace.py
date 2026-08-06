"""Tests for Lovelace resource registration."""

from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.route_tracker.lovelace import (
    RESOURCE_TYPE,
    RESOURCE_URL,
    async_register_resource,
    async_unregister_resource,
)


class MockResources:
    """Mock for Lovelace resources."""

    def __init__(self) -> None:
        """Initialize mock resources."""
        self.loaded: bool = True
        self.items: list[dict[str, str]] = []
        self.create_called: bool = False
        self.delete_called: bool = False
        self.load_called: bool = False
        self.should_fail: bool = False
        self.last_created_item: dict[str, str] | None = None
        self.last_deleted_id: str | None = None

    def async_items(self) -> list[dict[str, str]]:
        """Mock async_items."""
        return self.items

    async def async_create_item(self, item: dict[str, str]) -> None:
        """Mock async_create_item."""
        if self.should_fail:
            raise ValueError("API error")
        self.create_called = True
        self.last_created_item = item

    async def async_delete_item(self, item_id: str) -> None:
        """Mock async_delete_item."""
        if self.should_fail:
            raise ValueError("API error")
        self.delete_called = True
        self.last_deleted_id = item_id

    async def async_load(self) -> None:
        """Mock async_load."""
        self.load_called = True


class MockResourcesYAML:
    """Mock for Lovelace resources in YAML mode."""

    def __init__(self) -> None:
        """Initialize mock resources."""
        self.loaded: bool = True
        self.load_called: bool = False

    def async_items(self) -> list[dict[str, str]]:
        """Mock async_items."""
        return []

    async def async_load(self) -> None:
        """Mock async_load."""
        self.load_called = True


class MockLovelace:
    """Mock for Lovelace component data."""

    def __init__(self) -> None:
        """Initialize mock lovelace."""
        self.resources: MockResources | MockResourcesYAML | None = MockResources()


@pytest.fixture
def mock_lovelace() -> MockLovelace:
    """Mock the lovelace component data."""
    return MockLovelace()


async def test_register_resource_no_lovelace(hass: HomeAssistant) -> None:
    """Test registering when lovelace is not loaded."""
    _ = hass.data.pop("lovelace", None)
    with patch("custom_components.route_tracker.lovelace.LOGGER.debug") as mock_debug:
        await async_register_resource(hass)
        mock_debug.assert_called_with(
            "Lovelace is not loaded, skipping resource registration"
        )


async def test_register_resource_no_resources(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test registering when lovelace has no resources."""
    mock_lovelace.resources = None
    hass.data["lovelace"] = mock_lovelace
    with patch("custom_components.route_tracker.lovelace.LOGGER.debug") as mock_debug:
        await async_register_resource(hass)
        mock_debug.assert_called_with("Lovelace resources not available")


async def test_register_resource_yaml_mode(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test registering when lovelace resources is missing async_create_item (YAML mode)."""
    mock_lovelace.resources = MockResourcesYAML()
    hass.data["lovelace"] = mock_lovelace
    with patch("custom_components.route_tracker.lovelace.LOGGER.debug") as mock_debug:
        await async_register_resource(hass)
        mock_debug.assert_called_with(
            "Lovelace resources not in storage mode, skipping registration"
        )


async def test_register_resource_already_exists(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test registering when the resource already exists."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": RESOURCE_URL}]
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.debug") as mock_debug:
        await async_register_resource(hass)
        mock_debug.assert_called_with("Route Tracker Lovelace resource already exists")
        assert not mock_lovelace.resources.create_called


async def test_register_resource_success(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test successful resource registration."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": "/other-resource.js"}]
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.info") as mock_info:
        await async_register_resource(hass)
        mock_info.assert_called_with(
            "Route Tracker Lovelace resource registered successfully"
        )
        assert mock_lovelace.resources.create_called
        assert mock_lovelace.resources.last_created_item == {
            "res_type": RESOURCE_TYPE,
            "url": RESOURCE_URL,
        }


async def test_register_resource_loads_if_not_loaded(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test it calls async_load if resources are not loaded."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.loaded = False
    hass.data["lovelace"] = mock_lovelace

    await async_register_resource(hass)
    assert mock_lovelace.resources.load_called
    assert mock_lovelace.resources.create_called


async def test_register_resource_failure(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test failure when registering resource."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.should_fail = True
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.error") as mock_error:
        await async_register_resource(hass)
        mock_error.assert_called()


async def test_unregister_resource_no_lovelace(hass: HomeAssistant) -> None:
    """Test unregistering when lovelace is not loaded."""
    _ = hass.data.pop("lovelace", None)
    await async_unregister_resource(hass)


async def test_unregister_resource_no_resources(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test unregistering when lovelace has no resources."""
    mock_lovelace.resources = None
    hass.data["lovelace"] = mock_lovelace
    await async_unregister_resource(hass)


async def test_unregister_resource_yaml_mode(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test unregistering when lovelace resources is missing async_delete_item."""
    mock_lovelace.resources = MockResourcesYAML()
    hass.data["lovelace"] = mock_lovelace
    await async_unregister_resource(hass)


async def test_unregister_resource_not_found(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test unregistering when the resource is not found."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": "/other-resource.js"}]
    hass.data["lovelace"] = mock_lovelace

    await async_unregister_resource(hass)
    assert not mock_lovelace.resources.delete_called


async def test_unregister_resource_success(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test successful resource unregistration."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": RESOURCE_URL, "id": "123"}]
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.info") as mock_info:
        await async_unregister_resource(hass)
        mock_info.assert_called_with(
            "Route Tracker Lovelace resource removed successfully"
        )
        assert mock_lovelace.resources.delete_called
        assert mock_lovelace.resources.last_deleted_id == "123"


async def test_unregister_resource_loads_if_not_loaded(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test it calls async_load if resources are not loaded on unregister."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.loaded = False
    mock_lovelace.resources.items = [{"url": RESOURCE_URL, "id": "123"}]
    hass.data["lovelace"] = mock_lovelace

    await async_unregister_resource(hass)
    assert mock_lovelace.resources.load_called
    assert mock_lovelace.resources.delete_called


async def test_unregister_resource_failure(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test failure when unregistering resource."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": RESOURCE_URL, "id": "123"}]
    mock_lovelace.resources.should_fail = True
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.error") as mock_error:
        await async_unregister_resource(hass)
        mock_error.assert_called()


async def test_unregister_resource_no_id(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test when resource has no ID."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": RESOURCE_URL}]
    hass.data["lovelace"] = mock_lovelace

    await async_unregister_resource(hass)
    assert not mock_lovelace.resources.delete_called
