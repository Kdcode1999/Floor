"""A stand-in for a browser's push service (Apple's, for an iPhone web app), over HTTPS with a
certificate made for the run.

It decrypts what it is sent the way the browser would, with the subscription's own private key
(RFC 8291, aes128gcm), and keeps the alert as JSON. So a check sees exactly what reached the
phone. It also checks that each message is signed by Floor's key (the VAPID header).

    keys = fake_web_push.Subscriber("vee")    # what a browser makes when it subscribes
    server = fake_web_push.start(PORT, tmpdir)
    ...
    fake_web_push.received["vee"]             # the alerts that reached vee, decrypted
"""

import base64
import hashlib
import hmac
import http.server
import json
import os
import ssl
import struct
import subprocess
import threading

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF, HKDFExpand

received: dict[str, list[dict]] = {}
signed_by: dict[str, list[str]] = {}
_subscribers: dict[str, "Subscriber"] = {}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class Subscriber:
    """One browser's subscription: its key pair and its secret, as the browser keeps them."""

    def __init__(self, name: str):
        self.name = name
        self.private = ec.generate_private_key(ec.SECP256R1())
        self.public = self.private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.auth = os.urandom(16)
        _subscribers[name] = self

    def subscription(self, port: int) -> dict:
        return {"endpoint": f"https://127.0.0.1:{port}/push/{self.name}", "expirationTime": None, "keys": {"p256dh": _b64(self.public), "auth": _b64(self.auth)}}

    def decrypt(self, body: bytes) -> bytes:
        salt, record_size, id_length = body[:16], struct.unpack(">I", body[16:20])[0], body[20]
        sender = body[21 : 21 + id_length]
        ciphertext = body[21 + id_length :]
        assert record_size >= len(ciphertext)
        shared = self.private.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender))
        ikm = HKDF(algorithm=hashes.SHA256(), length=32, salt=self.auth, info=b"WebPush: info\x00" + self.public + sender).derive(shared)
        # HKDF-Extract once, then Expand for each of the two labels.
        prk = hmac.new(salt, ikm, hashlib.sha256).digest()
        key = HKDFExpand(algorithm=hashes.SHA256(), length=16, info=b"Content-Encoding: aes128gcm\x00").derive(prk)
        nonce = HKDFExpand(algorithm=hashes.SHA256(), length=12, info=b"Content-Encoding: nonce\x00").derive(prk)
        padded = AESGCM(key).decrypt(nonce, ciphertext, None)
        # The last record ends with a 2, then any zeros of padding.
        return padded.rstrip(b"\x00")[:-1]


class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        name = self.path.rsplit("/", 1)[-1]
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        subscriber = _subscribers.get(name)
        if not subscriber or self.headers.get("Content-Encoding") != "aes128gcm":
            self.send_response(410 if not subscriber else 400)
            self.end_headers()
            return
        received.setdefault(name, []).append(json.loads(subscriber.decrypt(body)))
        signed_by.setdefault(name, []).append(self.headers.get("Authorization", ""))
        self.send_response(201)
        self.end_headers()


def start(port: int, folder: str) -> http.server.ThreadingHTTPServer:
    """Starts the push service on HTTPS, with a certificate made here for 127.0.0.1."""
    cert, key = os.path.join(folder, "push.crt"), os.path.join(folder, "push.key")
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1",
         "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", cert],
        check=True, capture_output=True,
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), _Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
