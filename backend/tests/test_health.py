def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "checks" in data
    assert data["checks"]["parallel_api_key"]["status"] in ("ok", "missing")
