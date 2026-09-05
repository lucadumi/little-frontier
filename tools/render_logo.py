"""Build Little Frontier's original, editable tiny-planet brand mark.

Run from the project root:
    blender --background --factory-startup --threads 3 --python tools/render_logo.py

Only the .blend, 512px brand PNG, and 64px favicon are written. Materials and
geometry are procedural; there are no external assets or Python dependencies.
"""

from pathlib import Path
import math
import shutil
import struct
import subprocess
import zlib

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
BLEND_PATH = ROOT / "art/little-frontier-logo.blend"
LOGO_PATH = ROOT / "public/brand/little-frontier-logo.png"
FAVICON_PATH = ROOT / "public/favicon.png"
RADIUS = 1.45
VIEW = Vector((6.0, -9.0, 6.5)).normalized()
RIGHT = Vector((-VIEW.y, VIEW.x, 0.0)).normalized()
UP = VIEW.cross(RIGHT).normalized()
LAKE_NORMAL = (VIEW * 0.92 - RIGHT * 0.23 - UP * 0.30).normalized()
LAKE_X = (RIGHT - LAKE_NORMAL * RIGHT.dot(LAKE_NORMAL)).normalized()
LAKE_Y = LAKE_NORMAL.cross(LAKE_X).normalized()
LAKE_WIDTH, LAKE_HEIGHT = 0.76, 0.49


def linear_color(hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
                 for c in channels) + (1.0,)


