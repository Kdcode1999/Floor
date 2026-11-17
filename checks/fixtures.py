"""Ready-made people, spaces and pictures for the walk-throughs that run on the local backend."""

import io

from PIL import Image, ImageDraw

import local_db
import local_supabase

TERMS = "2026-11-17"


def person(email: str, name: str) -> str:
    """An account with a name. Returns its id."""
    user_id = local_supabase.account(email)
    local_db.run("update public.profiles set display_name = %s where id = %s", [name, user_id])
    return user_id


def space(mentor_id: str, name: str, slug: str, theme: str = "night") -> str:
    """A space, opened the way the app opens one. Returns its id."""
    found = local_db.as_person(mentor_id, "select public.create_space(%s, %s, %s, %s) as id", [name, slug, theme, TERMS])
    return str(found[0]["id"])


def join(user_id: str, slug: str) -> None:
    local_db.as_person(user_id, "select public.join_space(%s)", [slug])


def vip(space_id: str, user_id: str, days: float) -> None:
    """Gives VIP that ends this many days from now. A negative number is VIP that already ended."""
    local_db.run(
        "update public.memberships set vip_until = now() + make_interval(secs => %s) where space_id = %s and user_id = %s",
        [days * 86400, space_id, user_id],
    )


def picture(text: str, colour: str = "#2b3a67", size: tuple[int, int] = (600, 800), kind: str = "PNG") -> bytes:
    """A picture with a few words on it, standing in for a receipt or a logo."""
    image = Image.new("RGB", size, colour)
    draw = ImageDraw.Draw(image)
    draw.rectangle([24, 24, size[0] - 24, size[1] - 24], outline="#ffffff", width=3)
    draw.text((48, 48), text, fill="#ffffff")
    out = io.BytesIO()
    image.save(out, kind)
    return out.getvalue()


def proof(space_id: str, user_id: str, kind: str, note: str, name: str = "receipt.png") -> str:
    """A request for VIP with its proof picture already uploaded. Returns the request's id."""
    path = f"{space_id}/{user_id}/{name}"
    local_supabase.files[("proofs", path)] = (picture(note), "image/png")
    local_db.run("insert into storage.objects (bucket_id, name, owner) values ('proofs', %s, %s)", [path, user_id])
    found = local_db.as_person(user_id, "select public.request_access(%s, %s, %s, %s) as id", [space_id, kind, path, note])
    return str(found[0]["id"])
