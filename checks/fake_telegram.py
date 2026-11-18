"""A stand-in for Telegram's Bot API, for the walk-throughs in this folder.

It answers the calls Floor's server makes as its bot (who am I, send updates here, post this,
take that down) and keeps what the bot posted, so a walk-through can read it. It can also play
Telegram's other part: telling Floor's server what the bot saw, with the secret word the
server registered, the way Telegram does.

Like the real one, it refuses a wrong token, a webhook secret with characters Telegram does not
allow, and an empty message. A walk-through can make it refuse a chat the way Telegram does
when the bot was removed or may not post.
"""

import http.server
import itertools
import json
import re
import threading
import time
import urllib.error
import urllib.request

from quiet import QuietServer

# A made-up bot token with the right shape, put together from parts so that no line of this
# file reads as a real token to a tool that scans the repo for leaked secrets.
TOKEN = ":".join(["1234567890", "AA" + "x" * 33])
BOT = "FloorTeaserBot"

# Where Floor's server asked for updates to be sent, and the word it wants with each one.
webhook: dict = {"url": "", "secret": "", "allowed": []}
# Every message the bot posted, oldest first: {"chat_id", "text", "message_id"}.
sent: list[dict] = []
# Every message the bot took down: (chat id, message id).
deleted: list[tuple[int, int]] = []
# Chats the bot cannot post in: chat id -> (status, Telegram's own description).
refusing: dict[int, tuple[int, str]] = {}
# The name of every method called, in order.
calls: list[str] = []

_ids = itertools.count(100)


def reset() -> None:
    webhook.update(url="", secret="", allowed=[])
    sent.clear()
    deleted.clear()
    refusing.clear()
    calls.clear()


def texts(chat_id: int) -> list[str]:
    """What the bot posted in one chat, oldest first."""
    return [message["text"] for message in sent if message["chat_id"] == chat_id]


class Api(http.server.BaseHTTPRequestHandler):
    def _reply(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _refuse(self, status: int, description: str) -> None:
        self._reply(status, {"ok": False, "error_code": status, "description": description})

    def do_POST(self):
        found = re.fullmatch(r"/bot([^/]+)/(\w+)", self.path)
        params = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if not found:
            return self._refuse(404, "Not Found")
        token, method = found.groups()
        if token != TOKEN:
            return self._refuse(401, "Unauthorized")
        calls.append(method)

        if method == "getMe":
            return self._reply(200, {"ok": True, "result": {"id": 1234567890, "is_bot": True, "first_name": "Floor", "username": BOT}})
        if method == "getWebhookInfo":
            return self._reply(200, {"ok": True, "result": {"url": webhook["url"], "pending_update_count": 0}})
        if method == "setWebhook":
            url, secret = params.get("url", ""), params.get("secret_token", "")
            if not re.match(r"https?://", url):
                return self._refuse(400, "Bad Request: bad webhook: An HTTPS URL must be provided for webhook")
            if secret and not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", secret):
                return self._refuse(400, "Bad Request: secret token contains unallowed characters")
            webhook.update(url=url, secret=secret, allowed=params.get("allowed_updates") or [])
            return self._reply(200, {"ok": True, "result": True, "description": "Webhook was set"})
        if method == "sendMessage":
            chat, text = params.get("chat_id"), params.get("text")
            if not isinstance(text, str) or text.strip() == "":
                return self._refuse(400, "Bad Request: message text is empty")
            if len(text) > 4096:
                return self._refuse(400, "Bad Request: message is too long")
            if chat in refusing:
                return self._refuse(*refusing[chat])
            message = {"chat_id": chat, "text": text, "message_id": next(_ids)}
            sent.append(message)
            return self._reply(200, {"ok": True, "result": {"message_id": message["message_id"], "chat": {"id": chat}, "text": text}})
        if method == "deleteMessage":
            if params.get("chat_id") in refusing:
                return self._refuse(*refusing[params.get("chat_id")])
            deleted.append((params.get("chat_id"), params.get("message_id")))
            return self._reply(200, {"ok": True, "result": True})
        self._refuse(404, "Not Found: method not found")

    def log_message(self, *args):
        pass


def start(port: int) -> http.server.ThreadingHTTPServer:
    reset()
    server = QuietServer(("127.0.0.1", port), Api)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# --- Telegram's other part: telling Floor what the bot saw -----------------------------------------


def update(body: dict, secret: str | None = None) -> int:
    """Sends Floor's server an update, to the address it registered. Returns the status it answered.

    `secret` is the word sent with it. Left out, it is the one the server registered, as with
    the real Telegram. Give another to play someone pretending to be Telegram.
    """
    if not webhook["url"]:
        raise RuntimeError("Floor's server has not registered a webhook yet")
    request = urllib.request.Request(
        webhook["url"],
        data=json.dumps({"update_id": next(_ids), **body}).encode(),
        headers={"Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": webhook["secret"] if secret is None else secret},
    )
    try:
        return urllib.request.urlopen(request, timeout=30).status
    except urllib.error.HTTPError as error:
        return error.code


def channel_post(chat_id: int, title: str, text: str, secret: str | None = None) -> int:
    """Someone with the right to post writes in a channel the bot is an admin of."""
    post = {"message_id": next(_ids), "date": int(time.time()), "chat": {"id": chat_id, "title": title, "type": "channel"}, "text": text}
    return update({"channel_post": post}, secret)


def private_message(user_id: int, text: str) -> int:
    """Someone writes to the bot directly."""
    message = {"message_id": next(_ids), "date": int(time.time()), "chat": {"id": user_id, "type": "private", "first_name": "Someone"}, "text": text}
    return update({"message": message})


def kicked(chat_id: int, title: str) -> int:
    """The bot is taken out of a chat. Telegram tells Floor, and from then on refuses its posts there."""
    refusing[chat_id] = (403, "Forbidden: bot was kicked from the channel chat")
    change = {
        "chat": {"id": chat_id, "title": title, "type": "channel"},
        "date": int(time.time()),
        "old_chat_member": {"status": "administrator"},
        "new_chat_member": {"status": "kicked"},
    }
    return update({"my_chat_member": change})
