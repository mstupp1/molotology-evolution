"""Assemble generated art with sprite-gen's component extractor; never slice poses by equal slots.

Usage: python scripts/prepare_assets.py PATH_TO_GENERATED_IMAGES
The source images are named explicitly to keep this assembly reproducible.
"""
import json
import math
import shutil
import struct
import sys
import wave
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.agents/skills/sprite-gen'))
from sprite_gen.frames.extract import extract_component_images, fit_row_to_cells

source = Path(sys.argv[1])
out = ROOT / 'public/assets'
out.mkdir(parents=True, exist_ok=True)
manifest = {'player': [], 'creatures': [], 'props': []}
names = {
    'wreck': 'exec-8a9c2101-e4cc-4339-bd78-53c79551bfaa.png',
    'divers': 'exec-b6d73ac1-90ca-4dd7-b579-529838948419.png',
    'creatures': 'exec-79ce9e66-bcc4-44c4-95e6-88e86db93663.png',
    'props': 'exec-f48a3855-e4ea-45d5-af9f-7b77236403a6.png'
}
archive = ROOT / 'art/source'
archive.mkdir(parents=True, exist_ok=True)
for key, filename in names.items():
    original = source / filename
    if not original.exists():
        original = source / f'{key}.png'
    target = archive / f'{key}.png'
    if original.resolve() != target.resolve():
        shutil.copy2(original, target)
shutil.copy2(archive / 'wreck.png', out / 'wreck.png')

def clean_alpha(im):
    im = im.convert('RGBA')
    # Generated transparent PNGs can contain invisible RGB and tiny nonzero alpha noise.
    alpha = im.getchannel('A').point(lambda a: 0 if a < 48 else a)
    im.putalpha(alpha)
    return im

# Prefer the weathered edit; keep the original sheet as its art reference.
diver_source = archive / 'divers-gritty.png'
if not diver_source.exists():
    diver_source = archive / 'divers.png'
sheet = clean_alpha(Image.open(diver_source))
atlas = Image.new('RGBA', (160 * 6, 160 * 3))
previews = []
for row in range(3):
    strip = sheet.crop((0, round(row * sheet.height / 3), sheet.width, round((row + 1) * sheet.height / 3)))
    poses = extract_component_images(strip, 6)
    if poses is None or len(poses) != 6:
        raise ValueError(f'Expected six separated player poses in row {row}')
    frames = fit_row_to_cells(poses, 160, 160, 7, 10, {'align_x': 'foot-centroid', 'align_y': 'bottom'})
    for col, frame in enumerate(frames):
        atlas.alpha_composite(frame, (col * 160, row * 160))
        assert frame.getbbox() is not None
        manifest['player'].append({'stage': row, 'pose': col, 'bounds': frame.getbbox()})
        previews.append(frame)
atlas.save(out / 'diver.png')
for key in ['creatures', 'props']:
    sheet = clean_alpha(Image.open(archive / f'{key}.png'))
    for row in range(2):
        strip = sheet.crop((0, round(row * sheet.height / 2), sheet.width, round((row + 1) * sheet.height / 2)))
        images = extract_component_images(strip, 4)
        if images is None or len(images) != 4:
            raise ValueError(f'Expected four separated {key} objects in row {row}')
        for col, im in enumerate(images):
            im = im.crop(im.getbbox())
            index = row * 4 + col
            filename = f'{"creature" if key == "creatures" else "prop"}-{index}.png'
            im.save(out / filename)
            manifest[key].append({'file': filename, 'size': im.size, 'bounds': im.getbbox()})

# Small interface items are native pixel graphics, with no baked-in UI lettering.
for name in ['key', 'harpoon-icon', 'molt-icon']:
    im = Image.new('RGBA', (80, 48)); d = ImageDraw.Draw(im)
    if name == 'key':
        d.ellipse((8, 8, 32, 32), outline='#e6c781', width=5); d.line((30, 20, 69, 20), fill='#e6c781', width=5)
        d.line((58, 20, 58, 32), fill='#e6c781', width=5); d.line((67, 20, 67, 29), fill='#e6c781', width=5)
    elif name == 'harpoon-icon':
        d.line((7, 30, 68, 18), fill='#b7d9d5', width=4); d.polygon([(62, 12), (77, 16), (64, 26), (67, 19)], fill='#e5c589')
        d.rectangle((17, 30, 35, 35), fill='#a07a52')
    else:
        d.polygon([(39, 2), (65, 18), (56, 40), (38, 47), (18, 36), (13, 14)], fill='#6f3b65', outline='#d99bb1', width=2)
        d.line((39, 8, 36, 20, 48, 25, 36, 41), fill='#f2c1c0', width=3)
    im.save(out / f'{name}.png')

rate = 22050
for name, seconds in [('ambience', 8), ('slash', .22), ('hit', .2), ('harpoon', .32), ('refill', .7), ('molt', 1.5), ('death', 1.2)]:
    samples = bytearray()
    for i in range(int(rate * seconds)):
        t = i / rate; end = 1 - t / seconds
        if name == 'ambience':
            # Integer-period frequencies make the ambient loop continuous.
            v = .14 * math.sin(2*math.pi*48*t) + .07 * math.sin(2*math.pi*72*t) + .025 * math.sin(2*math.pi*113*t)
            v *= .65 + .15 * math.sin(2*math.pi*t / 8)
        elif name == 'slash': v = math.sin(2*math.pi*(700*t-900*t*t)) * end**3 * .2
        elif name == 'hit': v = (math.sin(2*math.pi*83*t) + .4*math.sin(2*math.pi*177*t)) * end**4 * .28
        elif name == 'harpoon': v = math.sin(2*math.pi*(440*t-350*t*t)) * end**2 * .2
        elif name == 'refill': v = math.sin(2*math.pi*(330*t+110*t*t)) * math.sin(math.pi*t/seconds) * .1
        elif name == 'molt': v = (math.sin(2*math.pi*(95*t-14*t*t)) + .3*math.sin(2*math.pi*189*t)) * math.sin(math.pi*t/seconds) * .2
        else: v = math.sin(2*math.pi*(180*t-50*t*t)) * end**2 * .2
        samples.extend(struct.pack('<h', int(max(-1, min(1, v))*32767)))
    with wave.open(str(out / f'{name}.wav'), 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(samples)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
preview = Image.new('RGB', atlas.size, '#10232e'); preview.paste(atlas, mask=atlas.getchannel('A')); preview.save(archive.parent / 'player-contact-sheet.png')
previews[1].save(archive.parent / 'walk-preview.png', save_all=True, append_images=[previews[2]], duration=130, loop=0, format='PNG')
print(json.dumps({'playerFrames': len(manifest['player']), 'creatures': len(manifest['creatures']), 'props': len(manifest['props']), 'output': str(out)}))
