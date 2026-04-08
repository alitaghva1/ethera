// ============================================================
//  SPACE BACKGROUND GENERATOR
//  Ported from Deep Fold's Godot Space Background Generator
//  Uses WebGL to render procedural nebula + star dust, then
//  caches the result as a static canvas for per-frame drawing.
// ============================================================

const SPACEBG_DEBUG = false;

let spaceBgCanvas = null;   // cached rendered background
let spaceBgZone = -1;       // which zone it was generated for
let spaceBgParallax = { x: 0, y: 0 }; // parallax offset

// ---- Zone color palettes (8-stop gradients, dark→bright) ----
const ZONE_BG_PALETTES = {
    0: {
        // The Hamlet — brooding overcast storm sky
        // Desaturated blue-greys with bruised purple undertones
        // bgColor matches lowest palette stop so voids read as "darker cloud" not "holes"
        colors: [
            [28, 30, 45],     // darkest storm cloud
            [42, 45, 65],     // deep storm grey
            [58, 62, 88],     // dark slate
            [75, 80, 108],    // storm grey
            [92, 98, 130],    // bruised grey-blue
            [112, 115, 148],  // overcast mid
            [135, 132, 162],  // pale storm
            [162, 158, 180],  // cloud highlight
        ],
        bgColor: [22, 24, 38],   // dark storm — NOT black, so voids blend with cloud
        nebulaSize: 7.0,      // large scale = cloud formations not cosmic
        dustSize: 5.0,         // wide dust = haze bands
        starDensity: 0,        // no stars — it's a sky, not space
        bigStarCount: 0,
        nebulaIntensity: 0.95, // strong coverage — overcast sky should be full
        parallaxStrength: 0.08,
        blendMode: 'screen',
        screenAlpha: 0.08,       // very low — full-coverage texture needs minimal alpha to avoid washing out tiles
        coverage: 0.7,           // high coverage — overcast sky should be full, minimal void
        // Pixel cloud overlay configuration
        cloudOverlay: true,
    },
    1: {
        // The Undercroft — damp underground earth
        // Warmer browns and earthy tones — visible cave texture beyond the map
        colors: [
            [30, 24, 16],     // dark earth
            [52, 42, 28],     // loam
            [72, 58, 38],     // deep brown
            [95, 78, 52],     // damp earth
            [115, 95, 68],    // clay
            [135, 115, 85],   // mudstone
            [158, 138, 108],  // dry earth
            [180, 160, 128],  // pale stone highlight
        ],
        bgColor: [18, 14, 10],
        nebulaSize: 2.8,       // tight scale = rock grain and crevices
        dustSize: 2.2,
        starDensity: 0,        // no stars in underground dungeon
        bigStarCount: 0,
        nebulaIntensity: 1.0,
        parallaxStrength: 0.03,
        blendMode: 'screen',
        screenAlpha: 0.35,       // screen-blend after darkness — visible in void, invisible over tiles
        coverage: 0.9,          // near-full coverage — dense cave texture, minimal void
    },
    2: {
        // Ruined Tower — aged stone with faint green moss/decay
        // Cooler greys with visible green-grey undertones
        colors: [
            [25, 32, 22],     // dark mossy rock
            [42, 52, 35],     // deep grey-green
            [60, 72, 50],     // moss stone
            [78, 92, 68],     // damp stone
            [95, 110, 85],    // weathered grey
            [112, 128, 100],  // moss-tinged grey
            [132, 148, 118],  // pale lichen stone
            [155, 168, 140],  // light aged stone highlight
        ],
        bgColor: [14, 18, 12],
        nebulaSize: 3.2,       // slightly larger = more weathered surfaces
        dustSize: 2.8,
        starDensity: 0,
        bigStarCount: 0,
        nebulaIntensity: 1.0,
        parallaxStrength: 0.03,
        blendMode: 'screen',
        screenAlpha: 0.30,       // screen-blend after darkness — subtle mossy texture in void
        coverage: 0.85,         // dense stone texture, very little void
    },
    3: {
        // The Spire — something unnatural pulses within the stone
        // Dark stone with sickly amber-green veins (werewolf lair)
        colors: [
            [28, 20, 10],     // dark stone
            [48, 38, 18],     // deep brown-amber
            [72, 58, 28],     // amber-tinged rock
            [95, 78, 38],     // sickly amber
            [118, 95, 48],    // amber vein glow
            [142, 118, 58],   // bright amber
            [168, 142, 72],   // hot amber
            [195, 168, 88],   // amber highlight
        ],
        bgColor: [16, 12, 6],
        nebulaSize: 3.5,
        dustSize: 3.0,
        starDensity: 0,        // no stars in underground dungeon
        bigStarCount: 0,
        nebulaIntensity: 0.9,
        parallaxStrength: 0.04,
        blendMode: 'screen',
        screenAlpha: 0.35,       // screen-blend after darkness — amber glow in void
        coverage: 0.8,          // strong amber vein coverage, some dark gaps
    },
    4: {
        // The Inferno — crimson/orange hellfire
        colors: [
            [40, 8, 4],       // near-black red
            [80, 20, 8],      // dark crimson
            [150, 45, 20],    // deep red
            [200, 65, 25],    // crimson
            [235, 95, 30],    // hot red-orange
            [250, 140, 50],   // orange
            [255, 180, 80],   // bright orange
            [255, 220, 130],  // hot yellow-white
        ],
        bgColor: [12, 3, 2],
        nebulaSize: 4.5,
        dustSize: 3.5,
        starDensity: 0.0005,
        bigStarCount: 8,
        nebulaIntensity: 1.0,
        coverage: 0,             // reference zone — already looks good
    },
    5: {
        // The Frozen Abyss — cold blue/cyan ice
        colors: [
            [8, 12, 40],      // near-black blue
            [15, 30, 80],     // dark navy
            [25, 60, 140],    // deep blue
            [45, 100, 190],   // blue
            [70, 140, 220],   // bright blue
            [110, 180, 235],  // ice blue
            [170, 215, 245],  // pale cyan
            [220, 240, 255],  // ice white
        ],
        bgColor: [5, 6, 18],
        nebulaSize: 4.5,
        dustSize: 3.5,
        starDensity: 0.0006,
        bigStarCount: 10,
        nebulaIntensity: 1.0,
        coverage: 0,             // match Inferno reference — natural cosmic nebula look
    },
    6: {
        // Throne of Ruin — dark purple/violet
        colors: [
            [18, 6, 30],      // near-black purple
            [40, 15, 65],     // dark purple
            [75, 25, 110],    // deep violet
            [115, 40, 150],   // purple
            [155, 65, 180],   // bright purple
            [185, 100, 200],  // violet
            [210, 145, 225],  // lavender
            [235, 190, 245],  // pale violet
        ],
        bgColor: [10, 4, 16],
        nebulaSize: 4.5,
        dustSize: 3.5,
        starDensity: 0.0003,
        bigStarCount: 5,
        nebulaIntensity: 1.0,
        coverage: 0,             // match Inferno reference — natural cosmic nebula look
    },
};

