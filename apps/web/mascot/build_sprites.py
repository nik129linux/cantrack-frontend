"""Pack the Blender frames into the sprite sheets the web app plays.

    python apps/web/mascot/build_sprites.py

Reads mascot/frames/<pose>/00.png..23.png (written by animate_mascot.py) and
writes public/mascot/<pose>.webp: one row of 24 frames, 300x250 each, with
alpha. MascotSprite.tsx plays them with CSS steps(); keep FRAMES in sync.
"""

from pathlib import Path

from PIL import Image

FRAMES = 24
FRAME_SIZE = (300, 250)
HERE = Path(__file__).resolve().parent
SOURCE = HERE / "frames"
TARGET = HERE.parent / "public" / "mascot"


def build(pose_dir: Path) -> Path:
    frames = sorted(pose_dir.glob("*.png"))
    if len(frames) != FRAMES:
        raise SystemExit(f"{pose_dir.name}: expected {FRAMES} frames, found {len(frames)}")
    width, height = FRAME_SIZE
    sheet = Image.new("RGBA", (width * FRAMES, height), (0, 0, 0, 0))
    for index, path in enumerate(frames):
        frame = Image.open(path).convert("RGBA").resize(FRAME_SIZE, Image.LANCZOS)
        sheet.paste(frame, (index * width, 0))
    out = TARGET / f"{pose_dir.name}.webp"
    sheet.save(out, "WEBP", quality=82, method=6, alpha_quality=90)
    return out


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for pose_dir in sorted(p for p in SOURCE.iterdir() if p.is_dir()):
        out = build(pose_dir)
        print(f"{out.relative_to(HERE.parent)}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
