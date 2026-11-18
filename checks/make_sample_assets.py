"""Makes the pictures and the short film the phone app's sample space shows, into
mobile/assets/sample/. They are kept in the repository: run this only to change them.

Nothing here is real. The candles are a seeded random walk, not market prices, and each picture
says it is a sample. The proof imitates no bank and no receipt.

Needs Python with Pillow, and ffmpeg.

    python checks/make_sample_assets.py
"""

import pathlib
import random
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path(__file__).resolve().parent.parent / "mobile" / "assets" / "sample"
BG, GRID, UP, DOWN, TEXT, DIM = "#0B0D18", "#1B1F33", "#3DDC97", "#FF6B6B", "#E8EAF6", "#8A90B0"


def font(size: int) -> ImageFont.ImageFont:
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if pathlib.Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def candles(count: int, seed: int) -> list[tuple[float, float, float, float]]:
    """Made-up prices: each candle opens where the last one closed and wanders from there."""
    rng = random.Random(seed)
    price, rows = 100.0, []
    for _ in range(count):
        open_ = price
        close = open_ + rng.uniform(-1.6, 1.9)
        high = max(open_, close) + rng.uniform(0.1, 0.9)
        low = min(open_, close) - rng.uniform(0.1, 0.9)
        rows.append((open_, high, low, close))
        price = close
    return rows


def chart(size: tuple[int, int], rows, shown: int | None = None, title: str | None = "Sample chart", note: str = "Made-up prices, for the sample space", corner: str | None = None) -> Image.Image:
    """A candle chart. `shown` draws only the first candles. `corner` puts a small caption at the bottom right instead of a title."""
    width, height = size
    image = Image.new("RGB", size, BG)
    draw = ImageDraw.Draw(image)
    pad_l, pad_r, pad_b = int(width * 0.05), int(width * 0.05), int(height * 0.12)
    pad_t = int(height * (0.17 if title else 0.08))
    for line in range(6):
        y = pad_t + (height - pad_t - pad_b) * line / 5
        draw.line([(pad_l, y), (width - pad_r, y)], fill=GRID, width=1)
    low = min(row[2] for row in rows)
    high = max(row[1] for row in rows)

    def place(value: float) -> float:
        return pad_t + (high - value) / (high - low) * (height - pad_t - pad_b)

    step = (width - pad_l - pad_r) / len(rows)
    body = max(2, int(step * 0.6))
    for index, (open_, top, bottom, close) in enumerate(rows[: shown or len(rows)]):
        x = pad_l + step * index + step / 2
        colour = UP if close >= open_ else DOWN
        draw.line([(x, place(top)), (x, place(bottom))], fill=colour, width=max(1, body // 5))
        upper, lower = sorted((place(open_), place(close)))
        draw.rectangle([x - body / 2, upper, x + body / 2, max(lower, upper + 1)], fill=colour)
    if title:
        draw.text((pad_l, int(height * 0.045)), title, fill=TEXT, font=font(int(height * 0.055)))
        draw.text((pad_l, int(height * 0.11)), note, fill=DIM, font=font(int(height * 0.032)))
    if corner:
        # Bottom right, clear of where the app lays a viewer's name over a lesson.
        words = font(int(height * 0.04))
        draw.text((width - pad_r - draw.textlength(corner, font=words), height - int(height * 0.085)), corner, fill=DIM, font=words)
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    chart((1280, 800), candles(64, 7)).save(OUT / "chart.jpg", quality=82, optimize=True)
    chart((1280, 800), candles(64, 21), title="Sample chart 2").save(OUT / "chart-2.jpg", quality=82, optimize=True)

    # A stand-in for the picture a member sends as proof.
    proof = Image.new("RGB", (900, 1200), "#12152A")
    draw = ImageDraw.Draw(proof)
    draw.rounded_rectangle([60, 60, 840, 1140], radius=36, outline="#2A2F4A", width=4)
    draw.text((120, 150), "Sample proof", fill=TEXT, font=font(64))
    draw.text((120, 250), "A member's screenshot would show here.", fill=DIM, font=font(32))
    draw.text((120, 300), "This picture is part of the sample space.", fill=DIM, font=font(32))
    for line in range(5):
        draw.rounded_rectangle([120, 440 + line * 110, 780 - (line % 3) * 120, 490 + line * 110], radius=14, fill="#1B1F33")
    proof.save(OUT / "proof.jpg", quality=80, optimize=True)

    # The film every sample lesson plays: a chart drawing itself, one candle at a time.
    rows = candles(48, 11)
    caption = "Sample film"
    chart((640, 360), rows, title=None, corner=caption).save(OUT / "lesson-poster.jpg", quality=80, optimize=True)
    with tempfile.TemporaryDirectory() as folder:
        frames = pathlib.Path(folder)
        count = 0
        for shown in range(1, len(rows) + 1):
            frame = chart((640, 360), rows, shown, title=None, corner=caption)
            for _ in range(4):
                frame.save(frames / f"f{count:04d}.png")
                count += 1
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-framerate", "12", "-i", str(frames / "f%04d.png"),
                "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=22050", "-shortest",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "30", "-g", "24",
                "-c:a", "aac", "-b:a", "24k", "-movflags", "+faststart", str(OUT / "lesson.mp4"),
            ],
            check=True,
        )
    for made in sorted(OUT.iterdir()):
        print(f"{made.name}: {made.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
