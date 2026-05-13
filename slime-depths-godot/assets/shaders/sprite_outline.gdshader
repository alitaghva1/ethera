// iter-117: Sprite outline shader. 8-tap edge detector — for any pixel
// that is currently TRANSPARENT but has an OPAQUE neighbor within
// outline_width pixels, paint outline_color there. Used by hero.tscn's
// AnimatedSprite2D material so the player silhouette has a dark rim
// against the room floor.
//
// Why a shader instead of a "ghost sprite behind the main sprite":
//   • Ghost approach needs per-frame state sync (animation / frame /
//     flip_h) and a duplicate sprite_frames reference. Shader is
//     state-free and follows the sprite's animation automatically.
//   • Shader handles texture flipping (flip_h) without extra work
//     because UV stays consistent.
//
// Atlas-bleed safety: this is applied to an AnimatedSprite2D backed by
// AtlasTexture slices of a multi-frame sheet. TEXTURE_PIXEL_SIZE refers
// to the underlying sheet's pixel size. For a 1024×128 sheet sliced into
// 128×128 cells, sampling 1px out is ~0.78% of the cell width — well
// within the slice, no neighbor-cell bleed.
//
// outline_width is in PIXELS of the underlying texture, not UV units.
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(0.04, 0.04, 0.08, 0.85);
uniform float outline_width : hint_range(0.0, 4.0) = 1.0;

void fragment() {
    vec4 src = texture(TEXTURE, UV);
    // Godot 4 disallows `return` in fragment(), so we compute the
    // outline branch unconditionally and select via an if/else at the
    // end. The if-skip cost is negligible.
    if (src.a > 0.01) {
        // Inside the sprite — pass through unchanged.
        COLOR = src;
    } else {
        // Outside-but-near: 8-tap neighbor sample to detect proximity
        // to an opaque pixel.
        vec2 px = TEXTURE_PIXEL_SIZE * outline_width;
        float a = 0.0;
        a = max(a, texture(TEXTURE, UV + vec2( px.x,  0.0)).a);
        a = max(a, texture(TEXTURE, UV + vec2(-px.x,  0.0)).a);
        a = max(a, texture(TEXTURE, UV + vec2( 0.0,   px.y)).a);
        a = max(a, texture(TEXTURE, UV + vec2( 0.0,  -px.y)).a);
        a = max(a, texture(TEXTURE, UV + vec2( px.x,  px.y)).a);
        a = max(a, texture(TEXTURE, UV + vec2(-px.x,  px.y)).a);
        a = max(a, texture(TEXTURE, UV + vec2( px.x, -px.y)).a);
        a = max(a, texture(TEXTURE, UV + vec2(-px.x, -px.y)).a);
        // No opaque neighbor → fully transparent. Otherwise tint at
        // outline alpha modulated by the sampled neighbor alpha so AA
        // sprite edges produce a smooth outline rather than a hard ring.
        COLOR = vec4(outline_color.rgb, outline_color.a * a);
    }
}
