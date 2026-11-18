"""A stand-in for the video host (Bunny Stream), for the walk-throughs in this folder.

It speaks the parts of the host that Floor uses, and checks what Floor sends the way the real
host does, with its own copy of each rule:

- making, reading, fetching and deleting a video, with the library's API key
- taking an upload in pieces (the "tus" protocol), with the signed upload ticket
- serving a video and its still picture, only at an address signed for that video

A video is "being prepared" the first time Floor asks after the upload, and ready from then on.
What is served as the video is one small real film, cut into a playlist and pieces the way the
real host serves video, whatever was uploaded. A player has to follow the playlist's links to
the pieces, which only works if the signed address is built the way the real host expects.
"""

import base64
import hashlib
import hmac
import http.server
import json
import re
import threading
import time
import urllib.parse
import uuid
from quiet import QuietServer

LIBRARY = "12345"
API_KEY = "local-video-key"
TOKEN_KEY = "local-token-key"

# id -> {"title", "length" (bytes expected), "received" (bytes so far), "asked" (times read since upload), "seconds"}
videos: dict[str, dict] = {}
deleted: list[str] = []
# What is served for every video: a short film as a playlist and its pieces (file name -> bytes),
# and a still picture.
stream: dict[str, bytes] = {}
still: bytes = b""
KINDS = {".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t", ".jpg": "image/jpeg"}
# How many seconds long the host says a finished video is.
FILM_SECONDS = 12


def reset() -> None:
    videos.clear()
    deleted.clear()


def _token(folder: str, expires: str) -> str:
    """The token the real host expects for a folder: see signedAddress in web/src/server/bunny.ts."""
    digest = hmac.new(TOKEN_KEY.encode(), f"{folder}{expires}token_path={folder}".encode(), hashlib.sha256).digest()
    return "HS256-" + base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


class Host(http.server.BaseHTTPRequestHandler):
    def _send(self, status: int, data: bytes = b"", kind: str = "application/json", headers: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Location, Upload-Offset, Upload-Length, Tus-Resumable, Tus-Version")
        self.send_header("Tus-Resumable", "1.0.0")
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        for key, text in (headers or {}).items():
            self.send_header(key, text)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _reply(self, status: int, body=None) -> None:
        self._send(status, b"" if body is None else json.dumps(body).encode())

    def _raw(self) -> bytes:
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def _video(self, video_id: str) -> dict:
        video = videos[video_id]
        uploaded = video["length"] is not None and video["received"] >= video["length"]
        if not uploaded:
            status = 0
        else:
            video["asked"] += 1
            status = 3 if video["asked"] == 1 else 4
        return {"guid": video_id, "videoLibraryId": int(LIBRARY), "title": video["title"], "status": status, "length": FILM_SECONDS if status == 4 else 0}

    def do_OPTIONS(self):
        self._send(204, headers={"Tus-Version": "1.0.0", "Tus-Extension": "creation"})

    def _handle(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path

        # --- playback: only at an address signed for this video's own folder
        signed = re.match(r"^/bcdn_token=([^&]+)&expires=(\d+)&token_path=([^/]+)(/.+)$", path)
        if signed:
            token, expires, folder, file = signed.group(1), signed.group(2), urllib.parse.unquote(signed.group(3)), signed.group(4)
            video_id = folder.strip("/")
            good = token == _token(folder, expires) and int(expires) > time.time() and file.startswith(folder) and video_id in videos
            if not good:
                return self._send(403, b"Forbidden", "text/plain")
            name = file.removeprefix(folder)
            data = still if name == "thumbnail.jpg" else stream.get(name)
            if data is None:
                return self._send(404, b"Not found", "text/plain")
            kind = KINDS.get(name[name.rfind(".") :], "application/octet-stream")
            span = re.match(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
            if span:
                first = int(span.group(1))
                last = int(span.group(2)) if span.group(2) else len(data) - 1
                last = min(last, len(data) - 1)
                return self._send(206, data[first : last + 1], kind, {"Content-Range": f"bytes {first}-{last}/{len(data)}", "Accept-Ranges": "bytes"})
            return self._send(200, data, kind, {"Accept-Ranges": "bytes"})

        # --- uploads in pieces
        if path == "/tusupload" and self.command == "POST":
            self._raw()
            video_id = self.headers.get("VideoId", "")
            expires = self.headers.get("AuthorizationExpire", "0")
            expected = hashlib.sha256(f"{LIBRARY}{API_KEY}{expires}{video_id}".encode()).hexdigest()
            if self.headers.get("AuthorizationSignature") != expected or self.headers.get("LibraryId") != LIBRARY or video_id not in videos:
                return self._send(401, b"Unauthorized", "text/plain")
            if int(expires) < time.time():
                return self._send(400, b"Expired", "text/plain")
            videos[video_id].update(length=int(self.headers.get("Upload-Length", "0")), received=0, asked=0)
            return self._send(201, headers={"Location": f"http://{self.headers.get('Host')}/tusupload/{video_id}", "Upload-Offset": "0"})
        if path.startswith("/tusupload/"):
            video = videos.get(path.removeprefix("/tusupload/"))
            if not video:
                return self._send(404)
            if self.command == "PATCH":
                data = self._raw()
                if int(self.headers.get("Upload-Offset", "-1")) != video["received"]:
                    return self._send(409, headers={"Upload-Offset": str(video["received"])})
                video["received"] += len(data)
                return self._send(204, headers={"Upload-Offset": str(video["received"])})
            if self.command == "HEAD":
                return self._send(200, headers={"Upload-Offset": str(video["received"]), "Upload-Length": str(video["length"] or 0)})

        # --- the API, with the library's key
        api = re.match(rf"^/library/{LIBRARY}/videos(?:/([\w-]+))?$", path)
        if api:
            if self.headers.get("AccessKey") != API_KEY:
                return self._reply(401, {"message": "Unauthorized"})
            video_id = api.group(1)
            if video_id is None and self.command == "POST":
                body = json.loads(self._raw() or b"{}")
                made = str(uuid.uuid4())
                videos[made] = {"title": body.get("title", ""), "length": None, "received": 0, "asked": 0}
                return self._reply(200, self._video(made))
            if video_id == "fetch" and self.command == "POST":
                body = json.loads(self._raw() or b"{}")
                made = str(uuid.uuid4())
                # A fetched video is whole the moment the host has it.
                videos[made] = {"title": body.get("title", ""), "length": 1, "received": 1, "asked": 1, "fetched_from": body.get("url")}
                return self._reply(200, {"id": made, "success": True, "statusCode": 200})
            if video_id in videos:
                if self.command == "GET":
                    return self._reply(200, self._video(video_id))
                if self.command == "DELETE":
                    del videos[video_id]
                    deleted.append(video_id)
                    return self._reply(200, {"success": True, "statusCode": 200})
            return self._reply(404, {"message": "Not found"})

        self._reply(404, {"message": f"The stand-in video host does not know {path}"})

    do_GET = do_HEAD = do_POST = do_PATCH = do_DELETE = _handle

    def log_message(self, *args):
        pass


def start(port: int, pieces: dict[str, bytes], still_bytes: bytes) -> http.server.ThreadingHTTPServer:
    """`pieces` is the film every video plays as: its playlist ("playlist.m3u8") and what it lists."""
    global still
    reset()
    stream.clear()
    stream.update(pieces)
    still = still_bytes
    server = QuietServer(("127.0.0.1", port), Host)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
