#!/usr/bin/env python3
"""Upload ASO listings + screenshots to Google Play and App Store Connect."""
from __future__ import annotations

import hashlib
import json
import mimetypes
import time
from pathlib import Path

import jwt
import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

ROOT = Path('/workspace')
PKG = 'com.jph.oxfordenglish'
ASC_APP_ID = '6807980665'


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8').strip()


def upload_play():
    sa = json.loads((ROOT / '.secrets/play-service-account.json').read_text())
    creds = service_account.Credentials.from_service_account_info(
        sa, scopes=['https://www.googleapis.com/auth/androidpublisher']
    )
    svc = build('androidpublisher', 'v3', credentials=creds, cache_discovery=False)
    edit = svc.edits().insert(packageName=PKG, body={}).execute()
    eid = edit['id']
    print('Play edit', eid)

    for lang in ['ko-KR', 'en-US']:
        base = ROOT / 'play-store-aso/listings' / lang
        body = {
            'language': lang,
            'title': read_text(base / 'title.txt'),
            'shortDescription': read_text(base / 'short_description.txt'),
            'fullDescription': read_text(base / 'full_description.txt'),
        }
        svc.edits().listings().update(packageName=PKG, editId=eid, language=lang, body=body).execute()
        print('listing', lang, 'ok')

        # replace phone screenshots
        existing = (
            svc.edits()
            .images()
            .list(packageName=PKG, editId=eid, language=lang, imageType='phoneScreenshots')
            .execute()
            .get('images')
            or []
        )
        for im in existing:
            svc.edits().images().delete(
                packageName=PKG, editId=eid, language=lang, imageType='phoneScreenshots', imageId=im['id']
            ).execute()
        print('deleted old phone screenshots', lang, len(existing))

        shot_dir = ROOT / 'play-store-aso/screenshots/phone' / lang
        for png in sorted(shot_dir.glob('*.png')):
            media = MediaFileUpload(str(png), mimetype='image/png', resumable=True)
            svc.edits().images().upload(
                packageName=PKG,
                editId=eid,
                language=lang,
                imageType='phoneScreenshots',
                media_body=media,
            ).execute()
            print(' uploaded phone', lang, png.name)

        # feature graphic
        fg = ROOT / 'play-store-aso/feature-graphic.png'
        # delete existing
        fgs = (
            svc.edits()
            .images()
            .list(packageName=PKG, editId=eid, language=lang, imageType='featureGraphic')
            .execute()
            .get('images')
            or []
        )
        for im in fgs:
            svc.edits().images().delete(
                packageName=PKG, editId=eid, language=lang, imageType='featureGraphic', imageId=im['id']
            ).execute()
        media = MediaFileUpload(str(fg), mimetype='image/png', resumable=True)
        svc.edits().images().upload(
            packageName=PKG, editId=eid, language=lang, imageType='featureGraphic', media_body=media
        ).execute()
        print(' feature graphic', lang, 'ok')

        # icon refresh
        icons = (
            svc.edits()
            .images()
            .list(packageName=PKG, editId=eid, language=lang, imageType='icon')
            .execute()
            .get('images')
            or []
        )
        for im in icons:
            svc.edits().images().delete(
                packageName=PKG, editId=eid, language=lang, imageType='icon', imageId=im['id']
            ).execute()
        icon = ROOT / 'play-store-aso/icon-512.png'
        media = MediaFileUpload(str(icon), mimetype='image/png', resumable=True)
        svc.edits().images().upload(
            packageName=PKG, editId=eid, language=lang, imageType='icon', media_body=media
        ).execute()
        print(' icon', lang, 'ok')

    # contact details
    svc.edits().details().update(
        packageName=PKG,
        editId=eid,
        body={
            'defaultLanguage': 'ko-KR',
            'contactWebsite': 'https://jhpenglish.web.app',
            'contactEmail': 'jpmajo2137@gmail.com',
        },
    ).execute()

    committed = svc.edits().commit(packageName=PKG, editId=eid).execute()
    print('Play committed', committed.get('id'))


