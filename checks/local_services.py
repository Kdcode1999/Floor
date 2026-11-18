"""Everything a walk-through needs running, started with one call.

    services = local_services.start()
    ...
    services.stop()

That is: the local backend (a real Postgres with Floor's migrations, behind Supabase's API),
the web app with its server routes, and stand-ins for the outside services those routes talk
to: the video host and the notification service.

The web app must have been built first. `checks/README.md` has the command.
"""

import dataclasses
import http.server
import subprocess

import fake_push
import fake_video_host
import fixtures
import local_supabase
from common import start_web, stop_web

SUPABASE_PORT = 8095
WEB_PORT = 8096
VIDEO_PORT = 8097
PUSH_PORT = 8098

WEB = f"http://127.0.0.1:{WEB_PORT}"

# The server's own settings for a walk-through. In real use these come from Vercel.
SERVER_SETTINGS = {
    "SUPABASE_SECRET_KEY": local_supabase.SERVICE_KEY,
    "CRON_SECRET": "local-cron-secret",
    "BUNNY_STREAM_API_URL": f"http://127.0.0.1:{VIDEO_PORT}",
    "BUNNY_STREAM_LIBRARY_ID": fake_video_host.LIBRARY,
    "BUNNY_STREAM_API_KEY": fake_video_host.API_KEY,
    "BUNNY_STREAM_CDN_HOST": f"http://127.0.0.1:{VIDEO_PORT}",
    "BUNNY_STREAM_TOKEN_KEY": fake_video_host.TOKEN_KEY,
    "BUNNY_STREAM_WEBHOOK_KEY": "local-webhook-key",
    "EXPO_PUSH_URL": f"http://127.0.0.1:{PUSH_PORT}",
}


@dataclasses.dataclass
class Services:
    backend: http.server.ThreadingHTTPServer
    video: http.server.ThreadingHTTPServer
    push: http.server.ThreadingHTTPServer
    web: subprocess.Popen
    # The short film every video plays as, as one file: what a mentor would upload.
    film: bytes

    def stop(self) -> None:
        stop_web(self.web)
        for server in (self.push, self.video, self.backend):
            server.shutdown()


def start(settings: dict[str, str] | None = None) -> Services:
    """Starts everything on a new, empty Floor database. `settings` adds to the server's own."""
    backend = local_supabase.start(SUPABASE_PORT)
    film, pieces = fixtures.film()
    video = fake_video_host.start(VIDEO_PORT, pieces, fixtures.picture("Lesson", size=(640, 360), kind="JPEG"))
    push = fake_push.start(PUSH_PORT)
    web = start_web(WEB_PORT, {**SERVER_SETTINGS, **(settings or {})})
    return Services(backend, video, push, web, film)