def material(name, color, roughness=0.65):
    result = bpy.data.materials.new(name)
    result.diffuse_color = linear_color(color)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = result.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = 0.28
    return result


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def put(obj, name, group, mat=None, parent=None):
    obj.name = name
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    group.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def mesh(name, vertices, faces, group, mat=None, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    if mat:
        data.materials.append(mat)
    obj.parent = parent
    return obj


def bevel(obj, width=0.035, segments=3):
    modifier = obj.modifiers.new("Soft handmade edges", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    normal = obj.modifiers.new("Weighted face highlights", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return obj


def box(name, size, position, mat, group, parent=None, rounding=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = put(bpy.context.object, name, group, mat, parent)
    for vertex in obj.data.vertices:
        vertex.co.x *= size[0]
        vertex.co.y *= size[1]
        vertex.co.z *= size[2]
    obj.location = position
    return bevel(obj, rounding) if rounding else obj


def ico(name, position, scale, mat, group, parent=None, subdivisions=3):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1)
    obj = put(bpy.context.object, name, group, mat, parent)
    for vertex in obj.data.vertices:
        vertex.co.x *= scale[0]
        vertex.co.y *= scale[1]
        vertex.co.z *= scale[2]
    obj.location = position
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def radial_root(name, normal, distance, group):
    obj = bpy.data.objects.new(name, None)
    group.objects.link(obj)
    normal = Vector(normal).normalized()
    obj.location = normal * distance
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(normal)
    obj.empty_display_size = 0.2
    return obj


def coast_shape(angle):
    return 1 + 0.10 * math.sin(3 * angle + 0.7) + 0.055 * math.cos(2 * angle - 0.4)


def lake_point(x, y, radius):
    angle = math.hypot(x, y)
    if angle < 1e-8:
        return LAKE_NORMAL * radius
    return (LAKE_NORMAL * math.cos(angle)
            + (LAKE_X * x + LAKE_Y * y) * (math.sin(angle) / angle)) * radius


def lake_distance(normal):
    cosine = max(-1.0, min(1.0, normal.dot(LAKE_NORMAL)))
    angle = math.acos(cosine)
    if angle < 1e-8:
        return 0
    tangent = normal - LAKE_NORMAL * cosine
    if tangent.length < 1e-8:
        return 10
    tangent.normalize()
    x = angle * tangent.dot(LAKE_X) / LAKE_WIDTH
    y = angle * tangent.dot(LAKE_Y) / LAKE_HEIGHT
    return math.hypot(x, y) / coast_shape(math.atan2(y, x))


def smoothstep(start, end, value):
    value = max(0.0, min(1.0, (value - start) / (end - start)))
    return value * value * (3 - 2 * value)


def stroke(name, points, radius, mat, group, parent=None):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    group.objects.link(obj)
    curve.materials.append(mat)
    obj.parent = parent
    return obj


def make_planet(group, mats):
    globe = ico("Meadow globe · sculpted lake basin", (0, 0, 0),
                (RADIUS,) * 3, mats["land"], group, subdivisions=6)
    colors = globe.data.color_attributes.new(
        name="Meadow and sandy shore", type="FLOAT_COLOR", domain="POINT")
    meadow = linear_color("91bd69")
    forest = linear_color("6aa579")
    sand = linear_color("e9d4a0")
    for vertex in globe.data.vertices:
        normal = vertex.co.normalized()
        distance = lake_distance(normal)
        basin = 0.072 * (1 - smoothstep(0.82, 1.18, distance))
        vertex.co = normal * (RADIUS - basin)
        variation = 0.18 + 0.16 * math.sin(normal.x * 4 + normal.z * 3)
        green = tuple(meadow[i] * (1 - variation) + forest[i] * variation
                      for i in range(4))
        shore = 1 - smoothstep(1.085, 1.145, distance)
        colors.data[vertex.index].color = tuple(
            green[i] * (1 - shore) + sand[i] * shore for i in range(4))
    globe.data.update()
    nodes = mats["land"].node_tree.nodes
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = colors.name
    mats["land"].node_tree.links.new(
        attribute.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])

    vertices = [LAKE_NORMAL * (RADIUS - 0.023)]
    faces = []
    segments, rings = 144, 28
    for ring in range(1, rings + 1):
        radial = 1.14 * ring / rings
        for segment in range(segments):
            angle = 2 * math.pi * segment / segments
            shape = coast_shape(angle)
            vertices.append(lake_point(
                LAKE_WIDTH * radial * math.cos(angle) * shape,
                LAKE_HEIGHT * radial * math.sin(angle) * shape,
                RADIUS - 0.023))
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for ring in range(rings - 1):
        a, b = 1 + ring * segments, 1 + (ring + 1) * segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append((a + segment, b + segment, b + following, a + following))
    water = mesh("Aqua lake · curved inset surface", vertices, faces, group, mats["water"])
    for polygon in water.data.polygons:
        polygon.use_smooth = True
    for index, (start, end, height) in enumerate(((-0.32, 0.06, -0.04), (-0.12, 0.11, -0.16))):
        points = [lake_point(start + (end - start) * step / 6,
                             height + 0.015 * math.sin(math.pi * step / 6),
                             RADIUS - 0.017) for step in range(7)]
        stroke(f"Quiet lake reflection {index + 1}", points, 0.011,
               mats["reflection"], group)


def arch(name, x, y, bottom, width, height, depth, mat, group, parent):
    radius = width / 2
    outline = [(-radius, bottom), (radius, bottom)]
    for step in range(17):
        angle = math.pi * step / 16
        outline.append((math.cos(angle) * radius,
                        bottom + height - radius + math.sin(angle) * radius))
    vertices = [(x + px, y + offset, pz)
                for offset in (-depth / 2, depth / 2) for px, pz in outline]
    count = len(outline)
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    faces.extend((i, i + count, (i + 1) % count + count, (i + 1) % count)
                 for i in range(count))
    return bevel(mesh(name, vertices, faces, group, mat, parent), 0.009, 3)


def make_cottage(group, mats):
    root = radial_root("Cottage · radial surface anchor",
                       (-0.36, -0.19, 0.914), RADIUS - 0.075, group)
    box("Warm stone footing", (1.16, 0.97, 0.31), (0, 0, -0.075),
        mats["foundation"], group, root, 0.065)
    profile = [(-0.54, 0.055), (0.54, 0.055), (0.54, 0.855),
               (0, 1.34), (-0.54, 0.855)]
    vertices = [(x, y, z) for y in (-0.43, 0.43) for x, z in profile]
    faces = [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5)]
    faces.extend((i, i + 5, (i + 1) % 5 + 5, (i + 1) % 5) for i in range(5))
    bevel(mesh("Cream plaster cottage", vertices, faces, group, mats["plaster"], root),
          0.028)
    slope = math.atan2(0.52, 0.68)
    length = math.hypot(0.68, 0.52) + 0.055
    for side in (-1, 1):
        roof = box(f"Coral roof · {'left' if side < 0 else 'right'} slope",
                   (length, 1.11, 0.105), (side * 0.34, 0, 1.145),
                   mats["roof"], group, root, 0.035)
        roof.rotation_euler.y = side * slope
        box(f"Coral eave {side}", (0.075, 1.115, 0.07), (side * 0.681, 0, 0.878),
            mats["roof_edge"], group, root, 0.025)
        for seam in (-0.24, 0.24):
            stroke(f"Raised roof seam {side} {seam}",
                   [(side * 0.045, seam, 1.443), (side * 0.35, seam, 1.209),
                    (side * 0.671, seam, 0.964)],
                   0.009, mats["roof_seam"], group, root)
    box("Rounded roof ridge", (0.11, 1.15, 0.105), (0, 0, 1.44),
        mats["roof"], group, root, 0.045)
    box("Little plaster chimney", (0.19, 0.23, 0.42), (0.30, 0.25, 1.29),
        mats["plaster"], group, root, 0.025)
    box("Chimney cap", (0.265, 0.295, 0.075), (0.30, 0.25, 1.512),
        mats["foundation"], group, root, 0.026)
    box("Chimney opening", (0.115, 0.14, 0.012), (0.30, 0.25, 1.553),
        mats["timber"], group, root, 0.018)
    arch("Arched timber door frame", -0.17, -0.455, 0.075, 0.335, 0.565, 0.06,
         mats["timber"], group, root)
    arch("Welcoming teal door", -0.17, -0.492, 0.085, 0.278, 0.513, 0.035,
         mats["teal"], group, root)
    ico("Small brass door knob", (-0.085, -0.528, 0.305), (0.023,) * 3,
        mats["gold"], group, root, subdivisions=2)
    box("Front window frame", (0.295, 0.055, 0.295), (0.29, -0.461, 0.596),
        mats["timber"], group, root, 0.028)
    box("Front teal window", (0.224, 0.027, 0.224), (0.29, -0.503, 0.596),
        mats["teal"], group, root, 0.018)
    box("Window vertical mullion", (0.025, 0.02, 0.23), (0.29, -0.523, 0.596),
        mats["plaster"], group, root, 0.007)
    box("Window horizontal mullion", (0.23, 0.02, 0.025), (0.29, -0.523, 0.596),
        mats["plaster"], group, root, 0.007)
    box("Side window frame", (0.05, 0.29, 0.29), (0.552, 0.07, 0.59),
        mats["timber"], group, root, 0.025)
    box("Side teal window", (0.025, 0.218, 0.218), (0.585, 0.07, 0.59),
        mats["teal"], group, root, 0.015)
    box("Side window mullion", (0.018, 0.024, 0.222), (0.604, 0.07, 0.59),
        mats["plaster"], group, root, 0.006)
    box("Doorstep", (0.42, 0.24, 0.10), (-0.17, -0.535, 0.055),
        mats["foundation"], group, root, 0.032)
    bpy.context.view_layer.update()
    for index in range(2):
        position = root.matrix_world @ Vector((-0.17, -0.78 - index * 0.23, -0.10))
        normal = position.normalized()
        step_root = radial_root(f"Curved footpath anchor {index + 1}",
                                normal, RADIUS + 0.012, group)
        box(f"Footpath stone {index + 1}", (0.25 - index * 0.025, 0.15, 0.045),
            (0, 0, 0), mats["foundation"], group, step_root, 0.022)


def branch(name, start, end, lower, upper, group, mat, parent):
    start, end = Vector(start), Vector(end)
    direction = end - start
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=lower, radius2=upper,
                                    depth=direction.length)
    obj = put(bpy.context.object, name, group, mat, parent)
    obj.location = (start + end) / 2
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    bevel(obj, 0.018, 2)
    return obj


