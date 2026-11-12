"""Pack generated motion sheets with component extraction, shared scales and anchors.

Run after prepare_assets.py. Requires the same Pillow/NumPy sprite-gen environment.
"""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.agents/skills/sprite-gen'))
from sprite_gen.frames.extract import extract_component_images, fit_scale, fit_to_cell

SOURCE = ROOT / 'art/source'
OUT = ROOT / 'public/assets'
manifest = {'players': {}, 'enemies': {}, 'props': {}}


def clean(image):
    image = image.convert('RGBA')
    image.putalpha(image.getchannel('A').point(lambda a: 0 if a < 80 else a))
    return image


def rows(name, count, columns):
    sheet = clean(Image.open(SOURCE / f'{name}.png'))
    frames = []
    for row in range(count):
        strip = sheet.crop((0, round(row * sheet.height / count), sheet.width, round((row + 1) * sheet.height / count)))
        pieces = extract_component_images(strip, columns)
        if pieces is None or len(pieces) != columns:
            raise ValueError(f'{name} row {row}: expected {columns} separated sprites')
        frames.extend(piece.crop(piece.getbbox()) for piece in pieces)
    return frames


for stage, name in enumerate(['diver-motion', 'breach-motion', 'crab-motion']):
    frames = rows(name, 5, 6)
    idle = frames[24]
    scale = min((112 / idle.width if stage == 2 else 98 / idle.height), 144 / max(f.width for f in frames), 140 / max(f.height for f in frames))
    scale = min(scale, fit_scale(frames, 160, 160, 8, 10, 'foot-centroid'))
    atlas = Image.new('RGBA', (960, 800))
    bounds = []
    cells = []
    for i, frame in enumerate(frames):
        cell = fit_to_cell(frame, 160, 160, 8, 10, {'align_x': 'foot-centroid', 'align_y': 'bottom'}, scale=scale)
        atlas.alpha_composite(cell, (i % 6 * 160, i // 6 * 160))
        bbox = cell.getbbox()
        assert bbox and bbox[0] >= 1 and bbox[2] <= 159 and bbox[3] == 150, (name, i, bbox, scale)
        bounds.append(bbox)
        cells.append(cell)
    atlas.save(OUT / f'{name}.png')
    preview = Image.new('RGB', atlas.size, '#10232e'); preview.paste(atlas, mask=atlas.getchannel('A'))
    preview.save(ROOT / f'art/{name}-contact.png')
    cells[0].save(ROOT / f'art/{name}-walk.png', save_all=True, append_images=cells[1:6], duration=95, loop=0, format='PNG')
    manifest['players'][name] = {'frames': 30, 'cell': [160, 160], 'bounds': bounds}

for kind in ['urchin', 'jellyfish', 'octopus', 'shark', 'handcrab', 'hermit', 'angler']:
    name = f'enemy-{kind}'
    frames = rows(name, 2, 6)
    scale = min(232 / max(f.width for f in frames), 228 / max(f.height for f in frames))
    atlas = Image.new('RGBA', (1536, 512)); bounds = []
    for i, frame in enumerate(frames):
        size = (max(1, round(frame.width * scale)), max(1, round(frame.height * scale)))
        frame = frame.resize(size, Image.Resampling.NEAREST)
        cell = Image.new('RGBA', (256, 256))
        cell.alpha_composite(frame, (128 - frame.width // 2, 128 - frame.height // 2))
        atlas.alpha_composite(cell, (i % 6 * 256, i // 6 * 256))
        bbox = cell.getbbox(); assert bbox and bbox[0] > 0 and bbox[2] < 256 and bbox[1] > 0 and bbox[3] < 256
        bounds.append(bbox)
    atlas.save(OUT / f'{name}.png')
    manifest['enemies'][kind] = {'frames': 12, 'cell': [256, 256], 'referenceBounds': bounds[0], 'bounds': bounds}

props = rows('motion-props', 2, 4)
for name, image in zip(['harpoon-weapon', 'anchor-ring', 'field-record', 'coral-barrier', 'volcanic-vent', 'lava', 'tentacle', 'claw-sweep'], props):
    image.save(OUT / f'{name}.png')
    manifest['props'][name] = list(image.size)
# The barbed spear travels on the cable; the launcher stays in the character's hand.
weapon = props[0]
head = weapon.crop((round(weapon.width * 0.65), 0, weapon.width, weapon.height))
head = head.crop(head.getbbox()); head.save(OUT / 'harpoon-head.png')
manifest['props']['harpoon-head'] = list(head.size)
for name in ['abyss-far', 'wreck-ribs']:
    shutil.copy2(SOURCE / f'{name}.png', OUT / f'{name}.png')
(OUT / 'motion-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Packed 90 player frames, 84 enemy frames, eight object sprites and two parallax layers.')
