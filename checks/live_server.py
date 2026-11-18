"""LiveKit's own open-source server, run on this machine for a walk-through.

It is the real thing, not a stand-in: the same server Floor runs in production, in its
development mode, which takes the key `devkey` and the secret `secret`. It is not part of the
repository. Build it once from LiveKit's source (needs Go):

    git clone --depth 1 --branch v1.13.11 https://github.com/livekit/livekit.git /tmp/livekit-src
    go build -C /tmp/livekit-src -o /tmp/livekit-server ./cmd/server

or set LIVEKIT_SERVER to wherever a copy of the server is.
"""

import os
import pathlib
import subprocess
import sys
import urllib.request

from common import pause

PORT = 7880
URL = f"ws://127.0.0.1:{PORT}"
KEY = "devkey"
SECRET = "secret"
SETTINGS = {"LIVEKIT_URL": URL, "LIVEKIT_API_KEY": KEY, "LIVEKIT_API_SECRET": SECRET}


def start() -> subprocess.Popen:
    server = pathlib.Path(os.environ.get("LIVEKIT_SERVER", "/tmp/livekit-server"))
    if not server.is_file():
        sys.exit(f"No LiveKit server at {server}. See the top of checks/fake_live.py for how to build one.")
    running = subprocess.Popen(
        [str(server), "--dev", "--bind", "127.0.0.1", "--node-ip", "127.0.0.1"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(50):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=1)
            return running
        except Exception:
            pause(0.2)
    running.kill()
    sys.exit("The LiveKit server did not start.")
