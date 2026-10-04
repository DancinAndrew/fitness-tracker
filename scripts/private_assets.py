#!/usr/bin/env python3
"""Local photo custody and isolated backup recovery. No network or cloud writes."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import zipfile

PHOTO_SUFFIXES = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'}


def secure_dir(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)


def save_json(path, value):
    secure_dir(path.parent)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix='.writing-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if Path(temp).exists():
            Path(temp).unlink()


def digest(path):
    sha = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(chunk)
    return sha.hexdigest()


def manifest(root):
    path = root / 'manifest.json'
    return json.loads(path.read_text()) if path.exists() else {'version': 1, 'assets': {}}


def ingest(root, paths):
    secure_dir(root)
    secure_dir(root / 'assets')
    index = manifest(root)
    result = []
    for name in paths:
        source = Path(name).resolve(strict=True)
        if not source.is_file() or source.suffix.lower() not in PHOTO_SUFFIXES:
            raise ValueError('Only supported local photo files may be ingested')
        if not 0 < source.stat().st_size <= 50 * 1024 * 1024:
            raise ValueError('Photo must be nonempty and at most 50 MiB')
        sha = digest(source)
        asset_id = 'photo_' + sha[:32]
        existing = index['assets'].get(asset_id)
        if existing:
            if digest(root / existing['file']) != sha:
                raise ValueError('Stored asset failed integrity check')
        else:
            relative = f'assets/{asset_id}{source.suffix.lower()}'
            destination = root / relative
            fd, temporary = tempfile.mkstemp(dir=destination.parent, prefix='.copy-')
            os.close(fd)
            try:
                shutil.copyfile(source, temporary)
                if digest(Path(temporary)) != sha:
                    raise ValueError('Photo changed during copy; retry from original')
                os.replace(temporary, destination)
            finally:
                if Path(temporary).exists():
                    Path(temporary).unlink()
            index['assets'][asset_id] = {'file': relative, 'sha256': sha, 'bytes': destination.stat().st_size}
            save_json(root / 'manifest.json', index)
        result.append({'asset_ref': asset_id, 'saved_locally': True})
    return {'assets': result, 'cloud_saved': False}


def backup(root, target):
    target = target.resolve()
    if target.is_relative_to(root.resolve()):
        raise ValueError('Backup destination must be outside the private source directory')
    secure_dir(target.parent)
    if target.exists():
        raise ValueError('Backup destination already exists; choose a new filename')
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream, zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
        for folder in ('assets', 'pending', 'exports'):
            base = root / folder
            if base.exists():
                for item in sorted(base.rglob('*')):
                    if item.is_symlink():
                        raise ValueError('Backup does not follow symbolic links')
                    if item.is_file():
                        archive.write(item, item.relative_to(root).as_posix())
        if (root / 'manifest.json').exists():
            archive.write(root / 'manifest.json', 'manifest.json')
    return {'backup_created': True, 'cloud_backup': 'only previously exported files', 'photos_encrypted': False}


def restore(archive_path, destination):
    if destination.exists():
        raise ValueError('Restore requires a new isolated directory')
    with zipfile.ZipFile(archive_path) as archive:
        members = archive.infolist()
        if sum(m.file_size for m in members) > 512 * 1024 * 1024:
            raise ValueError('Archive exceeds 512 MiB restore limit')
        for member in members:
            path = PurePosixPath(member.filename)
            mode = member.external_attr >> 16
            if path.is_absolute() or '..' in path.parts or '\\' in member.filename or stat.S_ISLNK(mode):
                raise ValueError('Unsafe archive member')
            if not path.parts or path.parts[0] not in {'assets', 'pending', 'exports', 'manifest.json'}:
                raise ValueError('Unexpected archive scope')
        secure_dir(destination)
        for member in members:
            target = destination / member.filename
            if member.is_dir():
                secure_dir(target)
            else:
                secure_dir(target.parent)
                with archive.open(member) as source, target.open('xb') as out:
                    os.chmod(target, 0o600)
                    shutil.copyfileobj(source, out)
        for entry in manifest(destination)['assets'].values():
            relative = PurePosixPath(entry['file'])
            if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'assets':
                raise ValueError('Invalid manifest path')
            if digest(destination / entry['file']) != entry['sha256']:
                raise ValueError('Restored photo failed integrity check')
    return {'restored_locally': True, 'cloud_restored': False, 'integrity_verified': True}


def stage(root, payload_file):
    payload = json.loads(payload_file.read_text())
    request_id = payload.get('request_id', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{8,100}', request_id):
        raise ValueError('A stable request_id is required')
    path = root / 'pending' / f'{request_id}.json'
    if path.exists() and json.loads(path.read_text()) != payload:
        raise ValueError('Request id already staged with different content')
    save_json(path, payload)
    return {'request_id': request_id, 'state': 'pending', 'cloud_saved': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1] / '.private')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('ingest').add_argument('photos', nargs='+')
    sub.add_parser('stage').add_argument('payload', type=Path)
    sub.add_parser('backup').add_argument('target', type=Path)
    rest = sub.add_parser('restore'); rest.add_argument('archive', type=Path); rest.add_argument('destination', type=Path)
    args = parser.parse_args()
    secure_dir(args.root)
    if args.command == 'ingest': result = ingest(args.root, args.photos)
    elif args.command == 'stage': result = stage(args.root, args.payload)
    elif args.command == 'backup': result = backup(args.root, args.target)
    else: result = restore(args.archive, args.destination)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
