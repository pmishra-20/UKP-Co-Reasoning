from pathlib import Path

from tests.conftest import make_pdf


def upload(client, data: bytes, name="paper.pdf"):
    return client.post("/api/documents", files={"file": (name, data, "application/pdf")})


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_non_pdf_rejected_415(client):
    r = upload(client, b"hello, not a pdf")
    assert r.status_code == 415 and r.json()["code"] == "invalid_file"


def test_pdf_extension_with_wrong_magic_rejected(client):
    assert upload(client, b"<html>fake</html>", "x.pdf").status_code == 415


def test_too_large_413(client):
    r = upload(client, b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024))
    assert r.status_code == 413 and r.json()["code"] == "file_too_large"


def test_two_page_pdf_num_pages_and_serving(client):
    r = upload(client, make_pdf([["page one text"], ["page two text"]]))
    assert r.status_code == 200
    meta = r.json()
    assert meta["num_pages"] == 2
    f = client.get(f"/api/documents/{meta['id']}/file")
    assert f.status_code == 200 and f.headers["content-type"] == "application/pdf"
    assert f.content.startswith(b"%PDF-")
    assert client.get("/api/documents/deadbeef/file").status_code == 404


def test_session_roundtrip_and_files(client, paper_pdf, tmp_path):
    doc = upload(client, paper_pdf, "my-paper.pdf").json()
    s = client.post("/api/sessions", json={"document_id": doc["id"], "venue": "ICLR", "role": "author"})
    assert s.status_code == 200
    sid = s.json()["id"]
    assert s.json()["title"] == "my-paper"
    assert (Path(tmp_path) / "sessions" / f"{sid}.json").exists()

    lst = client.get("/api/sessions").json()
    assert [x["id"] for x in lst] == [sid] and lst[0]["num_turns"] == 0 and lst[0]["role"] == "author"

    r = client.patch(f"/api/sessions/{sid}", json={"title": "Renamed"})
    assert r.json()["title"] == "Renamed"
    assert client.get(f"/api/sessions/{sid}").json()["title"] == "Renamed"

    assert client.delete(f"/api/sessions/{sid}").status_code == 204
    assert not (Path(tmp_path) / "sessions" / f"{sid}.json").exists()
    assert client.get(f"/api/sessions/{sid}").status_code == 404
    assert client.get("/api/sessions").json() == []


def test_sessions_sorted_by_updated_desc(client, paper_pdf):
    d = upload(client, paper_pdf).json()
    a = client.post("/api/sessions", json={"document_id": d["id"]}).json()["id"]
    b = client.post("/api/sessions", json={"document_id": d["id"]}).json()["id"]
    client.patch(f"/api/sessions/{a}", json={"title": "touch"})
    assert [x["id"] for x in client.get("/api/sessions").json()] == [a, b]


def test_session_unknown_document_404(client):
    r = client.post("/api/sessions", json={"document_id": "abc123"})
    assert r.status_code == 404 and r.json()["code"] == "not_found"