def asc_token() -> str:
    env = {}
    for line in (ROOT / '.secrets/apple.env').read_text().splitlines():
        if not line.strip() or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"')
    key_id = env.get('ASC_KEY_ID') or env.get('KEY_ID')
    issuer = env.get('ASC_ISSUER_ID') or env.get('ISSUER_ID')
    key_path = Path(env.get('ASC_KEY_PATH', '.secrets/AuthKey_UGCP9W5AHM.p8'))
    if not key_path.is_absolute():
        key_path = ROOT / key_path
    pk = key_path.read_text()
    return jwt.encode(
        {'iss': issuer, 'iat': int(time.time()), 'exp': int(time.time()) + 1100, 'aud': 'appstoreconnect-v1'},
        pk,
        algorithm='ES256',
        headers={'kid': key_id, 'typ': 'JWT'},
    )


def asc_headers(token: str, json_body: bool = True) -> dict:
    h = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
    if json_body:
        h['Content-Type'] = 'application/json'
    return h


def upload_asc_file(upload_ops: list, file_path: Path):
    data = file_path.read_bytes()
    for op in upload_ops:
        method = op.get('method', 'PUT')
        url = op['url']
        headers = {h['name']: h['value'] for h in op.get('requestHeaders', [])}
        # Apple expects raw bytes
        r = requests.request(method, url, data=data, headers=headers, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f'upload failed {r.status_code}: {r.text[:300]}')


def md5_file(path: Path) -> str:
    h = hashlib.md5()
    h.update(path.read_bytes())
    return h.hexdigest()


def ensure_screenshot_set(token: str, loc_id: str, display_type: str) -> str:
    r = requests.get(
        f'https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets',
        headers=asc_headers(token, False),
        timeout=60,
    )
    r.raise_for_status()
    for s in r.json().get('data', []):
        if s['attributes'].get('screenshotDisplayType') == display_type:
            # delete existing screenshots in set
            sid = s['id']
            r2 = requests.get(
                f'https://api.appstoreconnect.apple.com/v1/appScreenshotSets/{sid}/appScreenshots',
                headers=asc_headers(token, False),
                timeout=60,
            )
            for shot in r2.json().get('data', []):
                requests.delete(
                    f'https://api.appstoreconnect.apple.com/v1/appScreenshots/{shot["id"]}',
                    headers=asc_headers(token, False),
                    timeout=60,
                ).raise_for_status()
            return sid
    # create
    body = {
        'data': {
            'type': 'appScreenshotSets',
            'attributes': {'screenshotDisplayType': display_type},
            'relationships': {
                'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': loc_id}}
            },
        }
    }
    r = requests.post(
        'https://api.appstoreconnect.apple.com/v1/appScreenshotSets',
        headers=asc_headers(token),
        json=body,
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f'create screenshot set failed: {r.status_code} {r.text[:400]}')
    return r.json()['data']['id']


def upload_asc_screenshots(token: str, set_id: str, folder: Path):
    for png in sorted(folder.glob('*.png')):
        size = png.stat().st_size
        body = {
            'data': {
                'type': 'appScreenshots',
                'attributes': {'fileName': png.name, 'fileSize': size},
                'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}},
            }
        }
        r = requests.post(
            'https://api.appstoreconnect.apple.com/v1/appScreenshots',
            headers=asc_headers(token),
            json=body,
            timeout=60,
        )
        if r.status_code >= 300:
            raise RuntimeError(f'create screenshot failed: {r.status_code} {r.text[:400]}')
        shot = r.json()['data']
        ops = shot['attributes'].get('uploadOperations') or []
        upload_asc_file(ops, png)
        # commit
        commit_body = {
            'data': {
                'type': 'appScreenshots',
                'id': shot['id'],
                'attributes': {'uploaded': True, 'sourceFileChecksum': md5_file(png)},
            }
        }
        r2 = requests.patch(
            f'https://api.appstoreconnect.apple.com/v1/appScreenshots/{shot["id"]}',
            headers=asc_headers(token),
            json=commit_body,
            timeout=60,
        )
        if r2.status_code >= 300:
            raise RuntimeError(f'commit screenshot failed: {r2.status_code} {r2.text[:400]}')
        print(' ASC screenshot', png.name, 'state', r2.json()['data']['attributes'].get('assetDeliveryState'))


