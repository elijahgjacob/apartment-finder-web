import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    """Test client for the stateless app (no database to set up)."""
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)