// ============================================================
//  WebGL Nebula Renderer
// ============================================================

const NEBULA_VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Port of Deep Fold's Nebulae.shader — extended with style modes
// u_style: 0 = cosmic nebula (zones 4-6), 1 = earth/stone (zones 1-3), 2 = cloud/sky (zone 0)
const NEBULA_FRAG = `
precision highp float;
varying vec2 v_uv;

uniform float u_size;
uniform int u_octaves;
uniform float u_seed;
uniform float u_pixels;
uniform vec3 u_palette[8];
uniform vec3 u_bgColor;
uniform float u_intensity;
uniform float u_coverage;
uniform int u_style;

float rand(vec2 coord) {
    return fract(sin(dot(coord, vec2(12.9898, 78.233))) * (15.5453 + u_seed));
}

float noise(vec2 coord) {
    vec2 i = floor(coord);
    vec2 f = fract(coord);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    vec2 cubic = f * f * (3.0 - 2.0 * f);
    return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
}

float fbm(vec2 coord) {
    float value = 0.0;
    float scale = 0.5;
    for (int i = 0; i < 10; i++) {
        if (i >= u_octaves) break;
        value += noise(coord) * scale;
        coord *= 2.0;
        scale *= 0.5;
    }
    return value;
}

float circleNoise(vec2 uv) {
    float uv_y = floor(uv.y);
    uv.x += uv_y * 0.31;
    vec2 f = fract(uv);
    float h = rand(vec2(floor(uv.x), floor(uv_y)));
    float m = length(f - 0.25 - h * 0.5);
    float r = h * 0.25;
    return smoothstep(0.0, r, m * 0.75);
}

float cloud_alpha(vec2 uv) {
    float c_noise = 0.0;
    for (int i = 0; i < 2; i++) {
        c_noise += circleNoise(uv * 0.5 + float(i + 1) + vec2(-0.3, 0.0));
    }
    return fbm(uv + c_noise);
}

bool dither(vec2 uv1, vec2 uv2) {
    return mod(uv1.y + uv2.x, 2.0 / u_pixels) <= 1.0 / u_pixels;
}

// Palette lookup helper (WebGL1 can't do dynamic array indexing)
vec3 samplePalette(float t) {
    int idx = int(clamp(t, 0.0, 1.0) * 7.0);
    if (idx <= 0) return u_palette[0];
    if (idx == 1) return u_palette[1];
    if (idx == 2) return u_palette[2];
    if (idx == 3) return u_palette[3];
    if (idx == 4) return u_palette[4];
    if (idx == 5) return u_palette[5];
    if (idx == 6) return u_palette[6];
    return u_palette[7];
}

// --- STYLE 1: Earth/Stone texture (zones 1-3) ---
// Pure FBM with domain warping — no circleNoise, no hard step edges
// Produces organic rock/earth grain patterns
void mainEarth() {
    vec2 uv = floor(v_uv * u_pixels) / u_pixels;
    bool dith = dither(uv, v_uv);

    // Domain-warped FBM for organic rock texture
    vec2 p = uv * u_size;
    float warp1 = fbm(p + vec2(0.0, 0.0));
    float warp2 = fbm(p + vec2(5.2, 1.3));
    // Second warp pass for more complex geology
    float n1 = fbm(p + vec2(warp1 * 2.0, warp2 * 2.0));
    float n2 = fbm(p + vec2(warp2 * 1.8 + 1.7, warp1 * 1.8 + 9.2));
    // Combine for layered rock strata feel
    float rock = n1 * 0.55 + n2 * 0.45;
    // Add fine grain detail at higher frequency
    float grain = fbm(p * 4.0 + vec2(n1 * 2.0, n2 * 2.0));
    rock = rock * 0.65 + grain * 0.35;

    // Create visible dark crevices by sharpening contrast
    rock = pow(rock, 0.7) * 1.4;  // boost mids, darken lows
    // Add subtle "strata" banding from one noise layer
    float strata = fbm(p * vec2(1.0, 3.0) + vec2(warp1));
    rock += (strata - 0.5) * 0.15;

    if (dith) rock *= 0.97;

    // Smooth palette mapping — no hard step edges
    float col_value = clamp(rock * u_intensity, 0.0, 1.0);

    vec3 col = samplePalette(col_value);

    // Very subtle darkening at edges (not a cosmic vignette)
    float edge = distance(uv, vec2(0.5));
    float edgeFade = smoothstep(0.6, 0.2, edge) * 0.12 + 0.88;
    col *= edgeFade;

    // Full coverage — earth/stone fills the entire background
    gl_FragColor = vec4(col, 1.0);
}

// --- STYLE 2: Overcast sky/cloud texture (zone 0) ---
// Soft layered clouds with gentle gradients — no cosmic edges
void mainSky() {
    vec2 uv = floor(v_uv * u_pixels) / u_pixels;
    bool dith = dither(uv, v_uv);

    vec2 p = uv * u_size;

    // Large soft cloud formations
    float clouds1 = fbm(p * 0.8 + vec2(u_seed, 0.0));
    float clouds2 = fbm(p * 0.6 + vec2(0.0, u_seed + 3.7));
    // Domain warp for natural cloud movement
    float warped = fbm(p + vec2(clouds1 * 1.5, clouds2 * 1.5));
    // Fine detail layer
    float detail = fbm(p * 2.5 + vec2(warped * 0.8));

    // Blend layers: big soft shapes + subtle detail
    float sky = warped * 0.7 + detail * 0.3;
    // Slight vertical gradient — darker at top, lighter at bottom (overcast feel)
    sky += (1.0 - uv.y) * 0.12;

    if (dith) sky *= 0.97;

    float col_value = clamp(sky * u_intensity, 0.0, 1.0);
    vec3 col = samplePalette(col_value);

    // Full coverage — sky fills everything
    gl_FragColor = vec4(col, 1.0);
}

// --- STYLE 0: Original cosmic nebula (zones 4-6) ---
void mainCosmic() {
    vec2 uv = floor(v_uv * u_pixels) / u_pixels;
    float d = distance(uv, vec2(0.5)) * (0.4 - u_coverage * 0.35);
    bool dith = dither(uv, v_uv);

    float n = cloud_alpha(uv * u_size);
    float n2 = fbm(uv * u_size + vec2(1.0, 1.0));
    float n_lerp = n2 * n;
    float n_dust = cloud_alpha(uv * u_size);
    float n_dust_lerp = n_dust * n_lerp;

    if (dith) {
        n_dust_lerp *= 0.95;
        n_lerp *= 0.95;
        d *= 0.98;
    }

    float coverageBias = u_coverage * 0.35;
    float a = step(n2, 0.1 + coverageBias + d);
    float a2 = step(n2, 0.115 + coverageBias + d);

    float col_value;
    if (a2 > a) {
        col_value = floor(n_dust_lerp * 35.0) / 7.0;
    } else {
        col_value = floor(n_dust_lerp * 14.0) / 7.0;
    }
    col_value *= u_intensity;

    vec3 col = samplePalette(col_value);

    if (col_value < 0.1) {
        col = u_bgColor;
    }

    gl_FragColor = vec4(col, a2);
}

void main() {
    if (u_style == 1) { mainEarth(); }
    else if (u_style == 2) { mainSky(); }
    else { mainCosmic(); }
}`;

