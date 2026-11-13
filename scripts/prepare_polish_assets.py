"""Pack generated transparent limb parts at game resolution without altering their artwork."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
for name in ('special-jaw', 'special-pincer'):
    image = Image.open(root / 'art' / 'source' / f'{name}.png').convert('RGBA')
    box = image.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    image = image.crop(box)
    image = image.resize((256, round(image.height * 256 / image.width)), Image.Resampling.LANCZOS)
    image.save(root / 'public' / 'assets' / f'{name}.png', optimize=True)
    print(name, image.size)
