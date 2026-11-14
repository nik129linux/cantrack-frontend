"""Render the CanTrack mascot's animations from mascot/perrito.blend.

Run inside Blender (Scripting tab, or via the MCP addon):
    exec(open(r"<repo>/apps/web/mascot/animate_mascot.py").read())

Every pose is procedural: each frame sets the pivots (legs, head, ears, tail and
the root) and renders a transparent PNG into mascot/frames/<pose>/. Then
`python mascot/build_sprites.py` packs the frames into the sprite sheets the web
app loads from public/mascot/.
"""

import math
import os

import bpy

FRAMES = 24
HERE = os.path.dirname(bpy.data.filepath) or os.getcwd()
OUT = os.path.join(HERE, "frames")
TAU = 2 * math.pi
R = math.radians

O = bpy.data.objects
scene = bpy.context.scene
LEGS = ("DI", "DD", "TI", "TD")  # delantera/trasera, izquierda/derecha
LEG_X = {"DI": 0.4, "DD": 0.4, "TI": -0.42, "TD": -0.42}


def rest():
    O["Perrito"].location = (0, 0, 0)
    O["Perrito"].rotation_euler = (0, 0, 0)
    O["Perrito"].scale = (1, 1, 1)
    for name in LEGS:
        pivot = O["PataPivot" + name]
        pivot.rotation_euler = (0, 0, 0)
        pivot.location.x = LEG_X[name]
        pivot.location.z = 0.62
    O["CabezaPivot"].rotation_euler = (0, 0, 0)
    O["ColaPivot"].rotation_euler = (0, 0, 0)
    for side in ("L", "R"):
        O["OrejaPivot" + side].rotation_euler = (0, R(-8), 0)
    O["Sombra"].scale = (0.9, 0.45, 1)


def leg(name, swing_deg, lift=0.0):
    pivot = O["PataPivot" + name]
    pivot.rotation_euler = (0, R(swing_deg), 0)
    pivot.location.z = 0.62 + lift


def ears(pitch_deg):
    for side in ("L", "R"):
        O["OrejaPivot" + side].rotation_euler = (0, R(pitch_deg), 0)


def body(z=0.0, pitch_deg=0.0, breathe=0.0):
    root = O["Perrito"]
    root.location = (0, 0, z)
    root.rotation_euler = (0, R(pitch_deg), 0)
    root.scale = (1, 1, 1 + breathe)
    shrink = max(0.55, 1 - z * 1.1)
    O["Sombra"].scale = (0.9 * shrink, 0.45 * shrink, 1)


def head(nod_deg=0.0, tilt_deg=0.0, turn_deg=0.0):
    O["CabezaPivot"].rotation_euler = (R(tilt_deg), R(nod_deg), R(turn_deg))


def tail(wag_deg=0.0, droop_deg=0.0):
    O["ColaPivot"].rotation_euler = (R(wag_deg * 0.5), R(droop_deg), R(wag_deg))


# --- poses: t runs 0..1 over one loop -------------------------------------


def run(t):
    phase = {"DI": 0.0, "DD": 0.1, "TI": 0.5, "TD": 0.6}
    for name, ph in phase.items():
        a = math.sin(TAU * (t - ph))
        leg(name, 48 * a, 0.07 * max(0.0, math.cos(TAU * (t - ph))))
    body(0.02 + 0.06 * abs(math.sin(TAU * 2 * t)), -5 * math.sin(TAU * t))
    head(8 * math.sin(TAU * t + 1.2))
    ears(-8 + 9 * math.sin(TAU * 2 * t + 0.5))
    tail(20 * math.sin(TAU * 2 * t + 1), 14 * math.sin(TAU * 2 * t))


def walk(t):
    phase = {"DI": 0.0, "TD": 0.0, "DD": 0.5, "TI": 0.5}
    for name, ph in phase.items():
        a = math.sin(TAU * (t - ph))
        leg(name, 24 * a, 0.04 * max(0.0, math.cos(TAU * (t - ph))))
    body(0.015 * abs(math.sin(TAU * t)), -1.5 * math.sin(TAU * 2 * t))
    head(4 * math.sin(TAU * 2 * t + 0.6), 0, 3 * math.sin(TAU * t))
    ears(-6 + 5 * math.sin(TAU * 2 * t + 0.4))
    tail(14 * math.sin(TAU * t))


def wait(t):
    body(0, 0, 0.018 * math.sin(TAU * t))
    head(-3 + 2 * math.sin(TAU * t), 9 * math.sin(TAU * t), 6 * math.sin(TAU * t + 0.8))
    ears(-6 + 3 * math.sin(TAU * t + 0.3))
    tail(34 * math.sin(TAU * 3 * t), -6)


def jump(t):
    if t < 0.18:  # crouch
        k = math.sin(t / 0.18 * math.pi / 2)
        body(-0.06 * k, 4 * k)
        for name in LEGS:
            leg(name, 0, -0.06 * k)
        ears(-8)
    elif t < 0.78:  # airborne
        k = (t - 0.18) / 0.6
        body(0.5 * math.sin(k * math.pi), -12 * math.cos(k * math.pi))
        tuck = math.sin(k * math.pi)
        leg("DI", -45 * tuck, 0.05 * tuck)
        leg("DD", -40 * tuck, 0.05 * tuck)
        leg("TI", 42 * tuck, 0.04 * tuck)
        leg("TD", 38 * tuck, 0.04 * tuck)
        ears(-8 + 34 * math.cos(k * math.pi))  # trail back going up, float on the way down
    else:  # land and settle
        k = (t - 0.78) / 0.22
        squash = math.sin(k * math.pi)
        body(-0.05 * squash, 3 * squash)
        for name in LEGS:
            leg(name, 0, -0.05 * squash)
        ears(-8 + 14 * squash)
    head(-6 * math.sin(t * math.pi))
    tail(38 * math.sin(TAU * 4 * t))


def sad(t):
    body(-0.02, 3, 0.012 * math.sin(TAU * t))
    head(22 + 3 * math.sin(TAU * t), -6, -4)
    ears(28)
    tail(5 * math.sin(TAU * t), -55)
    for name in LEGS:
        leg(name, 0, -0.02)


def bye(t):
    body(0, -6, 0.01 * math.sin(TAU * t))
    wave = math.sin(TAU * 2 * t)
    # The near front paw comes out in front of the chest and waves.
    leg("DI", -112 + 22 * wave, 0.14)
    O["PataPivotDI"].location.x = LEG_X["DI"] + 0.2
    head(-10, 12 * math.sin(TAU * t), 10)
    ears(-14 + 6 * wave)
    tail(30 * math.sin(TAU * 3 * t))


POSES = {"run": run, "walk": walk, "wait": wait, "jump": jump, "sad": sad, "bye": bye}


def render(names=None):
    for o in O:
        if o.animation_data is not None:
            o.animation_data_clear()
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_x = 480
    scene.render.resolution_y = 400
    for name in names or POSES:
        folder = os.path.join(OUT, name)
        os.makedirs(folder, exist_ok=True)
        for f in range(FRAMES):
            rest()
            POSES[name](f / FRAMES)
            bpy.context.view_layer.update()
            scene.render.filepath = os.path.join(folder, f"{f:02d}.png")
            bpy.ops.render.render(write_still=True)
    rest()


if __name__ == "__main__":
    render()