// Port of Deep Fold's StarStuff.shader — extended with style modes
const DUST_FRAG = `
precision highp float;
varying vec2 v_uv;

uniform float u_size;
uniform int u_octaves;
uniform float u_seed;
uniform float u_pixels;
uniform vec3 u_palette[8];
uniform float u_intensity;
uniform float u_coverage;
uniform int u_style;

float rand(vec2 coord) {
    return fract(sin(dot(coord, vec2(12.9898, 78.233))) * (15.5453 + u_seed));
}

float noise(vec2 coord) {
    vec2 i = floor(coord);
    vec2 f = fract(coord);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    vec2 cubic = f * f * (3.0 - 2.0 * f);
    return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
}

float fbm(vec2 coord) {
    float value = 0.0;
    float scale = 0.5;
    for (int i = 0; i < 10; i++) {
        if (i >= u_octaves) break;
        value += noise(coord) * scale;
        coord *= 2.0;
        scale *= 0.5;
    }
    return value;
}

float circleNoise(vec2 uv) {
    float uv_y = floor(uv.y);
    uv.x += uv_y * 0.31;
    vec2 f = fract(uv);
    float h = rand(vec2(floor(uv.x), floor(uv_y)));
    float m = length(f - 0.25 - h * 0.5);
    float r = h * 0.25;
    return smoothstep(0.0, r, m * 0.75);
}

float cloud_alpha(vec2 uv) {
    float c_noise = 0.0;
    for (int i = 0; i < 2; i++) {
        c_noise += circleNoise(uv * 0.5 + float(i + 1) + vec2(-0.3, 0.0));
    }
    return fbm(uv + c_noise);
}

bool dither(vec2 uv1, vec2 uv2) {
    return mod(uv1.y + uv2.x, 2.0 / u_pixels) <= 1.0 / u_pixels;
}

vec3 samplePalette(float t) {
    int idx = int(clamp(t, 0.0, 1.0) * 7.0);
    if (idx <= 0) return u_palette[0];
    if (idx == 1) return u_palette[1];
    if (idx == 2) return u_palette[2];
    if (idx == 3) return u_palette[3];
    if (idx == 4) return u_palette[4];
    if (idx == 5) return u_palette[5];
    if (idx == 6) return u_palette[6];
    return u_palette[7];
}

// Earth/stone dust: subtle secondary texture layer for rock grain
void mainEarthDust() {
    vec2 uv = floor(v_uv * u_pixels) / u_pixels;
    bool dith = dither(uv, v_uv);

    vec2 p = uv * u_size * 1.5;
    // Different seed offset from nebula pass for variation
    float n1 = fbm(p + vec2(u_seed + 7.3, u_seed + 2.1));
    float n2 = fbm(p * 0.7 + vec2(u_seed + 13.1, u_seed + 8.5));
    float dust = n1 * n2;
    dust = pow(dust, 0.8) * 2.5;

    if (dith) dust *= 0.95;

    float col_value = clamp(dust * u_intensity, 0.0, 1.0);
    vec3 col = samplePalette(col_value);

    // Subtle alpha so this layer adds grain without overpowering
    float a = smoothstep(0.1, 0.5, dust);
    gl_FragColor = vec4(col, a * 0.6);
}

// Sky dust: wispy cloud detail layer
void mainSkyDust() {
    vec2 uv = floor(v_uv * u_pixels) / u_pixels;
    bool dith = dither(uv, v_uv);

    vec2 p = uv * u_size * 1.2;
    float wisps = fbm(p + vec2(u_seed + 4.2, 0.0));
    float wisps2 = fbm(p * 0.5 + vec2(0.0, u_seed + 6.8));
    float cloud = wisps * wisps2;
    cloud = pow(cloud, 0.6) * 3.0;

    if (dith) cloud *= 0.97;

    float col_value = clamp(cloud * u_intensity, 0.0, 1.0);
    vec3 col = samplePalette(col_value);

    float a = smoothstep(0.15, 0.6, cloud);
    gl_FragColor = vec4(col, a * 0.5);
}

// Original cosmic dust
void mainCosmicDust() {
    vec2 uv = floor(v_uv * u_pixels) / u_pixels;
    bool dith = dither(uv, v_uv);

    float n_alpha = fbm(uv * ceil(u_size * 0.5) + vec2(2.0, 2.0));
    float n_dust = cloud_alpha(uv * u_size);
    float n_dust2 = fbm(uv * ceil(u_size * 0.2) - vec2(2.0, 2.0));
    float n_dust_lerp = n_dust2 * n_dust;

    if (dith) {
        n_dust_lerp *= 0.95;
    }

    float a_dust = step(n_alpha, n_dust_lerp * (1.8 + u_coverage * 1.5));
    n_dust_lerp = pow(n_dust_lerp, 3.2 - u_coverage * 1.0) * (56.0 + u_coverage * 20.0);
    if (dith) {
        n_dust_lerp *= 1.1;
    }

    float col_value = floor(n_dust_lerp) / 7.0;
    col_value *= u_intensity;

    vec3 col = samplePalette(col_value);
    gl_FragColor = vec4(col, a_dust);
}

void main() {
    if (u_style == 1) { mainEarthDust(); }
    else if (u_style == 2) { mainSkyDust(); }
    else { mainCosmicDust(); }
}`;


