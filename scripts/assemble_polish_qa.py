"""Assemble captured real game frames into compact, looping review clips."""
from pathlib import Path
from tempfile import gettempdir
from PIL import Image
root = Path(__file__).resolve().parent.parent
out = root / 'art' / 'qa' / 'polish'
for name in ('chomp', 'snip', 'cable', 'hooks', 'spew', 'pulse', 'lava', 'ledge-0', 'ledge-1'):
    paths = sorted(Path('/tmp').glob(f'polish-{name}-[0-9][0-9][0-9].png')) or sorted(Path(gettempdir()).glob(f'polish-{name}-[0-9][0-9][0-9].png'))
    frames = [Image.open(path).convert('RGB').resize((480, 270), Image.Resampling.LANCZOS) for path in paths[::2]]
    if frames:
        palette = frames[0].quantize(colors=48)
        frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        frames[0].save(out / f'{name}.gif', save_all=True, append_images=frames[1:], duration=100 if name not in ('lava', 'ledge-0', 'ledge-1') else (134 if name == 'lava' else 66), loop=0, optimize=True)
        print(name, len(frames))
