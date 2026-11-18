"""A stand-in for the card processors (Paystack and Flutterwave), for the walk-throughs.

It speaks the parts of each processor that Floor uses, under /paystack and /flutterwave, and
holds Floor to the same rules the real ones do:

- every API call needs the mentor's secret key, and anything else is answered 401
- a payment is started under Floor's own name for it, and a page to pay on is handed back
- the page has a Pay button and a Cancel button, and sends the member back the way the real
  page does, with the same words in the address
- asking about a payment tells the truth about it, whoever asks and however often
- a webhook is signed the way each processor signs: Paystack with an HMAC-SHA512 of the body
  under the secret key, Flutterwave with the word the mentor chose

A walk-through can also pay without the page (`pay`, as when a member pays and never comes
back), send a webhook itself (`send_hook`), genuine or forged, and make a key stop working
(`revoked`).
"""

import hashlib
import hmac
import html
import http.server
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from quiet import QuietServer

def made_up_key(provider: str, tail: str, test: bool = False) -> str:
    """A key with the shape of that processor's secret keys, and nothing behind it. It is put
    together from parts so that no line in this folder reads as a real key to a tool that
    scans the repo for leaked secrets."""
    if provider == "paystack":
        return "_".join(["sk", "test" if test else "live", tail])
    return "-".join(["FLWSECK_TEST" if test else "FLWSECK", tail, "X"])


# The secret keys this stand-in accepts. They have the shape of live keys.
KEYS = {
    "paystack": made_up_key("paystack", "floorchecks00000000000000000001"),
    "flutterwave": made_up_key("flutterwave", "floorchecks00000000000000000001"),
}
# The word the mentor "chose" for Flutterwave's webhooks.
HOOK_WORD = "local-flutterwave-word"

# Floor's name for the payment -> what the processor knows about it.
#   provider, id, asked (hundredths), paid (hundredths), currency, email, title, status,
#   back (where to send the member), cancel (where to send them if they back out)
payments: dict[str, dict] = {}
# Every API call made, as (provider, method, path), so a walk-through can see what Floor asked.
calls: list[tuple[str, str, str]] = []
# Processors whose key has stopped working, as when a mentor makes a new key in their dashboard.
revoked: set[str] = set()
_next_id = [495000]
_base = [""]


def reset() -> None:
    payments.clear()
    calls.clear()
    revoked.clear()


def pay(reference: str, fraction: float = 1.0, status: str = "paid") -> None:
    """Marks a payment as paid, as if the member had paid on the page. `fraction` pays less."""
    payment = payments[reference]
    payment["status"] = status
    payment["paid"] = int(payment["asked"] * fraction) if status == "paid" else 0