// ============================================================
//  WebGL helpers
// ============================================================
function _createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function _createProgram(gl, vertSrc, fragSrc) {
    const vert = _createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = _createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(prog));
        return null;
    }
    return prog;
}

// ============================================================
//  Generate space background for a zone
// ============================================================
function generateSpaceBackground(zoneNumber) {
    const palette = ZONE_BG_PALETTES[zoneNumber];
    if (!palette) { if (SPACEBG_DEBUG) console.log('[SpaceBG] No palette for zone', zoneNumber); return null; }

    if (SPACEBG_DEBUG) console.log('[SpaceBG] Generating nebula for zone', zoneNumber);

    // Render at reduced resolution for pixel-art feel, then scale
    const renderW = 640;
    const renderH = 360;

    // Create offscreen WebGL canvas
    const glCanvas = document.createElement('canvas');
    glCanvas.width = renderW;
    glCanvas.height = renderH;
    const gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
        console.error('[SpaceBG] WebGL context creation FAILED for zone', zoneNumber, '— falling back to CPU');
        console.warn('[SpaceBG] WebGL not available, using CPU fallback');
        return _generateFallbackBackground(renderW, renderH, palette);
    }
    if (SPACEBG_DEBUG) console.log('[SpaceBG] WebGL context created');

    // Full-screen quad
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    // Convert palette to float arrays
    const paletteFlat = [];
    for (const c of palette.colors) {
        paletteFlat.push(c[0]/255, c[1]/255, c[2]/255);
    }
    const bgColorNorm = [palette.bgColor[0]/255, palette.bgColor[1]/255, palette.bgColor[2]/255];

    // --- Composite canvas (2D) for layering ---
    const outCanvas = document.createElement('canvas');
    outCanvas.width = renderW;
    outCanvas.height = renderH;
    const out = outCanvas.getContext('2d');

    // Fill with background color
    out.fillStyle = `rgb(${palette.bgColor[0]},${palette.bgColor[1]},${palette.bgColor[2]})`;
    out.fillRect(0, 0, renderW, renderH);

    // Random seeds for this generation
    const nebulaSeed = 1.0 + Math.random() * 9.0;
    const dustSeed = 1.0 + Math.random() * 9.0;

    // --- Pass 1: Nebulae ---
    const nebProg = _createProgram(gl, NEBULA_VERT, NEBULA_FRAG);
    if (!nebProg) {
        console.error('[SpaceBG] Nebula shader failed to compile — using CPU fallback');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return _generateFallbackBackground(renderW, renderH, palette);
    }
    if (SPACEBG_DEBUG) console.log('[SpaceBG] Nebula shader compiled');
    if (nebProg) {
        gl.useProgram(nebProg);
        const posLoc = gl.getAttribLocation(nebProg, 'a_pos');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform1f(gl.getUniformLocation(nebProg, 'u_size'), palette.nebulaSize);
        gl.uniform1i(gl.getUniformLocation(nebProg, 'u_octaves'), 6);
        gl.uniform1f(gl.getUniformLocation(nebProg, 'u_seed'), nebulaSeed);
        gl.uniform1f(gl.getUniformLocation(nebProg, 'u_pixels'), Math.max(renderW, renderH));
        gl.uniform3fv(gl.getUniformLocation(nebProg, 'u_palette'), paletteFlat);
        gl.uniform3fv(gl.getUniformLocation(nebProg, 'u_bgColor'), bgColorNorm);
        gl.uniform1f(gl.getUniformLocation(nebProg, 'u_intensity'), palette.nebulaIntensity);
        gl.uniform1f(gl.getUniformLocation(nebProg, 'u_coverage'), palette.coverage || 0);
        gl.uniform1i(gl.getUniformLocation(nebProg, 'u_style'), 0);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Copy to composite
        out.drawImage(glCanvas, 0, 0);
    }

    if (SPACEBG_DEBUG) console.log('[SpaceBG] Nebula pass complete');
    // --- Pass 2: Star Dust ---
    const dustProg = _createProgram(gl, NEBULA_VERT, DUST_FRAG);
    if (dustProg) {
        gl.useProgram(dustProg);
        const posLoc = gl.getAttribLocation(dustProg, 'a_pos');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform1f(gl.getUniformLocation(dustProg, 'u_size'), palette.dustSize);
        gl.uniform1i(gl.getUniformLocation(dustProg, 'u_octaves'), 5);
        gl.uniform1f(gl.getUniformLocation(dustProg, 'u_seed'), dustSeed);
        gl.uniform1f(gl.getUniformLocation(dustProg, 'u_pixels'), Math.max(renderW, renderH));
        gl.uniform3fv(gl.getUniformLocation(dustProg, 'u_palette'), paletteFlat);
        gl.uniform1f(gl.getUniformLocation(dustProg, 'u_intensity'), palette.nebulaIntensity);
        gl.uniform1f(gl.getUniformLocation(dustProg, 'u_coverage'), palette.coverage || 0);
        gl.uniform1i(gl.getUniformLocation(dustProg, 'u_style'), 0);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Blend dust layer on top — earth/sky styles use lighter screen blend
        out.globalCompositeOperation = 'screen';
        out.drawImage(glCanvas, 0, 0);
        out.globalCompositeOperation = 'source-over';
    }

    // --- Pass 3: Stars (drawn on 2D canvas) ---
    _drawStars(out, renderW, renderH, palette);

    // Clean up WebGL
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    return outCanvas;
}

