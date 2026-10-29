"""Package the existing full browser engine with the Windows launcher."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo-root', type=pathlib.Path, required=True)
    parser.add_argument('--exe', type=pathlib.Path, required=True)
    parser.add_argument('--out', type=pathlib.Path, required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--go-license', type=pathlib.Path, required=True)
    args = parser.parse_args()
    source = args.repo_root / 'jieqi'
    # Verify every original engine file before packaging, including the network.
    for line in (source / 'engine/SHA256SUMS').read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        actual = hashlib.sha256((source / 'engine' / name).read_bytes()).hexdigest()
        if digest != actual:
            raise ValueError(f'Engine checksum mismatch: {name}')
    network = json.loads((source / 'engine/manifest.json').read_text())['network']
    args.out.mkdir(parents=True, exist_ok=True)
    package = args.out / 'Guanqi-Jieqi'
    package.mkdir(exist_ok=False)
    web = package / 'web/jieqi'
    web.mkdir(parents=True)
    for file in source.iterdir():
        if file.is_file() and file.suffix in {'.js', '.html', '.css'}:
            shutil.copy2(file, web / file.name)
    shutil.copytree(source / 'engine', web / 'engine')
    # This portable package contains Jieqi only; keep offline navigation local.
    index = web / 'index.html'
    index.write_text(re.sub(r'<a\b[^>]*href="\.\./xiangqi/"[^>]*>.*?</a>', '',
                            index.read_text(encoding='utf-8')), encoding='utf-8')
    shutil.copy2(args.exe, package / '观棋揭棋.exe')
    launcher_source = package / 'source/launcher'
    shutil.copytree(source / 'windows/launcher', launcher_source)
    shutil.copy2(args.go_license, package / 'source/Go-LICENSE.txt')
    for name in ['package.py', '使用说明.txt']:
        shutil.copy2(source / 'windows' / name, package / ('使用说明.txt' if name.endswith('.txt') else 'source/package.py'))
    info = {'version': '2026.10.29', 'source_commit': args.commit,
            'platform': 'Windows 10/11 x64', 'engine': 'AB-JChess v0.2d full NNUE',
            'network_bytes': network['bytes'], 'network_sha256': network['sha256']}
    (package / '版本.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    archive = args.out / 'Guanqi-Jieqi-Windows-x64.zip'
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for file in sorted(package.rglob('*')):
            if file.is_file():
                output.write(file, file.relative_to(args.out).as_posix())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (args.out / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n', encoding='ascii')
    print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': digest}))


if __name__ == '__main__':
    main()