def upload_asc():
    token = asc_token()
    H = asc_headers(token, False)

    # version
    r = requests.get(
        f'https://api.appstoreconnect.apple.com/v1/apps/{ASC_APP_ID}/appStoreVersions',
        headers=H,
        params={'filter[platform]': 'IOS'},
        timeout=60,
    )
    r.raise_for_status()
    ver_id = r.json()['data'][0]['id']

    r = requests.get(
        f'https://api.appstoreconnect.apple.com/v1/appStoreVersions/{ver_id}/appStoreVersionLocalizations',
        headers=H,
        timeout=60,
    )
    r.raise_for_status()
    locs = {loc['attributes']['locale']: loc for loc in r.json()['data']}

    mapping = {
        'ko': ROOT / 'fastlane/metadata/ios/ko',
        'en-US': ROOT / 'fastlane/metadata/ios/en-US',
    }
    for locale, folder in mapping.items():
        loc = locs[locale]
        body = {
            'data': {
                'type': 'appStoreVersionLocalizations',
                'id': loc['id'],
                'attributes': {
                    'description': read_text(folder / 'description.txt'),
                    'keywords': read_text(folder / 'keywords.txt'),
                    'marketingUrl': read_text(folder / 'marketing_url.txt'),
                    'supportUrl': read_text(folder / 'support_url.txt'),
                    'promotionalText': read_text(folder / 'promotional_text.txt'),
                },
            }
        }
        rr = requests.patch(
            f'https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{loc["id"]}',
            headers=asc_headers(token),
            json=body,
            timeout=60,
        )
        if rr.status_code >= 300:
            raise RuntimeError(f'patch localization {locale}: {rr.status_code} {rr.text[:400]}')
        print('ASC localization', locale, 'ok')

        # screenshots APP_IPHONE_67
        shot_locale_dir = 'ko' if locale == 'ko' else 'en-US'
        set_id = ensure_screenshot_set(token, loc['id'], 'APP_IPHONE_67')
        upload_asc_screenshots(token, set_id, ROOT / 'play-store-aso/screenshots/iphone67' / shot_locale_dir)
        print('ASC screenshots', locale, 'uploaded')

    # App info subtitle/name
    r = requests.get(f'https://api.appstoreconnect.apple.com/v1/apps/{ASC_APP_ID}/appInfos', headers=H, timeout=60)
    r.raise_for_status()
    info_id = r.json()['data'][0]['id']
    r = requests.get(
        f'https://api.appstoreconnect.apple.com/v1/appInfos/{info_id}/appInfoLocalizations', headers=H, timeout=60
    )
    r.raise_for_status()
    for loc in r.json()['data']:
        locale = loc['attributes']['locale']
        if locale == 'ko':
            name = read_text(ROOT / 'fastlane/metadata/ios/ko/name.txt')
            subtitle = read_text(ROOT / 'fastlane/metadata/ios/ko/subtitle.txt')
        elif locale == 'en-US':
            name = read_text(ROOT / 'fastlane/metadata/ios/en-US/name.txt')
            subtitle = read_text(ROOT / 'fastlane/metadata/ios/en-US/subtitle.txt')
        else:
            continue
        body = {
            'data': {
                'type': 'appInfoLocalizations',
                'id': loc['id'],
                'attributes': {
                    'name': name,
                    'subtitle': subtitle,
                    'privacyPolicyUrl': 'https://jhpenglish.web.app/privacy',
                    'privacyChoicesUrl': 'https://jhpenglish.web.app/delete-data',
                },
            }
        }
        rr = requests.patch(
            f'https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/{loc["id"]}',
            headers=asc_headers(token),
            json=body,
            timeout=60,
        )
        if rr.status_code >= 300:
            raise RuntimeError(f'patch appInfo {locale}: {rr.status_code} {rr.text[:400]}')
        print('ASC appInfo', locale, 'ok')


if __name__ == '__main__':
    upload_play()
    upload_asc()
    print('ALL STORE UPLOADS DONE')
