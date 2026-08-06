"""Automatic Lovelace resource registration for Route Tracker."""

from typing import Protocol, cast

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN, LOGGER

RESOURCE_URL = f"/{DOMAIN}/route-tracker-card.js"
RESOURCE_TYPE = "module"


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


async def async_register_resource(hass: HomeAssistant) -> None:
    """Register the Lovelace resource if it is not already registered."""
    lovelace = cast(LovelaceData | None, hass.data.get("lovelace"))
    if lovelace is None:
        LOGGER.debug("Lovelace is not loaded, skipping resource registration")
        return

    resources = cast(
        LovelaceResourcesCollection | None, getattr(lovelace, "resources", None)
    )
    if resources is None:
        LOGGER.debug("Lovelace resources not available")
        return

    if not hasattr(resources, "async_create_item") or not hasattr(
        resources, "async_items"
    ):
        LOGGER.debug("Lovelace resources not in storage mode, skipping registration")
        return

    if not getattr(resources, "loaded", False) and hasattr(resources, "async_load"):
        await resources.async_load()

    items = resources.async_items()
    for item in items:
        if item.get("url") == RESOURCE_URL:
            LOGGER.debug("Route Tracker Lovelace resource already exists")
            return

    try:
        await resources.async_create_item(
            {"res_type": RESOURCE_TYPE, "url": RESOURCE_URL}
        )
        LOGGER.info("Route Tracker Lovelace resource registered successfully")
    except (ValueError, TypeError, HomeAssistantError) as err:
        LOGGER.error("Failed to register Route Tracker Lovelace resource: %s", err)


async def async_unregister_resource(hass: HomeAssistant) -> None:
    """Unregister the Lovelace resource."""
    lovelace = cast(LovelaceData | None, hass.data.get("lovelace"))
    if lovelace is None:
        return

    resources = cast(
        LovelaceResourcesCollection | None, getattr(lovelace, "resources", None)
    )
    if (
        resources is None
        or not hasattr(resources, "async_delete_item")
        or not hasattr(resources, "async_items")
    ):
        return

    if not getattr(resources, "loaded", False) and hasattr(resources, "async_load"):
        await resources.async_load()

    items = resources.async_items()
    for item in items:
        if item.get("url") == RESOURCE_URL:
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
