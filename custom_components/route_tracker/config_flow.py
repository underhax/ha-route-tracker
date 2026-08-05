"""Config flow for Route Tracker integration."""

from collections.abc import Callable, Mapping
from typing import cast

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers import selector
from typing_extensions import override

from .const import (
    CONF_TRACKED_ENTITIES,
    CONF_TRACKER_FRIENDLY_NAMES,
    DEFAULT_MINIMAL_DISTANCE,
    DOMAIN,
)


def device_tracker_entity_ids(value: object) -> list[str]:
    """Keep persisted tracker options limited to supported source entities."""
    if not isinstance(value, list):
        return []

    entity_ids = cast(list[object], value)
    return list(
        dict.fromkeys(
            entity_id
            for entity_id in entity_ids
            if isinstance(entity_id, str) and entity_id.startswith("device_tracker.")
        )
    )


def validate_device_tracker_entity_ids(value: object) -> list[str]:
    """Reject unsupported entities before they can become tracking sources."""
    if not isinstance(value, list):
        raise vol.Invalid("tracked_entities_must_be_device_trackers")

    entity_ids = cast(list[object], value)
    if any(
        not isinstance(entity_id, str) or not entity_id.startswith("device_tracker.")
        for entity_id in entity_ids
    ):
        raise vol.Invalid("tracked_entities_must_be_device_trackers")

    return device_tracker_entity_ids(entity_ids)


def tracker_friendly_names(value: object) -> dict[str, str]:
    """Normalize optional names so empty input retains the entity-derived name."""
    if not isinstance(value, Mapping):
        return {}

    names = cast(Mapping[object, object], value)
    return {
        entity_id: name.strip()
        for entity_id, name in names.items()
        if isinstance(entity_id, str)
        and entity_id.startswith("device_tracker.")
        and isinstance(name, str)
        and name.strip()
    }


STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_NAME, default="Route Tracker"): str,
    }
)


class RouteTrackerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Route Tracker."""

    VERSION: int = 1

    @override
    async def async_step_user(
        self, user_input: dict[str, object] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        if user_input is not None:
            title = str(user_input[CONF_NAME])
            return self.async_create_entry(title=title, data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )

    @staticmethod
    @callback
    @override
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return the options flow handler."""
        return RouteTrackerOptionsFlowHandler()


class RouteTrackerOptionsFlowHandler(OptionsFlow):
    """Handle Options Flow for Route Tracker."""

    def __init__(self) -> None:
        """Retain the first step until optional tracker names are submitted."""
        super().__init__()
        self._pending_options: dict[str, object] = {}

    async def async_step_init(
        self, user_input: dict[str, object] | None = None
    ) -> ConfigFlowResult:
        """Select the device trackers that provide retained GPS history."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                tracked_entities = validate_device_tracker_entity_ids(
                    user_input.get(CONF_TRACKED_ENTITIES, [])
                )
            except vol.Invalid:
                errors["base"] = "unknown"
            else:
                self._pending_options = {
                    **user_input,
                    CONF_TRACKED_ENTITIES: tracked_entities,
                }
                return await self.async_step_friendly_names()

        options: Mapping[str, object] = cast(
            Mapping[str, object], self.config_entry.options
        )
        tracked_default = device_tracker_entity_ids(
            options.get(CONF_TRACKED_ENTITIES, [])
        )

        entity_selector = cast(
            Callable[[selector.EntitySelectorConfig], object],
            selector.EntitySelector,
        )
        number_selector = cast(
            Callable[[selector.NumberSelectorConfig], object],
            selector.NumberSelector,
        )
        entity_sel = entity_selector(
            selector.EntitySelectorConfig(domain="device_tracker", multiple=True)
        )
        number_sel = number_selector(
            selector.NumberSelectorConfig(
                min=0.01,
                max=1.0,
                step=0.01,
                unit_of_measurement="km",
                mode=selector.NumberSelectorMode.BOX,
            )
        )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_TRACKED_ENTITIES,
                        default=tracked_default,
                    ): entity_sel,
                    vol.Optional(
                        "minimal_distance",
                        default=options.get(
                            "minimal_distance", DEFAULT_MINIMAL_DISTANCE
                        ),
                    ): number_sel,
                }
            ),
            errors=errors,
        )

    async def async_step_friendly_names(
        self, user_input: dict[str, object] | None = None
    ) -> ConfigFlowResult:
        """Collect optional display names after the tracker set is finalized."""
        tracked_entities = device_tracker_entity_ids(
            self._pending_options.get(CONF_TRACKED_ENTITIES, [])
        )

        if user_input is not None:
            self._pending_options[CONF_TRACKER_FRIENDLY_NAMES] = tracker_friendly_names(
                user_input
            )
            return self.async_create_entry(title="", data=self._pending_options)

        options: Mapping[str, object] = cast(
            Mapping[str, object], self.config_entry.options
        )
        current_names = tracker_friendly_names(
            options.get(CONF_TRACKER_FRIENDLY_NAMES, {})
        )
        text_selector = cast(
            Callable[[selector.TextSelectorConfig], object], selector.TextSelector
        )
        name_selector = text_selector(selector.TextSelectorConfig())
        name_schema = {
            vol.Optional(
                entity_id,
                default=current_names.get(entity_id, ""),
            ): name_selector
            for entity_id in tracked_entities
        }

        return self.async_show_form(
            step_id="friendly_names",
            data_schema=vol.Schema(name_schema),
        )
