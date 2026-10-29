"""Run the shipped executable and full WASM engine on the Windows runner."""
import argparse
import hashlib
import json
import pathlib
import struct
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=pathlib.Path, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='guanqi windows smoke ') as scratch:
        root = pathlib.Path(scratch)
        with zipfile.ZipFile(args.archive) as package:
            package.extractall(root)
        app = root / 'Guanqi-Jieqi'
        exe = app / '观棋揭棋.exe'
        data = exe.read_bytes()
        assert data[:2] == b'MZ'
        pe_offset = struct.unpack_from('<I', data, 0x3C)[0]
        assert data[pe_offset:pe_offset + 4] == b'PE\0\0'
        assert struct.unpack_from('<H', data, pe_offset + 4)[0] == 0x8664
        ready = root / 'ready.json'
        with (root / 'launcher.log').open('wb') as log:
            process = subprocess.Popen([str(exe), '-no-browser', '-port', '0', '-ready-file', str(ready)],
                                       cwd=root, stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 30
                while True:
                    if ready.exists():
                        try:
                            info = json.loads(ready.read_text(encoding='utf-8-sig'))
                            break
                        except (OSError, json.JSONDecodeError):
                            pass
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError((root / 'launcher.log').read_text(encoding='utf-8', errors='replace'))
                    time.sleep(.1)
                base = info['url']
                assert urllib.parse.urlparse(base).hostname == '127.0.0.1'
                required_headers = {'Cross-Origin-Opener-Policy': 'same-origin',
                                    'Cross-Origin-Embedder-Policy': 'require-corp',
                                    'Cross-Origin-Resource-Policy': 'same-origin'}
                def get(path):
                    response = urllib.request.urlopen(urllib.parse.urljoin(base, path), timeout=30)
                    for key, value in required_headers.items():
                        assert response.headers[key] == value, (key, response.headers)
                    return response
                with get('') as response:
                    html = response.read().decode('utf-8')
                    assert 'record-confirm' not in html and 'record-revealed' in html and 'show-winrate' in html
                    assert '../xiangqi/' not in html
                for path, mime in [('app.js', 'javascript'), ('style.css', 'text/css'),
                                   ('engine/abjchess.wasm', 'application/wasm')]:
                    with get(path) as response:
                        assert mime in response.headers['Content-Type']
                        assert len(response.read()) > 0
                manifest = json.loads(get('engine/manifest.json').read())
                whole = hashlib.sha256()
                for part in manifest['network']['parts']:
                    with get('engine/' + part['file']) as response:
                        chunk = response.read()
                    assert len(chunk) == part['bytes']
                    assert hashlib.sha256(chunk).hexdigest() == part['sha256']
                    whole.update(chunk)
                assert whole.hexdigest() == manifest['network']['sha256']
                try:
                    urllib.request.urlopen(urllib.request.Request(base, method='POST'))
                    raise AssertionError('POST should be rejected')
                except urllib.error.HTTPError as error:
                    assert error.code == 405
                subprocess.run(['node', str(app / 'web/jieqi/engine/verify.cjs')], check=True, timeout=120)
                print(json.dumps({'platform': 'Windows x64', 'startup': 'passed',
                                  'headers_and_assets': 'passed', 'full_network_sha256': whole.hexdigest(),
                                  'wasm_two_positions_five_candidates': 'passed'}))
            finally:
                process.terminate()
                process.wait(timeout=10)


if __name__ == '__main__':
    main()
