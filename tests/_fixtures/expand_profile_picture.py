"""Update the profile_picture fixtures to the full host wire shape.

The plugin's ProfilePicture type now matches the host (kind,
archetype, variant_key, palette_key, bg_color, fg_color,
image_url, image_updated_at). The test fixtures still use the
3-field projection; this script expands them to the full shape so
typecheck + the snapshot test pass.

Run from the plugin frontend root:
  python3 tests/_fixtures/expand_profile_picture.py
"""
import re
from pathlib import Path

FILES = [
    'tests/lib/mermaidSource.spec.ts',
    'tests/components/TeamGraphPage.spec.ts',
    'tests/components/TeamGraphCanvas.spec.ts',
    'tests/composables/useTeamGraph.spec.ts',
    'tests/composables/useMermaidRender.spec.ts',
]

# profile_picture: { palette_key: 'X', bg_color: 'Y', fg_color: 'Z' }
# → full shape with kind='avatar' and null archetype/variant_key/image_*
PATTERN = re.compile(
    r"profile_picture:\s*\{\s*palette_key:\s*'([^']*)',\s*bg_color:\s*'([^']*)',\s*fg_color:\s*'([^']*)'\s*\}"
)

REPLACEMENT = (
    "profile_picture: {{"
    "kind: 'avatar',"
    "archetype: null,"
    "variant_key: null,"
    "palette_key: '{pk}',"
    "bg_color: '{bg}',"
    "fg_color: '{fg}',"
    "image_url: null,"
    "image_updated_at: null"
    "}}"
)

ROOT = Path(__file__).resolve().parents[2]

for rel in FILES:
    p = ROOT / rel
    src = p.read_text()
    out = PATTERN.sub(
        lambda m: REPLACEMENT.format(pk=m.group(1), bg=m.group(2), fg=m.group(3)),
        src,
    )
    if out == src:
        print(f'no change: {rel}')
    else:
        p.write_text(out)
        print(f'updated {rel}')
