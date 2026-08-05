"""Global fixtures for custom component tests."""

import pytest


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Enable custom integrations loading in tests."""
    _ = enable_custom_integrations