def send_hook(reference: str, address: str, forged: bool = False) -> int:
    """Sends Floor the webhook the processor sends when a payment goes through. Answers with
    the status Floor replied with. A forged one is signed by somebody who lacks the secret."""
    payment = payments[reference]
    if payment["provider"] == "paystack":
        body = json.dumps({
            "event": "charge.success",
            "data": {"id": payment["id"], "reference": reference, "status": "success", "amount": payment["paid"], "currency": payment["currency"]},
        }).encode()
        key = made_up_key("paystack", "somebodyelseskey0000000000000001") if forged else KEYS["paystack"]
        headers = {"x-paystack-signature": hmac.new(key.encode(), body, hashlib.sha512).hexdigest()}
    else:
        body = json.dumps({
            "event": "charge.completed",
            "data": {"id": payment["id"], "tx_ref": reference, "status": "successful", "amount": payment["paid"] / 100, "currency": payment["currency"]},
        }).encode()
        headers = {"verif-hash": "a-guess" if forged else HOOK_WORD}
    request = urllib.request.Request(address, data=body, method="POST", headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def _with(address: str, extra: dict[str, str]) -> str:
    """An address with more words added to its query, the way both processors add theirs."""
    return address + ("&" if "?" in address else "?") + urllib.parse.urlencode(extra)


class Processor(http.server.BaseHTTPRequestHandler):
    def _json(self, status: int, body) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _page(self, text: str) -> None:
        data = text.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _go(self, address: str) -> None:
        self.send_response(303)
        self.send_header("Location", address)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _body(self) -> dict:
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            value = json.loads(raw or b"{}")
        except ValueError:
            value = {}
        return value if isinstance(value, dict) else {}

    def _allowed(self, provider: str) -> bool:
        return provider not in revoked and self.headers.get("Authorization") == f"Bearer {KEYS[provider]}"

    def _route(self, method: str) -> None:
        parts = urllib.parse.urlsplit(self.path)
        pieces = [piece for piece in parts.path.split("/") if piece]
        query = dict(urllib.parse.parse_qsl(parts.query))
        provider = pieces[0] if pieces and pieces[0] in KEYS else None
        if provider is None:
            return self._json(404, {"message": "Not found"})
        rest = pieces[1:]

        # The page a member pays on. No key: the member's browser opens it.
        if rest[:1] == ["checkout"] and len(rest) >= 2:
            return self._checkout(provider, rest[1], rest[2] if len(rest) > 2 else None, method)

        calls.append((provider, method, "/" + "/".join(rest)))
        if not self._allowed(provider):
            if provider == "paystack":
                return self._json(401, {"status": False, "message": "Invalid key"})
            return self._json(401, {"status": "error", "message": "Invalid authorization key", "data": None})
        if provider == "paystack":
            return self._paystack(method, rest)
        return self._flutterwave(method, rest, query)

    # ---------------------------------------------------------------- Paystack

    def _paystack(self, method: str, rest: list[str]) -> None:
        if method == "POST" and rest == ["transaction", "initialize"]:
            sent = self._body()
            reference = str(sent.get("reference") or "")
            if not reference or not sent.get("email") or not str(sent.get("amount", "")).isdigit():
                return self._json(400, {"status": False, "message": "Invalid transaction parameters"})
            if reference in payments:
                return self._json(400, {"status": False, "message": "Duplicate Transaction Reference"})
            if sent.get("currency") not in ("NGN", "GHS", "KES", "ZAR", "USD"):
                return self._json(400, {"status": False, "message": "Currency not supported by merchant"})
            _next_id[0] += 1
            payments[reference] = {
                "provider": "paystack", "id": _next_id[0], "asked": int(sent["amount"]), "paid": 0,
                "currency": sent["currency"], "email": sent["email"], "title": "", "status": "open",
                "back": sent.get("callback_url") or "", "cancel": (sent.get("metadata") or {}).get("cancel_action") or "",
            }
            return self._json(200, {
                "status": True, "message": "Authorization URL created",
                "data": {"authorization_url": f"{_base[0]}/paystack/checkout/{reference}", "access_code": "code", "reference": reference},
            })
        if method == "GET" and rest[:2] == ["transaction", "verify"] and len(rest) == 3:
            payment = payments.get(urllib.parse.unquote(rest[2]))
            if not payment or payment["provider"] != "paystack":
                return self._json(400, {"status": False, "message": "Transaction reference not found"})
            # Paystack calls a payment nobody has finished "abandoned".
            status = {"paid": "success", "open": "abandoned", "failed": "failed"}[payment["status"]]
            return self._json(200, {
                "status": True, "message": "Verification successful",
                "data": {
                    "id": payment["id"], "reference": urllib.parse.unquote(rest[2]), "status": status,
                    "amount": payment["paid"] if status == "success" else payment["asked"], "currency": payment["currency"],
                    "customer": {"email": payment["email"]},
                },
            })
        self._json(404, {"status": False, "message": "Not found"})

    # ---------------------------------------------------------------- Flutterwave

    def _flutterwave(self, method: str, rest: list[str], query: dict[str, str]) -> None:
        if method == "POST" and rest == ["v3", "payments"]:
            sent = self._body()
            reference = str(sent.get("tx_ref") or "")
            try:
                asked = round(float(sent.get("amount")) * 100)
            except (TypeError, ValueError):
                asked = 0
            if not reference or asked <= 0 or not (sent.get("customer") or {}).get("email") or not sent.get("redirect_url"):
                return self._json(400, {"status": "error", "message": "Invalid payment parameters", "data": None})
            _next_id[0] += 1
            payments[reference] = {
                "provider": "flutterwave", "id": _next_id[0], "asked": asked, "paid": 0,
                "currency": sent.get("currency") or "NGN", "email": sent["customer"]["email"],
                "title": (sent.get("customizations") or {}).get("title") or "", "status": "open",
                "back": sent["redirect_url"], "cancel": sent["redirect_url"],
            }
            return self._json(200, {"status": "success", "message": "Hosted Link", "data": {"link": f"{_base[0]}/flutterwave/checkout/{reference}"}})

        found = None
        if method == "GET" and rest[:2] == ["v3", "transactions"] and len(rest) == 4 and rest[3] == "verify":
            found = next(((name, each) for name, each in payments.items() if str(each["id"]) == rest[2] and each["provider"] == "flutterwave"), None)
        elif method == "GET" and rest == ["v3", "transactions", "verify_by_reference"]:
            name = query.get("tx_ref", "")
            found = (name, payments[name]) if name in payments and payments[name]["provider"] == "flutterwave" else None
        else:
            return self._json(404, {"status": "error", "message": "Not found", "data": None})
        # Flutterwave only knows a payment once somebody has tried to pay it.
        if not found or found[1]["status"] == "open":
            return self._json(404, {"status": "error", "message": "No transaction was found for this id", "data": None})
        name, payment = found
        return self._json(200, {
            "status": "success", "message": "Transaction fetched successfully",
            "data": {
                "id": payment["id"], "tx_ref": name, "status": "successful" if payment["status"] == "paid" else "failed",
                "amount": payment["paid"] / 100, "charged_amount": payment["paid"] / 100, "currency": payment["currency"],
                "customer": {"email": payment["email"]},
            },
        })

    # ---------------------------------------------------------------- the page to pay on

    def _checkout(self, provider: str, reference: str, action: str | None, method: str) -> None:
        payment = payments.get(reference)
        if not payment or payment["provider"] != provider:
            return self._json(404, {"message": "No such payment"})
        name = {"paystack": "Paystack", "flutterwave": "Flutterwave"}[provider]
        if method == "GET" and action is None:
            amount = f"{payment['currency']} {payment['asked'] / 100:,.2f}"
            return self._page(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} checkout</title>
<style>body{{font-family:system-ui,sans-serif;margin:0;padding:32px 20px;background:#f4f5f7;color:#111}}
main{{max-width:380px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.08)}}
button{{display:block;width:100%;padding:14px;margin-top:12px;border:0;border-radius:8px;font-size:16px}}
.pay{{background:#0aa36c;color:#fff}} .cancel{{background:#e9eaee}}</style></head>
<body><main>
<p>{name} (a stand-in for checks)</p>
<h1>Pay {html.escape(amount)}</h1>
<p>{html.escape(payment["title"] or "A Floor space")}</p>
<p>{html.escape(payment["email"])}</p>
<form method="post" action="/{provider}/checkout/{reference}/pay"><button class="pay" type="submit">Pay {html.escape(amount)}</button></form>
<form method="post" action="/{provider}/checkout/{reference}/cancel"><button class="cancel" type="submit">Cancel payment</button></form>
</main></body></html>""")
        if method == "POST" and action == "pay":
            if payment["status"] == "open":
                pay(reference)
            if provider == "paystack":
                return self._go(_with(payment["back"], {"trxref": reference, "reference": reference}))
            return self._go(_with(payment["back"], {"status": "successful", "tx_ref": reference, "transaction_id": str(payment["id"])}))
        if method == "POST" and action == "cancel":
            if provider == "paystack":
                return self._go(payment["cancel"] or payment["back"])
            return self._go(_with(payment["back"], {"status": "cancelled", "tx_ref": reference}))
        self._json(404, {"message": "Not found"})

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def log_message(self, *args):
        pass


def start(port: int) -> http.server.ThreadingHTTPServer:
    reset()
    _base[0] = f"http://127.0.0.1:{port}"
    server = QuietServer(("127.0.0.1", port), Processor)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
