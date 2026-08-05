"""Constants for the Route Tracker integration."""

from logging import Logger, getLogger

LOGGER: Logger = getLogger(__package__)

DOMAIN = "route_tracker"
CONF_TRACKED_ENTITIES = "tracked_entities"
CONF_TRACKER_FRIENDLY_NAMES = "tracker_friendly_names"
DEFAULT_MINIMAL_DISTANCE = 0.05
