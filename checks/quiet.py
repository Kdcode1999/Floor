"""The web server every stand-in in this folder runs on.

A browser that moves to another page drops the requests it had open, and a stand-in that was
still answering one then finds nobody listening. Python reports that with a long error on the
screen. It is not an error here, so this server says nothing about it. Everything else is
still reported.
"""

import http.server
import sys


class QuietServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)
