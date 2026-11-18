"""A stand-in for the notification service (Expo's), for the walk-throughs in this folder.

It takes the alerts Floor's server sends and keeps them in `sent`, so a walk-through can check
who was told what. It answers the way the real service does: a ticket for each message, and
"DeviceNotRegistered" for a phone that no longer has the app. Here that is any address with the
word "gone" in it.
"""

import http.server
import json
import threading
import uuid
from quiet import QuietServer

# Every message the server sent: {"to", "title", "body", "data", ...}
sent: list[dict] = []
# Ticket id -> the address it was for.
tickets: dict[str, str] = {}


def reset() -> None:
    sent.clear()
    tickets.clear()


def to(address: str) -> list[dict]:
    """The messages sent to one phone."""
    return [message for message in sent if message["to"] == address]


class Service(http.server.BaseHTTPRequestHandler):
    def _reply(self, status: int, body) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"null")
        if self.path.endswith("/send"):
            messages = body if isinstance(body, list) else [body]
            if len(messages) > 100:
                return self._reply(400, {"errors": [{"code": "PUSH_TOO_MANY_NOTIFICATIONS"}]})
            answers = []
            for message in messages:
                if "gone" in message["to"]:
                    answers.append({"status": "error", "message": "The device is not registered", "details": {"error": "DeviceNotRegistered"}})
                    continue
                sent.append(message)
                ticket = str(uuid.uuid4())
                tickets[ticket] = message["to"]
                answers.append({"status": "ok", "id": ticket})
            return self._reply(200, {"data": answers})
        if self.path.endswith("/getReceipts"):
            return self._reply(200, {"data": {ticket: {"status": "ok"} for ticket in body.get("ids", []) if ticket in tickets}})
        self._reply(404, {"errors": [{"message": "Not found"}]})

    def log_message(self, *args):
        pass


def start(port: int) -> http.server.ThreadingHTTPServer:
    reset()
    server = QuietServer(("127.0.0.1", port), Service)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