// Draw scattered stars using 2D canvas
function _drawStars(ctx, w, h, palette) {
    const density = (palette.starDensity != null) ? palette.starDensity : 0.0003;
    if (density <= 0 && (!palette.bigStarCount || palette.bigStarCount <= 0)) return;

    const starCount = Math.floor(w * h * density);
    const brightColor = palette.starColor || palette.colors[7]; // custom or brightest palette

    // Small background stars (or distant torch reflections for dungeons)
    for (let i = 0; i < starCount; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = 0.5 + Math.random() * 1.0;
        const alpha = 0.3 + Math.random() * 0.5;
        const c = palette.starColor || palette.colors[Math.min(5 + Math.floor(Math.random() * 3), 7)];
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(size), Math.ceil(size));
    }

    // Big bright stars with glow
    const bigCount = palette.bigStarCount || 0;
    for (let i = 0; i < bigCount; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = 2 + Math.random() * 2;

        // Glow
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = `rgb(${brightColor[0]},${brightColor[1]},${brightColor[2]})`;
        ctx.fillRect(Math.floor(x - size), Math.floor(y - size), Math.ceil(size * 3), Math.ceil(size * 3));

        // Core
        ctx.globalAlpha = 0.8 + Math.random() * 0.2;
        ctx.fillStyle = palette.starColor
            ? `rgb(${brightColor[0]},${brightColor[1]},${brightColor[2]})`
            : '#ffffff';
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(size), Math.ceil(size));

        // Cross spikes (pixel art style) — skip for dungeon torch glimmers
        if (!palette.starColor) {
            ctx.globalAlpha = 0.4;
            ctx.fillRect(Math.floor(x - size * 0.5), Math.floor(y), Math.ceil(size * 2), 1);
            ctx.fillRect(Math.floor(x), Math.floor(y - size * 0.5), 1, Math.ceil(size * 2));
        }
    }

    ctx.globalAlpha = 1;
}

// ============================================================
//  CPU Fallback — generates nebula without WebGL
// ============================================================
function _fbmCPU(x, y, seed, octaves) {
    let value = 0, scale = 0.5;
    for (let i = 0; i < octaves; i++) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const cx = fx * fx * (3 - 2 * fx), cy = fy * fy * (3 - 2 * fy);
        const a = _hashCPU(ix, iy, seed), b = _hashCPU(ix+1, iy, seed);
        const c = _hashCPU(ix, iy+1, seed), d = _hashCPU(ix+1, iy+1, seed);
        const n = a + (b-a)*cx + (c-a)*cy*(1-cx) + (d-b)*cx*cy;
        value += n * scale;
        x *= 2; y *= 2; scale *= 0.5;
    }
    return value;
}

function _hashCPU(x, y, seed) {
    return (Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453) % 1;
}

