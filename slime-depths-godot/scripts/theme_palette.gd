# ThemePalette — single source of truth for the STORM / FLAME / BLOOD /
# VOW / SHADOW visual identity. Used by main.gd's theme chip strip
# (chips + tooltip) so the palette lives in exactly one place. Other
# consumers (pickup_banner.gd's local THEME_COLORS dict, fx ring tints,
# etc.) keep their own copies for now — refactoring those is out of
# scope for the chip-strip polish iter.
#
# Colors match the spec'd values from iter-74's chip-strip polish (the
# prompt deliberately specified slightly punchier saturation than the
# pre-existing pickup_banner palette, so a future palette unification
# would migrate pickup_banner toward THESE values, not the other way).
class_name ThemePalette
extends RefCounted

const COLORS: Dictionary = {
	"storm":  Color(0.35, 0.85, 1.0),    # cool cyan
	"flame":  Color(1.0,  0.55, 0.25),   # warm orange
	"blood":  Color(0.85, 0.25, 0.35),   # crimson red
	"vow":    Color(0.95, 0.85, 0.55),   # ivory-gold
	"shadow": Color(0.65, 0.45, 1.0),    # indigo violet
}

# Fallback for unknown theme keys — cream-gold so a typo'd theme string
# still renders something visible rather than vanishing into magenta.
const FALLBACK: Color = Color(0.92, 0.84, 0.62)

static func color_for(theme: String) -> Color:
	return COLORS.get(theme, FALLBACK)