def make_tree(group, mats):
    root = radial_root("Tree · radial surface anchor",
                       (0.50, 0.22, 0.838), RADIUS - 0.035, group)
    branch("Tapered tree trunk", (0, 0, -0.035), (0.015, 0, 1.08),
           0.10, 0.055, group, mats["timber"], root)
    branch("Left fork", (0, 0, 0.51), (-0.30, 0.01, 0.94),
           0.063, 0.031, group, mats["timber"], root)
    branch("Right fork", (0, 0, 0.63), (0.27, 0.02, 1.04),
           0.057, 0.028, group, mats["timber"], root)
    lobes = [
        ico("Crown main lobe", (0, 0, 1.25), (0.455, 0.46, 0.56),
            mats["leaf"], group, root),
        ico("Crown left lobe", (-0.37, -0.01, 1.06), (0.37, 0.39, 0.37),
            mats["leaf"], group, root),
        ico("Crown right lobe", (0.35, 0.015, 1.10), (0.38, 0.40, 0.38),
            mats["leaf"], group, root),
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for lobe in lobes:
        lobe.select_set(True)
    bpy.context.view_layer.objects.active = lobes[0]
    bpy.ops.object.join()
    crown = lobes[0]
    crown.name = "Single rounded clover-shaped tree crown"
    remesh = crown.modifiers.new("Unified clay canopy", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.052
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = crown.modifiers.new("Soft canopy contours", "SMOOTH")
    smooth.factor = 0.6
    smooth.iterations = 4
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate = crown.modifiers.new("Simple editable canopy topology", "DECIMATE")
    decimate.ratio = 0.28
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for polygon in crown.data.polygons:
        polygon.use_smooth = True


def area_light(name, position, energy, size, color, group):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = linear_color(color)[:3]
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector((0, 0, 0.6)) - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_studio(scene, group):
    area_light("Warm softbox · upper left", (-3.5, -4.5, 7.0), 540, 4.5, "fff0d6", group)
    area_light("Cool gentle fill", (4.5, -2.0, 3.0), 260, 5.0, "e5f5ff", group)
    area_light("Warm crown and roof rim", (1.5, 4.0, 5.5), 540, 3.5, "ffe9c9", group)
    world = bpy.data.worlds.new("Transparent warm studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = linear_color("e6efdf")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32
    scene.world = world
    data = bpy.data.cameras.new("Brand mark orthographic camera")
    data.type = "ORTHO"
    data.lens = 50
    data.clip_end = 100
    camera = bpy.data.objects.new("Brand mark orthographic camera", data)
    group.objects.link(camera)
    camera.rotation_euler = (-VIEW).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    projected = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in scene.objects:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        evaluated_mesh = evaluated.to_mesh()
        for vertex in evaluated_mesh.vertices:
            point = evaluated.matrix_world @ vertex.co
            projected.append((point.dot(RIGHT), point.dot(UP)))
        evaluated.to_mesh_clear()
    left, right = min(p[0] for p in projected), max(p[0] for p in projected)
    bottom, top = min(p[1] for p in projected), max(p[1] for p in projected)
    target = RIGHT * ((left + right) / 2) + UP * ((bottom + top) / 2)
    camera.location = target + VIEW * 11
    data.ortho_scale = max(right - left, top - bottom) / 0.87
    scene.camera = camera


def resize_png(source, destination, size):
    sips = shutil.which("sips")
    if sips:
        subprocess.run([sips, "--resampleHeightWidth", str(size), str(size),
                        str(source), "--out", str(destination)],
                       check=True, stdout=subprocess.DEVNULL)
    else:
        image = bpy.data.images.load(str(source), check_existing=False)
        image.scale(size, size)
        image.filepath_raw = str(destination)
        image.file_format = "PNG"
        # save(), unlike save_render(), does not apply AgX a second time.
        image.save()
        bpy.data.images.remove(image)


def optimize_png(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    chunks, offset = [], 8
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        chunks.append((kind, payload))
        offset += length + 12
    compressed = b"".join(payload for kind, payload in chunks if kind == b"IDAT")
    optimized = zlib.compress(zlib.decompress(compressed), level=9)
    if len(optimized) > len(compressed):
        optimized = compressed
    output, written = bytearray(data[:8]), False
    for kind, payload in chunks:
        if kind in {b"tEXt", b"iTXt", b"zTXt", b"tIME", b"eXIf"}:
            continue
        if kind == b"IDAT":
            if written:
                continue
            payload, written = optimized, True
        output.extend(struct.pack(">I", len(payload)) + kind + payload)
        output.extend(struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff))
    path.write_bytes(output)


def verify_png(path, size):
    image = bpy.data.images.load(str(path), check_existing=False)
    assert tuple(image.size) == (size, size), (path, tuple(image.size))
    assert image.channels == 4, f"{path} must contain RGBA data"
    alpha = list(image.pixels)[3::4]
    assert min(alpha) == 0 and max(alpha) == 1
    border = alpha[:size] + alpha[-size:] + alpha[::size] + alpha[size - 1::size]
    assert max(border) == 0, f"{path} has clipped geometry or nontransparent padding"
    coverage = sum(value > 0 for value in alpha) / len(alpha)
    assert 0.30 < coverage < 0.80, f"Unexpected framing: {coverage:.1%}"
    print(f"Verified {path.relative_to(ROOT)}: {size}x{size}, RGBA, "
          f"clear border, {coverage:.1%} coverage, {path.stat().st_size:,} bytes")
    bpy.data.images.remove(image)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.collections):
        bpy.data.collections.remove(old)
    bpy.context.preferences.filepaths.save_version = 0
    for destination in (BLEND_PATH, LOGO_PATH, FAVICON_PATH):
        destination.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.name = "Little Frontier · Cottage by the lake"
    scene["Design"] = "Original tiny meadow planet, one coral-roof cottage, one rounded tree."
    scene["Rebuild"] = "blender --background --factory-startup --threads 3 --python tools/render_logo.py"
    scene["Export"] = "2x Cycles render; one sRGB downsample; transparent 512px and 64px PNGs."
    mats = {
        "land": material("Meadow · game terrain palette", "91bd69", 0.78),
        "water": material("Lake · aqua ceramic", "69cbd0", 0.30),
        "reflection": material("Quiet mint water glints", "c0eadb", 0.42),
        "plaster": material("Cottage · warm cream plaster", "ffe5b7", 0.72),
        "foundation": material("Warm limestone", "e5ce9e", 0.80),
        "roof": material("Cottage · coral terracotta", "d77954", 0.57),
        "roof_edge": material("Terracotta eave shadow", "af5840", 0.65),
        "roof_seam": material("Terracotta raised seam", "e08761", 0.63),
        "teal": material("Painted teal joinery", "559888", 0.50),
        "timber": material("Warm brown timber", "704e37", 0.75),
        "leaf": material("Tree · rounded fresh green crown", "659e51", 0.72),
        "gold": material("Warm sun brass", "dfb967", 0.36),
    }
    mats["water"].node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.035
    make_planet(collection("01 · Meadow planet and lake"), mats)
    make_cottage(collection("02 · Cozy cottage"), mats)
    make_tree(collection("03 · One rounded tree"), mats)
    make_studio(scene, collection("04 · Camera and studio lighting"))
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 160
    scene.cycles.seed = 72819
    scene.cycles.use_animated_seed = False
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.max_bounces = 7
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 3
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 3
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 100
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.filepath = str(LOGO_PATH)
    bpy.ops.render.render(write_still=True)
    resize_png(LOGO_PATH, LOGO_PATH, 512)
    resize_png(LOGO_PATH, FAVICON_PATH, 64)
    for path, size in ((LOGO_PATH, 512), (FAVICON_PATH, 64)):
        optimize_png(path)
        verify_png(path, size)
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.filepath = "//../public/brand/little-frontier-logo.png"
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = None
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), compress=True, check_existing=False)
    print(f"Saved editable source: {BLEND_PATH.relative_to(ROOT)} "
          f"({BLEND_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
