#!/usr/bin/env python3
"""按 macOS 图标网格规范，从 build/icon.orig.png 生成应用图标。

背景：macOS 的 App 图标画布是 1024x1024，但「图标本体」只能占中间 824x824
（四周各留 100px 透明边距），并且是圆角连续曲率的 squircle。若图标本体铺满
整张画布，Dock 里就会明显比其它 App 大一圈——这正是修复前的问题。

输入：build/icon.orig.png  —— 满幅（无留白）的 logo 源图，白底 + 深色字形。
输出：
  - build/icon.png          electron-builder 生成 .icns 用
  - src/main/assets/logo.png 开发期 BrowserWindow / Dock 运行时图标用

依赖 Pillow（仅改动 logo 源图时才需要运行本脚本）：pip3 install pillow
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "icon.orig.png"
OUTPUTS = [ROOT / "build" / "icon.png", ROOT / "src" / "main" / "assets" / "logo.png"]

CANVAS = 1024          # 画布边长
TILE = 824             # 图标本体边长（Apple 图标网格）
RADIUS = 185           # 圆角半径（Apple 图标网格：824 对应 185.4）
SS = 4                 # 蒙版超采样倍数（抗锯齿）

TOP_COLOR = (255, 255, 255)
BOTTOM_COLOR = (247, 247, 249)
EDGE_COLOR = (232, 232, 235)
EDGE_WIDTH = 2
GLYPH_COLOR = (27, 27, 27)


def squircle_mask(size: int) -> Image.Image:
    """生成 size x size 的 macOS 圆角方形蒙版（超采样后缩小以获得平滑边缘）。"""
    hi = size * SS
    mask = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, hi - 1, hi - 1), radius=RADIUS * SS * size / TILE, fill=255
    )
    return mask.resize((size, size), Image.LANCZOS)


def extract_glyph(img: Image.Image):
    """从白底源图中抠出深色字形，返回 (RGBA 字形图, 相对画布中心的偏移比例)。"""
    a = np.array(img.convert("RGBA")).astype(np.float64)
    lum = a[:, :, 0] * 0.299 + a[:, :, 1] * 0.587 + a[:, :, 2] * 0.114
    solid = a[:, :, 3] > 200

    bg = float(np.percentile(lum[solid], 95))     # 底色亮度
    fg = float(np.percentile(lum[solid], 1))      # 字形亮度
    alpha = np.clip((bg - lum) / max(bg - fg, 1.0), 0.0, 1.0) * solid

    ys, xs = np.nonzero(alpha > 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1

    glyph = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.uint8)
    glyph[:, :, 0:3] = GLYPH_COLOR
    glyph[:, :, 3] = (alpha[y0:y1, x0:x1] * 255).round().astype(np.uint8)

    w, h = img.size
    offset = (((x0 + x1) / 2 - w / 2) / w, ((y0 + y1) / 2 - h / 2) / h)
    return Image.fromarray(glyph, "RGBA"), offset


def build_tile(glyph: Image.Image, offset) -> Image.Image:
    # 竖向微渐变底色
    grad = np.linspace(0.0, 1.0, TILE)[:, None]
    rgb = np.zeros((TILE, TILE, 3), dtype=np.float64)
    for i in range(3):
        rgb[:, :, i] = TOP_COLOR[i] + (BOTTOM_COLOR[i] - TOP_COLOR[i]) * grad
    tile = Image.fromarray(rgb.round().astype(np.uint8), "RGB").convert("RGBA")

    # 极淡外描边：白色 Dock 背景下也能看出边界
    edge = Image.new("RGBA", (TILE, TILE), EDGE_COLOR + (255,))
    inner = TILE - EDGE_WIDTH * 2
    edge.paste(tile.resize((inner, inner), Image.LANCZOS), (EDGE_WIDTH, EDGE_WIDTH))
    tile = edge

    # 字形：等比缩放，保持它与图标本体的原始比例与视觉重心
    scale = TILE / CANVAS
    gw, gh = glyph.size
    g = glyph.resize((max(1, round(gw * scale)), max(1, round(gh * scale))), Image.LANCZOS)
    cx = TILE / 2 + offset[0] * TILE
    cy = TILE / 2 + offset[1] * TILE
    tile.alpha_composite(g, (round(cx - g.width / 2), round(cy - g.height / 2)))

    tile.putalpha(squircle_mask(TILE))
    return tile


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    if src.size != (CANVAS, CANVAS):
        src = src.resize((CANVAS, CANVAS), Image.LANCZOS)

    glyph, offset = extract_glyph(src)
    tile = build_tile(glyph, offset)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pad = (CANVAS - TILE) // 2
    canvas.alpha_composite(tile, (pad, pad))

    for out in OUTPUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out, "PNG")
        print(f"written {out.relative_to(ROOT)}  tile={TILE}/{CANVAS}")


if __name__ == "__main__":
    main()