function _generateFallbackBackground(w, h, palette) {
    if (SPACEBG_DEBUG) console.log('[SpaceBG] Generating CPU fallback', w, 'x', h);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    const seed = Math.random() * 10;
    const size = palette.nebulaSize;

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            const ux = px / w, uy = py / h;
            const n = _fbmCPU(ux * size, uy * size, seed, 5);
            const n2 = _fbmCPU(ux * size + 1, uy * size + 1, seed, 5);
            const val = Math.max(0, Math.min(1, n * n2 * 4));

            // Soft dither — subtle variation instead of harsh checkerboard
            const dith = ((py + px) % 2 === 0) ? 0.97 : 1.0;
            // Smooth palette index with fractional blending between stops
            const rawIdx = val * dith * 7;
            const idxLow = Math.min(6, Math.floor(rawIdx));
            const idxHigh = Math.min(7, idxLow + 1);
            const frac = rawIdx - idxLow;
            const cLow = palette.colors[idxLow];
            const cHigh = palette.colors[idxHigh];
            // Lerp between adjacent palette colors for smoother gradients
            const cr = cLow[0] + (cHigh[0] - cLow[0]) * frac;
            const cg = cLow[1] + (cHigh[1] - cLow[1]) * frac;
            const cb = cLow[2] + (cHigh[2] - cLow[2]) * frac;

            const dist = Math.sqrt((ux - 0.5) ** 2 + (uy - 0.5) ** 2);
            // Soft alpha transition instead of hard cutoff
            const edgeAlpha = Math.max(0, Math.min(1, 1 - (n2 - 0.1 - dist * 0.3) * 4));

            const i = (py * w + px) * 4;
            if (edgeAlpha > 0.01 && val > 0.03) {
                const blend = edgeAlpha;
                data[i]   = Math.round(cr * blend + palette.bgColor[0] * (1 - blend));
                data[i+1] = Math.round(cg * blend + palette.bgColor[1] * (1 - blend));
                data[i+2] = Math.round(cb * blend + palette.bgColor[2] * (1 - blend));
                data[i+3] = 255;
            } else {
                data[i] = palette.bgColor[0]; data[i+1] = palette.bgColor[1]; data[i+2] = palette.bgColor[2]; data[i+3] = 255;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // Add stars
    _drawStars(ctx, w, h, palette);
    if (SPACEBG_DEBUG) console.log('[SpaceBG] CPU fallback complete');
    return canvas;
}

// ============================================================
//  Public API
// ============================================================
function initSpaceBackground(zoneNumber, forceRegenerate) {
    if (!forceRegenerate && spaceBgZone === zoneNumber && spaceBgCanvas) return; // already cached
    if (!ZONE_BG_PALETTES[zoneNumber]) {
        spaceBgCanvas = null;
        spaceBgZone = -1;
        return;
    }
    spaceBgCanvas = generateSpaceBackground(zoneNumber);
    spaceBgZone = zoneNumber;
    if (SPACEBG_DEBUG) console.log('[SpaceBG] Init complete for zone', zoneNumber, ':', spaceBgCanvas ? `${spaceBgCanvas.width}x${spaceBgCanvas.height} canvas ready` : 'FAILED — null canvas');
}

function drawSpaceBackground(ctx, canvasW, canvasH, camX, camY) {
    if (!spaceBgCanvas) return;

    // Parallax: background moves at configurable speed for depth
    const palette = ZONE_BG_PALETTES[spaceBgZone];
    const parallaxStrength = (palette && palette.parallaxStrength) || 0.05;
    const px = (camX || 0) * parallaxStrength;
    const py = (camY || 0) * parallaxStrength;

    ctx.save();
    // Dungeon zones (1-3): smooth scaling blurs the shader dithering into
    // a natural rock/earth texture.  Hell/space zones: keep pixel-art crisp.
    const isDungeonBg = spaceBgZone >= 1 && spaceBgZone <= 3;
    ctx.imageSmoothingEnabled = isDungeonBg;
    if (isDungeonBg) ctx.imageSmoothingQuality = 'high';

    // Scale to fill the game canvas
    const scaleX = canvasW / spaceBgCanvas.width;
    const scaleY = canvasH / spaceBgCanvas.height;
    const scale = Math.max(scaleX, scaleY) * 1.15; // slight oversize for parallax room

    const drawW = spaceBgCanvas.width * scale;
    const drawH = spaceBgCanvas.height * scale;
    const offsetX = (canvasW - drawW) / 2 + px;
    const offsetY = (canvasH - drawH) / 2 + py;

    ctx.drawImage(spaceBgCanvas, offsetX, offsetY, drawW, drawH);
    ctx.restore();
}

// ============================================================
//  BACKGROUND MANAGER — Dedicated background rendering system
//  Renders BEHIND all world content (floor, walls, characters).
//  Never participates in depth sort, collision, or gameplay lighting.
// ============================================================

const BackgroundManager = {
    // ── Active state ────────────────────────────────────────────
    activeZone: -1,
    fallbackCanvas: null,   // procedural gradient/fog fallback
    animTime: 0,            // accumulated time for animations
    debugEnabled: false,    // toggle with BackgroundManager.debugEnabled = true

    // ── Fit modes: 'cover' | 'contain' | 'stretch' ────────────
    // 'cover' = fill viewport, crop excess (default)
    // 'contain' = fit inside viewport, may letterbox
    // 'stretch' = distort to fill exactly

    // ── Per-zone configuration ──────────────────────────────────
    // Each zone can override: fitMode, opacity, tint, parallaxAmount,
    // offsetX, offsetY, scale, overfillMargin, animSpeed, useFallback
    _maskCanvas: null,  // offscreen canvas for lit-area masking
    _maskCtx: null,

    zoneConfig: {
        0: { // The Hamlet — muted overcast sky
            fitMode: 'cover', opacity: 0.15, overfillMargin: 1.3,
            parallaxAmount: 0.12, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.3,
            useFallback: false,
            fallback: {
                type: 'sky',
                gradientStops: [
                    { pos: 0.0, color: [22, 24, 38] },
                    { pos: 0.3, color: [35, 38, 58] },
                    { pos: 0.6, color: [52, 55, 78] },
                    { pos: 1.0, color: [68, 72, 95] },
                ],
                fogColor: [45, 48, 70], fogOpacity: 0.15,
                vignetteStrength: 0.3, vignetteColor: [12, 14, 22],
            },
        },
        1: { // The Undercroft — dark earthy cave
            fitMode: 'cover', opacity: 0.45, overfillMargin: 1.3,
            parallaxAmount: 0.08, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.1,
            useFallback: false,
            fallback: {
                type: 'cave',
                gradientStops: [
                    { pos: 0.0, color: [12, 10, 6] },
                    { pos: 0.4, color: [22, 18, 12] },
                    { pos: 0.7, color: [32, 26, 18] },
                    { pos: 1.0, color: [18, 14, 10] },
                ],
                fogColor: [30, 24, 16], fogOpacity: 0.1,
                vignetteStrength: 0.5, vignetteColor: [8, 6, 4],
            },
        },
        2: { // Ruined Tower — mossy stone
            fitMode: 'cover', opacity: 0.40, overfillMargin: 1.3,
            parallaxAmount: 0.08, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.1,
            useFallback: false,
            fallback: {
                type: 'cave',
                gradientStops: [
                    { pos: 0.0, color: [10, 14, 8] },
                    { pos: 0.4, color: [20, 28, 16] },
                    { pos: 0.7, color: [30, 40, 24] },
                    { pos: 1.0, color: [14, 18, 12] },
                ],
                fogColor: [22, 30, 18], fogOpacity: 0.08,
                vignetteStrength: 0.5, vignetteColor: [6, 8, 4],
            },
        },
        3: { // The Spire — amber storm
            fitMode: 'cover', opacity: 0.45, overfillMargin: 1.3,
            parallaxAmount: 0.10, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.25,
            useFallback: false,
            fallback: {
                type: 'storm',
                gradientStops: [
                    { pos: 0.0, color: [12, 10, 4] },
                    { pos: 0.3, color: [30, 24, 10] },
                    { pos: 0.6, color: [55, 42, 18] },
                    { pos: 1.0, color: [16, 12, 6] },
                ],
                fogColor: [50, 40, 15], fogOpacity: 0.12,
                vignetteStrength: 0.45, vignetteColor: [10, 8, 4],
                hazeColor: [80, 60, 20], hazeOpacity: 0.06,
            },
        },
        4: { // The Inferno — deep red-black, ember haze
            fitMode: 'cover', opacity: 1.0, overfillMargin: 1.25,
            parallaxAmount: 0.06, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.5,
            useFallback: false,
            fallback: {
                type: 'inferno',
                gradientStops: [
                    { pos: 0.0, color: [8, 2, 1] },
                    { pos: 0.25, color: [30, 6, 3] },
                    { pos: 0.5, color: [60, 12, 5] },
                    { pos: 0.75, color: [40, 8, 4] },
                    { pos: 1.0, color: [12, 3, 2] },
                ],
                fogColor: [80, 20, 8], fogOpacity: 0.1,
                vignetteStrength: 0.4, vignetteColor: [5, 1, 1],
                hazeColor: [120, 40, 10], hazeOpacity: 0.08,
                emberDrift: true,
            },
        },
        5: { // Frozen Abyss — dark blue void
            fitMode: 'cover', opacity: 1.0, overfillMargin: 1.25,
            parallaxAmount: 0.05, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.2,
            useFallback: false,
            fallback: {
                type: 'frozen',
                gradientStops: [
                    { pos: 0.0, color: [3, 4, 14] },
                    { pos: 0.3, color: [8, 15, 40] },
                    { pos: 0.6, color: [15, 30, 70] },
                    { pos: 1.0, color: [5, 6, 18] },
                ],
                fogColor: [20, 40, 80], fogOpacity: 0.1,
                vignetteStrength: 0.45, vignetteColor: [2, 3, 10],
                hazeColor: [40, 60, 120], hazeOpacity: 0.06,
                icyBloom: true,
            },
        },
        6: { // Throne of Ruin — dark purple
            fitMode: 'cover', opacity: 1.0, overfillMargin: 1.25,
            parallaxAmount: 0.05, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.3,
            useFallback: false,
            fallback: {
                type: 'cosmic',
                gradientStops: [
                    { pos: 0.0, color: [6, 2, 12] },
                    { pos: 0.3, color: [18, 8, 35] },
                    { pos: 0.6, color: [35, 15, 60] },
                    { pos: 1.0, color: [10, 4, 16] },
                ],
                fogColor: [30, 12, 50], fogOpacity: 0.1,
                vignetteStrength: 0.45, vignetteColor: [4, 1, 8],
            },
        },
    },

    // ── Get config for current zone (with defaults) ─────────────
    getConfig(zone) {
        const base = {
            fitMode: 'cover', opacity: 1.0, overfillMargin: 1.15,
            parallaxAmount: 0.05, tint: null, scale: 1.0,
            offsetX: 0, offsetY: 0, animSpeed: 0.2,
            useFallback: false,
        };
        return Object.assign({}, base, this.zoneConfig[zone] || {});
    },

    // ── Generate temporary gradient fallback ─────────────────────
    generateFallback(zone, w, h) {
        const cfg = this.getConfig(zone);
        const fb = cfg.fallback;
        if (!fb) return null;

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');

        // Base gradient (radial from center for cave/dungeon, linear for sky)
        if (fb.type === 'sky') {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            for (const stop of fb.gradientStops) {
                const [r, g, b] = stop.color;
                grad.addColorStop(stop.pos, `rgb(${r},${g},${b})`);
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        } else {
            // Radial gradient from center for underground / dramatic zones
            const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
            for (const stop of fb.gradientStops) {
                const [r, g, b] = stop.color;
                grad.addColorStop(stop.pos, `rgb(${r},${g},${b})`);
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // Fog/haze layer — subtle noise pattern using semi-transparent circles
        if (fb.fogOpacity > 0) {
            ctx.save();
            ctx.globalAlpha = fb.fogOpacity;
            const [fr, fg, fbb] = fb.fogColor;
            for (let i = 0; i < 30; i++) {
                const x = (Math.sin(i * 7.3 + zone * 3.1) * 0.5 + 0.5) * w;
                const y = (Math.cos(i * 5.7 + zone * 2.3) * 0.5 + 0.5) * h;
                const r = 40 + (i % 7) * 25;
                const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, `rgba(${fr},${fg},${fbb},0.5)`);
                grad.addColorStop(1, `rgba(${fr},${fg},${fbb},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
            }
            ctx.restore();
        }

        // Haze streak layer (for inferno/frozen/spire)
        if (fb.hazeColor && fb.hazeOpacity > 0) {
            ctx.save();
            ctx.globalAlpha = fb.hazeOpacity;
            const [hr, hg, hb] = fb.hazeColor;
            for (let i = 0; i < 8; i++) {
                const y = h * (0.1 + (i / 8) * 0.8);
                const streakH = 20 + (i % 3) * 15;
                const grad = ctx.createLinearGradient(0, y - streakH, 0, y + streakH);
                grad.addColorStop(0, `rgba(${hr},${hg},${hb},0)`);
                grad.addColorStop(0.5, `rgba(${hr},${hg},${hb},0.4)`);
                grad.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, y - streakH, w, streakH * 2);
            }
            ctx.restore();
        }

        // Vignette
        if (fb.vignetteStrength > 0) {
            const [vr, vg, vb] = fb.vignetteColor;
            const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25,
                                                   w / 2, h / 2, Math.max(w, h) * 0.75);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(${vr},${vg},${vb},${fb.vignetteStrength})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // Subtle texture noise — low-frequency dots for organic feel
        ctx.save();
        const seed = zone * 137;
        for (let i = 0; i < 200; i++) {
            const s = seed + i * 31;
            const nx = ((s * 13 + 7) % w);
            const ny = ((s * 29 + 11) % h);
            const nr = 1 + (s % 3);
            const na = 0.03 + (s % 5) * 0.01;
            ctx.globalAlpha = na;
            ctx.fillStyle = (s % 2 === 0) ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)';
            ctx.beginPath();
            ctx.arc(nx, ny, nr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        return canvas;
    },

    // ── Initialize for a zone ───────────────────────────────────
    init(zone) {
        this.activeZone = zone;
        this.animTime = 0;
        // Generate fallback canvas at a reasonable resolution
        this.fallbackCanvas = this.generateFallback(zone, 640, 360);
        if (SPACEBG_DEBUG) console.log('[BgManager] Initialized for zone', zone,
                    this.fallbackCanvas ? '(fallback ready)' : '(no fallback)');
    },

    // ── Compute draw rect for a given fit mode ──────────────────
    computeDrawRect(srcW, srcH, viewW, viewH, fitMode, overfill, offsetX, offsetY, parallaxX, parallaxY) {
        let drawW, drawH;
        const scaleX = viewW / srcW;
        const scaleY = viewH / srcH;

        if (fitMode === 'contain') {
            const s = Math.min(scaleX, scaleY) * overfill;
            drawW = srcW * s; drawH = srcH * s;
        } else if (fitMode === 'stretch') {
            drawW = viewW * overfill; drawH = viewH * overfill;
        } else { // cover (default)
            const s = Math.max(scaleX, scaleY) * overfill;
            drawW = srcW * s; drawH = srcH * s;
        }

        const x = (viewW - drawW) / 2 + offsetX + parallaxX;
        const y = (viewH - drawH) / 2 + offsetY + parallaxY;
        return { x, y, w: drawW, h: drawH };
    },

    // ── Main draw — called AFTER darkness, uses screen blend ──────
    //
    //  Architecture: drawDarkness() multiplies the whole canvas to near-black
    //  in the void beyond the torch. A pre-tile background would get crushed
    //  to invisible. So we draw AFTER darkness with 'screen' blend, which
    //  adds light back into the dark void regions.
    //
    //  To prevent the background from overlaying the lit gameplay area
    //  (tiles, characters), we render to an offscreen canvas first, punch
    //  a soft radial hole matching the torch light, then screen-blend the
    //  result onto the main canvas. Background only appears where it's dark.
    //
    // ── Main draw — BEFORE floor tiles, normal source-over compositing ──
    //
    //  The nebula is the base layer beneath everything. The dungeon floats
    //  in it. Floor tiles draw on top with source-over and fully cover it
    //  where the map exists. The void between/beyond tiles shows the nebula.
    //
    //  drawDarkness() runs later and dims the scene — but for hell zones
    //  the outer darkness stops are raised from near-black to dark crimson
    //  so the nebula remains visible in the void.
    //
    draw(ctx, canvasW, canvasH, camX, camY, dt) {
        const zone = this.activeZone;
        if (zone < 0) return;

        // Zones 0-3: no background — bgColor fill is sufficient
        if (zone <= 3) return;

        const cfg = this.getConfig(zone);
        this.animTime += (dt || 0.016) * cfg.animSpeed;

        // Source: WebGL nebula or gradient fallback
        let srcCanvas = null;
        if (!cfg.useFallback && spaceBgCanvas && spaceBgZone === zone) {
            srcCanvas = spaceBgCanvas;
        } else {
            srcCanvas = this.fallbackCanvas;
        }
        if (!srcCanvas) return;

        // Parallax + slow drift
        const t = this.animTime;
        const driftX = Math.sin(t * 0.12) * 6;
        const driftY = Math.cos(t * 0.08) * 4;
        const px = (camX || 0) * cfg.parallaxAmount + driftX;
        const py = (camY || 0) * cfg.parallaxAmount + driftY;
        const rect = this.computeDrawRect(
            srcCanvas.width, srcCanvas.height,
            canvasW, canvasH,
            cfg.fitMode, cfg.overfillMargin,
            cfg.offsetX, cfg.offsetY, px, py
        );

        // Draw nebula as base layer — normal compositing, full opacity.
        // Floor tiles will draw on top and cover it where the map exists.
        ctx.save();
        ctx.globalAlpha = cfg.opacity;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(srcCanvas, rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    },

    // ── Animated atmosphere effects (zones 4+) ────────────────
    _drawAtmosphere(ctx, w, h, camX, camY, zone, cfg) {
        const t = this.animTime;
        const fb = cfg.fallback || {};

        // Get torch position for distance-based fade
        let torchX, torchY;
        if (typeof gamePhase !== 'undefined' && gamePhase === 'cinematic') {
            torchX = w / 2; torchY = h / 2 - 20;
        } else if (typeof player !== 'undefined' && typeof tileToScreen === 'function') {
            const pos = tileToScreen(player.row, player.col);
            torchX = pos.x + camX; torchY = pos.y + camY - 20;
        } else {
            torchX = w / 2; torchY = h / 2;
        }

        // ── Inferno embers — slow rising ash/spark particles ──
        if (fb.emberDrift) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            for (let i = 0; i < 20; i++) {
                const seed = i * 73 + zone * 17;
                const speed = 12 + (seed % 15);
                const x = ((seed * 13 + t * speed) % (w + 60)) - 30;
                const rawY = (seed * 29 - t * (6 + (seed % 5))) % (h + 60);
                const y = rawY < 0 ? rawY + h + 60 : rawY;
                const sz = 1 + (seed % 3);

                // Fade near torch
                const dist = Math.sqrt((x - torchX) ** 2 + (y - torchY) ** 2);
                const fade = Math.min(1, Math.max(0, (dist - 120) / 200));
                const alpha = (0.18 + Math.sin(t * 2 + i) * 0.08) * fade;
                if (alpha < 0.01) continue;

                ctx.globalAlpha = alpha;
                const r = 180 + (seed % 70);
                const g = 45 + (seed % 45);
                ctx.fillStyle = `rgb(${r},${g},5)`;
                ctx.beginPath();
                ctx.arc(x, y, sz, 0, Math.PI * 2);
                ctx.fill();

                // Soft glow halo
                ctx.globalAlpha = alpha * 0.25;
                const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, sz * 4);
                glowGrad.addColorStop(0, `rgba(${r},${g},5,0.4)`);
                glowGrad.addColorStop(1, `rgba(${r},${g},5,0)`);
                ctx.fillStyle = glowGrad;
                ctx.fillRect(x - sz * 4, y - sz * 4, sz * 8, sz * 8);
            }
            ctx.restore();
        }

        // ── Frozen: icy bloom drift ──
        if (fb.icyBloom) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            for (let i = 0; i < 14; i++) {
                const seed = i * 59 + zone * 23;
                const x = ((seed * 17 + t * 8) % (w + 60)) - 30;
                const y = ((seed * 41 + t * 3) % (h + 60)) - 30;
                const sz = 1.5 + (seed % 3);
                const dist = Math.sqrt((x - torchX) ** 2 + (y - torchY) ** 2);
                const fade = Math.min(1, Math.max(0, (dist - 120) / 200));
                const alpha = (0.1 + Math.sin(t * 1.3 + i * 1.1) * 0.05) * fade;
                if (alpha < 0.01) continue;
                ctx.globalAlpha = alpha;
                const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, sz * 5);
                glowGrad.addColorStop(0, 'rgba(100,160,240,0.5)');
                glowGrad.addColorStop(0.4, 'rgba(70,130,220,0.15)');
                glowGrad.addColorStop(1, 'rgba(50,100,200,0)');
                ctx.fillStyle = glowGrad;
                ctx.fillRect(x - sz * 5, y - sz * 5, sz * 10, sz * 10);
            }
            ctx.restore();
        }
    },

    // ── Debug overlay ───────────────────────────────────────────
    drawDebug(ctx, canvasW, canvasH, camX, camY) {
        if (!this.debugEnabled) return;
        const zone = this.activeZone;
        const cfg = this.getConfig(zone);
        const srcCanvas = (!cfg.useFallback && spaceBgCanvas && spaceBgZone === zone)
            ? spaceBgCanvas : this.fallbackCanvas;

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.font = '11px monospace';
        ctx.fillStyle = '#0f0';
        const lines = [
            `[BG DEBUG] Zone: ${zone} (${(ZONE_CONFIGS[zone] || {}).name || '?'})`,
            `Fit: ${cfg.fitMode}  Opacity: ${cfg.opacity}  Overfill: ${cfg.overfillMargin}`,
            `Parallax: ${cfg.parallaxAmount}  Scale: ${cfg.scale}`,
            `Source: ${srcCanvas ? `${srcCanvas.width}x${srcCanvas.height}` : 'NONE'}  Fallback: ${this.fallbackCanvas ? 'yes' : 'no'}`,
            `Camera: (${Math.round(camX)}, ${Math.round(camY)})`,
            `Render order: BG → Floor → Walls/Props → Characters → Darkness → FX → UI`,
        ];
        // Draw bg rect bounds if source exists
        if (srcCanvas) {
            const px = (camX || 0) * cfg.parallaxAmount;
            const py = (camY || 0) * cfg.parallaxAmount;
            const rect = this.computeDrawRect(srcCanvas.width, srcCanvas.height,
                canvasW, canvasH, cfg.fitMode, cfg.overfillMargin,
                cfg.offsetX, cfg.offsetY, px, py);
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
            ctx.setLineDash([]);
            lines.push(`Bounds: (${Math.round(rect.x)},${Math.round(rect.y)}) ${Math.round(rect.w)}x${Math.round(rect.h)}`);
        }
        for (let i = 0; i < lines.length; i++) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(4, 4 + i * 14, ctx.measureText(lines[i]).width + 8, 14);
            ctx.fillStyle = '#0f0';
            ctx.fillText(lines[i], 8, 14 + i * 14);
        }
        ctx.restore();
    },
};
