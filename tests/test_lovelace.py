"""Tests for Lovelace resource registration."""

from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest

if TYPE_CHECKING:
    from pathlib import Path

    from homeassistant.core import HomeAssistant

from custom_components.route_tracker.lovelace import (
    RESOURCE_BASE_URL,
    RESOURCE_TYPE,
    async_register_resource,
    async_unregister_resource,
    build_resource_url,
    compute_frontend_hash,
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
            raise ValueError
        self.create_called = True
        self.last_created_item = item

    async def async_delete_item(self, item_id: str) -> None:
        """Mock async_delete_item."""
        if self.should_fail:
            raise ValueError
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
        await async_register_resource(hass, "abc123def456")
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
        await async_register_resource(hass, "abc123def456")
        mock_debug.assert_called_with("Lovelace resources not available")


async def test_register_resource_yaml_mode(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test registration when Lovelace resources use YAML mode."""
    mock_lovelace.resources = MockResourcesYAML()
    hass.data["lovelace"] = mock_lovelace
    with patch("custom_components.route_tracker.lovelace.LOGGER.debug") as mock_debug:
        await async_register_resource(hass, "abc123def456")
        mock_debug.assert_called_with(
            "Lovelace resources not in storage mode, skipping registration"
        )


async def test_register_resource_already_up_to_date(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test registering when the resource already has the current hash."""
    assert isinstance(mock_lovelace.resources, MockResources)
    target_url = build_resource_url("abc123def456")
    mock_lovelace.resources.items = [{"url": target_url}]
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.debug") as mock_debug:
        await async_register_resource(hass, "abc123def456")
        mock_debug.assert_called_with(
            "Route Tracker Lovelace resource already up to date"
        )
        assert not mock_lovelace.resources.create_called


async def test_register_resource_success(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test successful resource registration."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": "/other-resource.js"}]
    hass.data["lovelace"] = mock_lovelace

    target_url = build_resource_url("abc123def456")
    with patch("custom_components.route_tracker.lovelace.LOGGER.info") as mock_info:
        await async_register_resource(hass, "abc123def456")
        mock_info.assert_called_with(
            "Route Tracker Lovelace resource registered: %s", target_url
        )
        assert mock_lovelace.resources.create_called
        assert mock_lovelace.resources.last_created_item == {
            "res_type": RESOURCE_TYPE,
            "url": target_url,
        }


async def test_register_resource_success_without_hash(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test resource registration falls back to base URL when hash is None."""
    assert isinstance(mock_lovelace.resources, MockResources)
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.info"):
        await async_register_resource(hass, None)
        assert mock_lovelace.resources.create_called
        assert mock_lovelace.resources.last_created_item == {
            "res_type": RESOURCE_TYPE,
            "url": RESOURCE_BASE_URL,
        }


async def test_register_resource_replaces_stale_entry(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test that a stale resource with outdated hash gets replaced."""
    assert isinstance(mock_lovelace.resources, MockResources)
    old_url = build_resource_url("old_hash_0000")
    mock_lovelace.resources.items = [{"url": old_url, "id": "res-42"}]
    hass.data["lovelace"] = mock_lovelace

    new_url = build_resource_url("new_hash_1111")
    with patch("custom_components.route_tracker.lovelace.LOGGER.info"):
        await async_register_resource(hass, "new_hash_1111")
        assert mock_lovelace.resources.delete_called
        assert mock_lovelace.resources.last_deleted_id == "res-42"
        assert mock_lovelace.resources.create_called
        assert mock_lovelace.resources.last_created_item == {
            "res_type": RESOURCE_TYPE,
            "url": new_url,
        }


async def test_register_resource_replaces_legacy_entry_without_hash(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test that a legacy resource without query param gets replaced."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": RESOURCE_BASE_URL, "id": "legacy-1"}]
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.info"):
        await async_register_resource(hass, "abc123def456")
        assert mock_lovelace.resources.delete_called
        assert mock_lovelace.resources.last_deleted_id == "legacy-1"
        assert mock_lovelace.resources.create_called


async def test_register_resource_stale_entry_without_id(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test replacing a stale resource that has no id skips delete and creates new."""
    assert isinstance(mock_lovelace.resources, MockResources)
    old_url = build_resource_url("old_hash_0000")
    mock_lovelace.resources.items = [{"url": old_url}]
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.info"):
        await async_register_resource(hass, "new_hash_1111")
        assert not mock_lovelace.resources.delete_called
        assert mock_lovelace.resources.create_called


async def test_register_resource_stale_delete_failure_aborts(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test that a failure to delete the stale entry aborts registration."""
    assert isinstance(mock_lovelace.resources, MockResources)
    old_url = build_resource_url("old_hash_0000")
    mock_lovelace.resources.items = [{"url": old_url, "id": "res-42"}]
    mock_lovelace.resources.should_fail = True
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.error") as mock_error:
        await async_register_resource(hass, "new_hash_1111")
        mock_error.assert_called_once()
        assert not mock_lovelace.resources.create_called


async def test_register_resource_loads_if_not_loaded(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test it calls async_load if resources are not loaded."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.loaded = False
    hass.data["lovelace"] = mock_lovelace

    await async_register_resource(hass, "abc123def456")
    assert mock_lovelace.resources.load_called
    assert mock_lovelace.resources.create_called


async def test_register_resource_create_failure(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test failure when creating resource."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.should_fail = True
    hass.data["lovelace"] = mock_lovelace

    with patch("custom_components.route_tracker.lovelace.LOGGER.error") as mock_error:
        await async_register_resource(hass, "abc123def456")
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


@pytest.mark.parametrize(
    "resource_url",
    [
        build_resource_url("abc123def456"),
        RESOURCE_BASE_URL,
    ],
)
async def test_unregister_resource_success(
    hass: HomeAssistant, mock_lovelace: MockLovelace, resource_url: str
) -> None:
    """Test successful unregistration with both hashed and legacy URLs."""
    assert isinstance(mock_lovelace.resources, MockResources)
    mock_lovelace.resources.items = [{"url": resource_url, "id": "123"}]
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
    target_url = build_resource_url("abc123def456")
    mock_lovelace.resources.items = [{"url": target_url, "id": "123"}]
    hass.data["lovelace"] = mock_lovelace

    await async_unregister_resource(hass)
    assert mock_lovelace.resources.load_called
    assert mock_lovelace.resources.delete_called


async def test_unregister_resource_failure(
    hass: HomeAssistant, mock_lovelace: MockLovelace
) -> None:
    """Test failure when unregistering resource."""
    assert isinstance(mock_lovelace.resources, MockResources)
    target_url = build_resource_url("abc123def456")
    mock_lovelace.resources.items = [{"url": target_url, "id": "123"}]
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
    target_url = build_resource_url("abc123def456")
    mock_lovelace.resources.items = [{"url": target_url}]
    hass.data["lovelace"] = mock_lovelace

    await async_unregister_resource(hass)
    assert not mock_lovelace.resources.delete_called


def test_compute_frontend_hash_file_exists(tmp_path: Path) -> None:
    """Test that compute_frontend_hash returns a 12-char hex digest."""
    js_file = tmp_path / "route-tracker-card.js"
    _ = js_file.write_text("console.log('test');")

    result = compute_frontend_hash(str(tmp_path))

    assert result is not None
    assert len(result) == 12
    assert all(c in "0123456789abcdef" for c in result)


def test_compute_frontend_hash_file_missing(tmp_path: Path) -> None:
    """Test that compute_frontend_hash returns None when JS file is absent."""
    with patch("custom_components.route_tracker.lovelace.LOGGER.warning"):
        result = compute_frontend_hash(str(tmp_path))

    assert result is None


def test_compute_frontend_hash_deterministic(
    tmp_path: Path,
) -> None:
    """Test that identical content produces the same hash."""
    js_file = tmp_path / "route-tracker-card.js"
    _ = js_file.write_text("console.log('stable');")

    first = compute_frontend_hash(str(tmp_path))
    second = compute_frontend_hash(str(tmp_path))

    assert first == second


def test_compute_frontend_hash_changes_on_content(
    tmp_path: Path,
) -> None:
    """Test that different content produces different hashes."""
    js_file = tmp_path / "route-tracker-card.js"

    _ = js_file.write_text("version_1")
    hash_v1 = compute_frontend_hash(str(tmp_path))

    _ = js_file.write_text("version_2")
    hash_v2 = compute_frontend_hash(str(tmp_path))

    assert hash_v1 != hash_v2


@pytest.mark.parametrize(
    ("content_hash", "expected_url"),
    [
        ("abc123def456", f"{RESOURCE_BASE_URL}?v=abc123def456"),
        (None, RESOURCE_BASE_URL),
        ("", RESOURCE_BASE_URL),
    ],
)
def test_build_resource_url(content_hash: str | None, expected_url: str) -> None:
    """Test URL construction with and without hash."""
    assert build_resource_url(content_hash) == expected_url
