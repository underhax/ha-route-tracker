"""Automatic Lovelace resource registration for Route Tracker."""

import hashlib
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, cast

from homeassistant.exceptions import HomeAssistantError

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

from .const import DOMAIN, LOGGER

RESOURCE_BASE_URL = f"/{DOMAIN}/route-tracker-card.js"
RESOURCE_TYPE = "module"
HASH_PREFIX_LENGTH = 12


class LovelaceResourcesCollection(Protocol):
    """Protocol for Lovelace resources collection."""

    loaded: bool

    def async_items(self) -> list[dict[str, str]]:
        """Return all items."""
        ...

    async def async_create_item(self, item: dict[str, str]) -> None:
        """Create a new item."""
        ...

    async def async_delete_item(self, item_id: str) -> None:
        """Delete an item."""
        ...

    async def async_load(self) -> None:
        """Load resources."""
        ...


class LovelaceData(Protocol):
    """Protocol for Lovelace component data."""

    resources: LovelaceResourcesCollection | None


def compute_frontend_hash(www_dir: str) -> str | None:
    """Derive a cache-busting token from the frontend bundle content.

    Returns the first 12 hex characters of a SHA-256 digest,
    or None when the bundle file is missing (broken installation).
    Must be called from an executor thread — performs blocking I/O.
    """
    js_path = Path(www_dir) / "route-tracker-card.js"
    if not js_path.is_file():
        LOGGER.warning("Frontend bundle not found at %s", js_path)
        return None
    digest = hashlib.sha256(js_path.read_bytes()).hexdigest()
    return digest[:HASH_PREFIX_LENGTH]


def build_resource_url(content_hash: str | None) -> str:
    """Build the Lovelace resource URL with an optional cache-busting suffix."""
    if content_hash:
        return f"{RESOURCE_BASE_URL}?v={content_hash}"
    return RESOURCE_BASE_URL


def _url_matches_base(url: str) -> bool:
    """Check whether a Lovelace resource URL belongs to Route Tracker."""
    return url == RESOURCE_BASE_URL or url.startswith(f"{RESOURCE_BASE_URL}?")


async def _ensure_loaded(resources: LovelaceResourcesCollection) -> None:
    """Load Lovelace resources if they have not been loaded yet."""
    if not getattr(resources, "loaded", False) and hasattr(resources, "async_load"):
        await resources.async_load()


def _get_resources(
    hass: HomeAssistant,
) -> LovelaceResourcesCollection | None:
    """Return the Lovelace resources collection when available in storage mode."""
    lovelace = cast("LovelaceData | None", hass.data.get("lovelace"))
    if lovelace is None:
        LOGGER.debug("Lovelace is not loaded, skipping resource registration")
        return None

    resources = cast(
        "LovelaceResourcesCollection | None", getattr(lovelace, "resources", None)
    )
    if resources is None:
        LOGGER.debug("Lovelace resources not available")
        return None

    if not hasattr(resources, "async_create_item") or not hasattr(
        resources, "async_items"
    ):
        LOGGER.debug("Lovelace resources not in storage mode, skipping registration")
        return None

    return resources


async def async_register_resource(
    hass: HomeAssistant, content_hash: str | None
) -> None:
    """Ensure the Lovelace resource points to the current frontend bundle."""
    resources = _get_resources(hass)
    if resources is None:
        return

    await _ensure_loaded(resources)

    target_url = build_resource_url(content_hash)
    items = resources.async_items()

    for item in items:
        url = item.get("url", "")
        if not _url_matches_base(url):
            continue

        if url == target_url:
            LOGGER.debug("Route Tracker Lovelace resource already up to date")
            return

        item_id: str | None = item.get("id")
        if item_id:
            try:
                await resources.async_delete_item(item_id)
                LOGGER.debug("Removed stale Route Tracker Lovelace resource")
            except (ValueError, TypeError, HomeAssistantError) as err:
                LOGGER.error(
                    "Failed to remove stale Route Tracker Lovelace resource: %s", err
                )
                return
        break

    try:
        await resources.async_create_item(
            {"res_type": RESOURCE_TYPE, "url": target_url}
        )
        LOGGER.info("Route Tracker Lovelace resource registered: %s", target_url)
    except (ValueError, TypeError, HomeAssistantError) as err:
        LOGGER.error("Failed to register Route Tracker Lovelace resource: %s", err)


async def async_unregister_resource(hass: HomeAssistant) -> None:
    """Unregister the Lovelace resource."""
    lovelace = cast("LovelaceData | None", hass.data.get("lovelace"))
    if lovelace is None:
        return

    resources = cast(
        "LovelaceResourcesCollection | None", getattr(lovelace, "resources", None)
    )
    if (
        resources is None
        or not hasattr(resources, "async_delete_item")
        or not hasattr(resources, "async_items")
    ):
        return

    await _ensure_loaded(resources)

    items = resources.async_items()
    for item in items:
        if _url_matches_base(item.get("url", "")):
            item_id: str | None = item.get("id")
            if item_id:
                try:
                    await resources.async_delete_item(item_id)
                    LOGGER.info("Route Tracker Lovelace resource removed successfully")
                except (ValueError, TypeError, HomeAssistantError) as err:
                    LOGGER.error(
                        "Failed to unregister Route Tracker Lovelace resource: %s", err
                    )
            break
