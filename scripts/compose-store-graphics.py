#!/usr/bin/env python3
"""Compose marketing screenshots + feature graphic for Play / App Store."""
from __future__ import annotations

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path('/workspace')
RAW = ROOT / 'play-store-aso/screenshots/raw'
LOGO = ROOT / 'public/logo.png'
FONT = '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'
FONT_FALLBACK = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

SCREENS = [
    {
        'file': '01-home.png',
        'ko': ('Oxford 5000 · 영단어', '입문부터 고급까지 레벨별 학습'),
        'en': ('Oxford 5000 Words', 'Learn by level from beginner to advanced'),
    },
    {
        'file': '02-day-list.png',
        'ko': ('Day 단위로 학습', '매일 부담 없이 나눠서 암기'),
        'en': ('Day-based Plans', 'Study a little every day'),
    },
    {
        'file': '03b-flashcard.png',
        'ko': ('플래시카드 복습', '단어 · 뜻 · 예문을 한눈에'),
        'en': ('Flashcards', 'Words, meanings & examples'),
    },
    {
        'file': '04b-quiz-play.png',
        'ko': ('퀴즈로 실력 점검', '5 · 10 · 20 · 50 문제로 확인'),
        'en': ('Quiz Yourself', '5 to 50 questions per session'),
    },
    {
        'file': '05-wrong.png',
        'ko': ('오답노트 복습', '틀린 단어만 모아 다시 보기'),
        'en': ('Wrong Notes', 'Review only the words you miss'),
    },
    {
        'file': '06-dictionary.png',
        'ko': ('한영 사전 검색', '궁금한 단어를 바로 찾아 저장'),
        'en': ('EN ↔ KO Dictionary', 'Search and save words instantly'),
    },
    {
        'file': '07-categories.png',
        'ko': ('주제 · 상황별 단어장', '여행 · 비즈니스 · 일상까지'),
        'en': ('Topic Decks', 'Travel, business, daily life & more'),
    },
]


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(FONT, size=size)
    except Exception:
        return ImageFont.truetype(FONT_FALLBACK, size=size)


def gradient(size: tuple[int, int], c1=(8, 16, 40), c2=(12, 90, 110), c3=(70, 40, 140)) -> Image.Image:
    w, h = size
    img = Image.new('RGB', size)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        if t < 0.55:
            u = t / 0.55
            r = int(c1[0] + (c2[0] - c1[0]) * u)
            g = int(c1[1] + (c2[1] - c1[1]) * u)
            b = int(c1[2] + (c2[2] - c1[2]) * u)
        else:
            u = (t - 0.55) / 0.45
            r = int(c2[0] + (c3[0] - c2[0]) * u)
            g = int(c2[1] + (c3[1] - c2[1]) * u)
            b = int(c2[2] + (c3[2] - c2[2]) * u)
        for x in range(w):
            # soft diagonal tint
            v = (x / w) * 0.08
            px[x, y] = (
                min(255, int(r * (1 + v))),
                min(255, int(g * (1 + v * 0.6))),
                min(255, int(b * (1 - v * 0.2))),
            )
    return img


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


