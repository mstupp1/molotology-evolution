"""Pack transparent update sources into the existing 256px enemy-cell format.

Run with Pillow after placing the three generated sources in art/source/.
A shared scale across each sheet preserves the size of bodies between poses.
"""
import json
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
manifest = json.loads((OUT / 'motion-manifest.json').read_text())
for name in ['rigging-diver', 'cinder-diver']:
    sheet = Image.open(ROOT / f'art/source/enemy-{name}.png').convert('RGBA')
    frames = []
    for i in range(12):
        col, row = i % 6, i // 6
        cell = sheet.crop((round(col * sheet.width / 6), round(row * sheet.height / 2), round((col + 1) * sheet.width / 6), round((row + 1) * sheet.height / 2)))
        cell.putalpha(cell.getchannel('A').point(lambda a: 0 if a < 80 else a))
        frames.append(cell.crop(cell.getbbox()))
    scale = min(232 / max(f.width for f in frames), 228 / max(f.height for f in frames))
    atlas = Image.new('RGBA', (1536, 512)); bounds = []
    for i, frame in enumerate(frames):
        frame = frame.resize((max(1, round(frame.width * scale)), max(1, round(frame.height * scale))), Image.Resampling.NEAREST)
        cell = Image.new('RGBA', (256, 256)); cell.alpha_composite(frame, (128 - frame.width // 2, 128 - frame.height // 2))
        bounds.append(cell.getbbox()); atlas.alpha_composite(cell, (i % 6 * 256, i // 6 * 256))
    atlas.save(OUT / f'enemy-{name}.png')
    manifest['enemies'][name] = {'frames': 12, 'cell': [256, 256], 'referenceBounds': bounds[0], 'bounds': bounds}
molt = ROOT / 'art/source/molt-relic.png'
if molt.exists():
    icon = Image.open(molt).convert('RGBA'); icon = icon.crop(icon.getbbox()); icon.thumbnail((112, 112), Image.Resampling.NEAREST)
    cell = Image.new('RGBA', (128, 128)); cell.alpha_composite(icon, ((128 - icon.width) // 2, (128 - icon.height) // 2)); cell.save(OUT / 'molt-icon.png')
(OUT / 'motion-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
