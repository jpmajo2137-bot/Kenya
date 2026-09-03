#!/usr/bin/env python3
"""Upload iPad 12.9\" screenshots to App Store Connect (ko + en-US)."""
from __future__ import annotations

import hashlib
import time
from pathlib import Path

import jwt
import requests

ROOT = Path('/workspace')
APP_ID = '6807980665'
DISPLAY = 'APP_IPAD_PRO_3GEN_129'


def token() -> str:
    env = {}
    for line in (ROOT / '.secrets/apple.env').read_text().splitlines():
        if not line.strip() or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"')
    pk = Path(env['ASC_PRIVATE_KEY_PATH']).read_text()
    now = int(time.time())
    return jwt.encode(
        {'iss': env['ASC_ISSUER_ID'], 'iat': now - 30, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
        pk,
        algorithm='ES256',
        headers={'kid': env['ASC_KEY_ID']},
    )


def main():
    t = token()
    H = {'Authorization': f'Bearer {t}', 'Accept': 'application/json'}
    Hj = {**H, 'Content-Type': 'application/json'}

    r = requests.get(
        f'https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/appStoreVersions',
        headers=H,
        params={'filter[platform]': 'IOS'},
        timeout=60,
    )
    r.raise_for_status()
    vid = r.json()['data'][0]['id']
    r = requests.get(
        f'https://api.appstoreconnect.apple.com/v1/appStoreVersions/{vid}/appStoreVersionLocalizations',
        headers=H,
        timeout=60,
    )
    r.raise_for_status()
    locs = {x['attributes']['locale']: x['id'] for x in r.json()['data']}

    def ensure_set(loc_id: str) -> str:
        r = requests.get(
            f'https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets',
            headers=H,
            timeout=60,
        )
        r.raise_for_status()
        for s in r.json().get('data', []):
            if s['attributes'].get('screenshotDisplayType') == DISPLAY:
                sid = s['id']
                r2 = requests.get(
                    f'https://api.appstoreconnect.apple.com/v1/appScreenshotSets/{sid}/appScreenshots',
                    headers=H,
                    timeout=60,
                )
                for shot in r2.json().get('data', []):
                    requests.delete(
                        f'https://api.appstoreconnect.apple.com/v1/appScreenshots/{shot["id"]}',
                        headers=H,
                        timeout=60,
                    ).raise_for_status()
                return sid
        body = {
            'data': {
                'type': 'appScreenshotSets',
                'attributes': {'screenshotDisplayType': DISPLAY},
                'relationships': {
                    'appStoreVersionLocalization': {
                        'data': {'type': 'appStoreVersionLocalizations', 'id': loc_id}
                    }
                },
            }
        }
        r = requests.post(
            'https://api.appstoreconnect.apple.com/v1/appScreenshotSets',
            headers=Hj,
            json=body,
            timeout=60,
        )
        r.raise_for_status()
        return r.json()['data']['id']

    def upload_folder(set_id: str, folder: Path):
        for png in sorted(folder.glob('*.png')):
            data = png.read_bytes()
            body = {
                'data': {
                    'type': 'appScreenshots',
                    'attributes': {'fileName': png.name, 'fileSize': len(data)},
                    'relationships': {
                        'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}
                    },
                }
            }
            r = requests.post(
                'https://api.appstoreconnect.apple.com/v1/appScreenshots',
                headers=Hj,
                json=body,
                timeout=60,
            )
            r.raise_for_status()
            shot = r.json()['data']
            for op in shot['attributes'].get('uploadOperations') or []:
                headers = {h['name']: h['value'] for h in op.get('requestHeaders', [])}
                rr = requests.request(
                    op.get('method', 'PUT'), op['url'], data=data, headers=headers, timeout=180
                )
                if rr.status_code >= 300:
                    raise RuntimeError(f'{png.name} upload {rr.status_code}')
            commit = {
                'data': {
                    'type': 'appScreenshots',
                    'id': shot['id'],
                    'attributes': {
                        'uploaded': True,
                        'sourceFileChecksum': hashlib.md5(data).hexdigest(),
                    },
                }
            }
            r2 = requests.patch(
                f'https://api.appstoreconnect.apple.com/v1/appScreenshots/{shot["id"]}',
                headers=Hj,
                json=commit,
                timeout=60,
            )
            r2.raise_for_status()
            state = r2.json()['data']['attributes'].get('assetDeliveryState', {}).get('state')
            print('ok', folder.name, png.name, state)

    for locale, folder in [
        ('ko', ROOT / 'play-store-aso/screenshots/ipad129/ko'),
        ('en-US', ROOT / 'play-store-aso/screenshots/ipad129/en-US'),
    ]:
        sid = ensure_set(locs[locale])
        print('set', locale, sid)
        upload_folder(sid, folder)
    print('IPAD DONE')


if __name__ == '__main__':
    main()