def fit_cover(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    bw, bh = box
    iw, ih = im.size
    scale = max(bw / iw, bh / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - bw) // 2
    top = (nh - bh) // 2
    return im.crop((left, top, left + bw, top + bh))


def draw_centered_text(draw: ImageDraw.ImageDraw, xy, text, font_obj, fill, max_width=None):
    x, y = xy
    bbox = draw.textbbox((0, 0), text, font=font_obj)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    if max_width and tw > max_width:
        # naive shrink
        size = font_obj.size
        while tw > max_width and size > 18:
            size -= 2
            font_obj = font(size)
            bbox = draw.textbbox((0, 0), text, font=font_obj)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
    draw.text((x - tw / 2, y), text, font=font_obj, fill=fill)
    return th


def compose_phone(raw: Path, title: str, subtitle: str, out: Path, size=(1080, 1920)):
    W, H = size
    canvas = gradient((W, H))
    draw = ImageDraw.Draw(canvas)

    # decorative blobs
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-200, -120, 420, 380), fill=(0, 180, 200, 40))
    od.ellipse((W - 420, H - 480, W + 160, H + 80), fill=(120, 80, 255, 45))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), overlay).convert('RGB')
    draw = ImageDraw.Draw(canvas)

    # captions
    title_h = draw_centered_text(draw, (W / 2, 70), title, font(64), (255, 255, 255), max_width=W - 80)
    draw_centered_text(draw, (W / 2, 70 + title_h + 18), subtitle, font(34), (180, 230, 235), max_width=W - 100)

    # phone frame
    phone_w, phone_h = 820, 1480
    phone_x = (W - phone_w) // 2
    phone_y = 220
    radius = 70

    # shadow
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (phone_x + 18, phone_y + 28, phone_x + phone_w + 18, phone_y + phone_h + 28),
        radius=radius,
        fill=(0, 0, 0, 110),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), shadow).convert('RGB')

    # bezel
    bezel = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bezel)
    bd.rounded_rectangle(
        (phone_x, phone_y, phone_x + phone_w, phone_y + phone_h),
        radius=radius,
        fill=(18, 22, 32, 255),
    )
    canvas = Image.alpha_composite(canvas.convert('RGBA'), bezel).convert('RGB')

    # screen inset
    inset = 18
    sw, sh = phone_w - inset * 2, phone_h - inset * 2
    screen = fit_cover(Image.open(raw).convert('RGB'), (sw, sh))
    mask = rounded_mask((sw, sh), radius - 10)
    canvas.paste(screen, (phone_x + inset, phone_y + inset), mask)

    # logo badge
    if LOGO.exists():
        logo = Image.open(LOGO).convert('RGBA').resize((72, 72), Image.Resampling.LANCZOS)
        lx, ly = W // 2 - 36, H - 110
        # white circle bg
        badge = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        bdraw = ImageDraw.Draw(badge)
        bdraw.ellipse((lx - 8, ly - 8, lx + 80, ly + 80), fill=(255, 255, 255, 235))
        canvas = Image.alpha_composite(canvas.convert('RGBA'), badge)
        canvas.paste(logo, (lx, ly), logo)
        canvas = canvas.convert('RGB')

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, format='PNG', optimize=True)
    print('wrote', out, canvas.size)


def feature_graphic(out: Path):
    W, H = 1024, 500
    canvas = gradient((W, H), c1=(6, 20, 48), c2=(10, 110, 120), c3=(40, 70, 170))
    draw = ImageDraw.Draw(canvas)
    if LOGO.exists():
        logo = Image.open(LOGO).convert('RGBA').resize((210, 210), Image.Resampling.LANCZOS)
        canvas.paste(logo, (70, (H - 210) // 2), logo)
        canvas = canvas.convert('RGB')
        draw = ImageDraw.Draw(canvas)
    draw.text((320, 145), 'JHP 영어 단어 암기', font=font(54), fill=(255, 255, 255))
    draw.text((320, 220), 'Oxford 5000 · Day학습 · 퀴즈 · 오답노트', font=font(28), fill=(190, 240, 245))
    draw.text((320, 270), 'JHP English Words', font=font(26), fill=(160, 200, 255))
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, format='PNG', optimize=True)
    print('wrote', out)


def main():
    feature_graphic(ROOT / 'play-store-aso/feature-graphic.png')
    for i, s in enumerate(SCREENS, 1):
        raw = RAW / s['file']
        if not raw.exists():
            print('missing', raw)
            continue
        compose_phone(
            raw,
            s['ko'][0],
            s['ko'][1],
            ROOT / f'play-store-aso/screenshots/phone/ko-KR/{i:02d}.png',
            size=(1080, 1920),
        )
        compose_phone(
            raw,
            s['en'][0],
            s['en'][1],
            ROOT / f'play-store-aso/screenshots/phone/en-US/{i:02d}.png',
            size=(1080, 1920),
        )
        # iPhone 6.7"
        compose_phone(
            raw,
            s['ko'][0],
            s['ko'][1],
            ROOT / f'play-store-aso/screenshots/iphone67/ko/{i:02d}.png',
            size=(1290, 2796),
        )
        compose_phone(
            raw,
            s['en'][0],
            s['en'][1],
            ROOT / f'play-store-aso/screenshots/iphone67/en-US/{i:02d}.png',
            size=(1290, 2796),
        )


if __name__ == '__main__':
    main()
