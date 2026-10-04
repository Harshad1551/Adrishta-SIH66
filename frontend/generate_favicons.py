import math
from PIL import Image, ImageDraw

def render_adrishta_logo(size=512):
    # High resolution RGBA image
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    center = size / 2.0
    scale = size / 44.0
    
    # 1. Outer Hexagon
    # points: 22,2  39,11  39,33  22,42  5,33  5,11
    hex_pts = [
        (22 * scale, 2 * scale),
        (39 * scale, 11 * scale),
        (39 * scale, 33 * scale),
        (22 * scale, 42 * scale),
        (5 * scale, 33 * scale),
        (5 * scale, 11 * scale),
    ]
    # Draw dark background hex
    draw.polygon(hex_pts, fill=(3, 7, 18, 255), outline=(56, 189, 248, 255), width=max(2, int(1.8 * scale)))
    
    # 2. Inner Radial Glow / Abyss
    r_abyss = int(15 * scale)
    for r in range(r_abyss, 0, -1):
        ratio = r / r_abyss
        # Gradient from cyan (#38bdf8) -> deep ocean (#0f172a) -> dark (#030712)
        if ratio < 0.35:
            c = (56, 189, 248, int(240 * (1 - ratio)))
        elif ratio < 0.7:
            c = (2, 132, 199, int(200 * (1 - ratio)))
        else:
            c = (15, 23, 42, 230)
        draw.ellipse([center - r, center - r, center + r, center + r], fill=c)
        
    # 3. Bathymetric Depth Rings
    r_outer = 12 * scale
    draw.ellipse([center - r_outer, center - r_outer, center + r_outer, center + r_outer], outline=(56, 189, 248, 180), width=max(1, int(1.0 * scale)))
    
    r_mid = 7.5 * scale
    draw.ellipse([center - r_mid, center - r_mid, center + r_mid, center + r_mid], outline=(45, 212, 191, 220), width=max(1, int(1.2 * scale)))
    
    # 4. Vertical Depth Sounding Beam
    # polygon points: 22,6  24.5,19  22,38  19.5,19
    beam_pts = [
        (22 * scale, 6 * scale),
        (24.5 * scale, 19 * scale),
        (22 * scale, 38 * scale),
        (19.5 * scale, 19 * scale),
    ]
    draw.polygon(beam_pts, fill=(45, 212, 191, 230), outline=(56, 189, 248, 255), width=max(1, int(1.0 * scale)))
    
    # 5. Eye / Wave Aperture Arc
    # M8 22 C13 15 31 15 36 22 C31 29 13 29 8 22 Z
    eye_pts = []
    for step in range(60):
        t = step / 59.0
        # top curve
        x = 8 + (36 - 8) * t
        # cubic bezier approximation for y
        y = 22 - 14 * math.sin(t * math.pi)
        eye_pts.append((x * scale, y * scale))
    for step in range(59, -1, -1):
        t = step / 59.0
        x = 8 + (36 - 8) * t
        y = 22 + 14 * math.sin(t * math.pi)
        eye_pts.append((x * scale, y * scale))
        
    draw.polygon(eye_pts, outline=(56, 189, 248, 255), width=max(1, int(1.8 * scale)))
    
    # 6. Core Sensor Lens
    r_core_white = 3.5 * scale
    draw.ellipse([center - r_core_white, center - r_core_white, center + r_core_white, center + r_core_white], fill=(255, 255, 255, 255))
    
    r_core_blue = 1.8 * scale
    draw.ellipse([center - r_core_blue, center - r_core_blue, center + r_core_blue, center + r_core_blue], fill=(2, 132, 199, 255))
    
    return img

if __name__ == "__main__":
    img_512 = render_adrishta_logo(512)
    
    # 1. Save multi-resolution favicon.ico
    icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img_512.save("public/favicon.ico", format="ICO", sizes=icon_sizes)
    print("Generated public/favicon.ico successfully")
    
    # 2. Save PNG variants
    img_512.resize((180, 180), Image.Resampling.LANCZOS).save("public/apple-touch-icon.png", format="PNG")
    img_512.resize((32, 32), Image.Resampling.LANCZOS).save("public/favicon-32x32.png", format="PNG")
    img_512.resize((16, 16), Image.Resampling.LANCZOS).save("public/favicon-16x16.png", format="PNG")
    img_512.resize((192, 192), Image.Resampling.LANCZOS).save("public/android-chrome-192x192.png", format="PNG")
    img_512.resize((512, 512), Image.Resampling.LANCZOS).save("public/android-chrome-512x512.png", format="PNG")
    print("Generated PNG favicons successfully")
