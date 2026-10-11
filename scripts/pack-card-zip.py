"""Build a deterministic, lossless download bundle using Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_STORED
import hashlib, json
root = Path(__file__).resolve().parents[1] / 'public' / 'strong-cards'
manifest = json.loads((root / 'manifest.json').read_text())
files = [root / 'README.md', root / 'manifest.json'] + sorted((root/'originals').glob('*.png')) + sorted((root/'previews').glob('*.jpg'))
assert len(files) == 22
output = root / 'strong-cards-10.zip'
with ZipFile(output, 'w', compression=ZIP_STORED) as bundle:
    for file in files:
        info = ZipInfo('strong-cards/' + file.relative_to(root).as_posix(), (2026, 10, 11, 0, 0, 0))
        bundle.writestr(info, file.read_bytes())
with ZipFile(output) as bundle:
    assert bundle.testzip() is None
    for card in manifest['cards']:
        data = bundle.read('strong-cards/' + card['file'])
        assert hashlib.sha256(data).hexdigest() == card['sha256']
print(f'ZIP: {output.stat().st_size:,} bytes; 10 original hashes and all CRCs verified.')
