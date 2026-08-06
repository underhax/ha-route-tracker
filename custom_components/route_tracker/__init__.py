"""The Route Tracker integration."""

from aiohttp import web
from aiohttp.hdrs import CACHE_CONTROL
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import KEY_ALLOW_CONFIGURED_CORS
from typing_extensions import override

from .const import DOMAIN, LOGGER

PLATFORMS = ["sensor"]
FRONTEND_CACHE_CONTROL = "no-cache, max-age=0, must-revalidate"


class RouteTrackerStaticResource(web.StaticResource):
    """Require validation so rebuilt frontend assets are never served stale."""

    @override
    async def _handle(self, request: web.Request) -> web.StreamResponse:
        response = await super()._handle(request)
        response.headers[CACHE_CONTROL] = FRONTEND_CACHE_CONTROL
        return response


def _register_static_path(hass: HomeAssistant) -> None:
    """Serve the frontend with revalidation while preserving static path safety."""
    resource = RouteTrackerStaticResource(
        f"/{DOMAIN}",
        hass.config.path(f"custom_components/{DOMAIN}/www"),
    )
    hass.http.app.router.register_resource(resource)
    hass.http.app[KEY_ALLOW_CONFIGURED_CORS](resource)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Route Tracker from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    _register_static_path(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    LOGGER.info("Route Tracker initialized successfully")
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload the integration when options change."""
    _ = await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
