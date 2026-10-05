"""Bonjou nearby devices. Modelled and rendered in Blender, no generated artwork.
Run capture-scene-screens.mjs with the app running, then:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/render-nearby-scene.py
Source textures and editable .blend are saved in assets/nearby-scene/.
"""
import bpy, math, os
from mathutils import Vector
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets' / 'nearby-scene'
OUT = ROOT / 'public' / 'images'
ASSETS.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0, rough=.45):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
silver=material('Bead-blasted aluminium',(.56,.58,.6),.85,.27)
edge=material('Polished chamfer',(.64,.67,.7),.95,.2)
black=material('Graphite keycaps',(.016,.019,.021),.15,.35)
glass=material('Black screen surround',(.005,.008,.01),.2,.16)
track=material('Satin glass trackpad',(.43,.46,.48),.45,.32)
red=material('Vermilion bookcloth',(.38,.025,.018),0,.8)
paper=material('Uncoated paper',(.83,.81,.75),0,.85)
ceramic=material('Warm porcelain',(.8,.77,.69),0,.23)
coffee=material('Coffee',(.032,.013,.007),0,.2)
keylegend=material('Key legends',(.62,.64,.65),0,.6)
stone=material('Pale limestone desktop',(.83,.825,.81),0,.85)
# Fine, low-contrast physical texture on the tabletop.
nodes=stone.node_tree.nodes; links=stone.node_tree.links
noise=nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=135; noise.inputs['Roughness'].default_value=.72
bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.12; bump.inputs['Distance'].default_value=.017
links.new(noise.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])

def box(name, loc, dims, mat, bevel=.04, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler=rot
    if bevel:
        mod=o.modifiers.new('Machined rounded edges','BEVEL'); mod.width=bevel; mod.segments=4
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    o.data.materials.append(mat)
    return o

def round_panel(name, width, height, radius, loc, mat, rot=(0,0,0)):
    verts=[]
    for cx,cy,start in [(width/2-radius,height/2-radius,0),(-width/2+radius,height/2-radius,90),(-width/2+radius,-height/2+radius,180),(width/2-radius,-height/2+radius,270)]:
        for i in range(9):
            a=math.radians(start+i*90/8)
            verts.append((cx+radius*math.cos(a),cy+radius*math.sin(a),0))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],[list(range(len(verts)))]); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); o.location=loc; o.rotation_euler=rot; mesh.materials.append(mat)
    uv=mesh.uv_layers.new()
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v=verts[mesh.loops[li].vertex_index]; uv.data[li].uv=(v[0]/width+.5,v[1]/height+.5)
    return o

def screen_material(name, filename):
    m=material(name,(1,1,1),0,.25); n=m.node_tree.nodes; p=n.get('Principled BSDF')
    tex=n.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(ASSETS/filename)); tex.image.pack()
    m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']); m.node_tree.links.new(tex.outputs['Color'],p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value=.28; p.inputs['Specular IOR Level'].default_value=.18
    return m
laptop_screen=screen_material('Bonjou, real laptop conversation','laptop-screen.png')
phone_screen=screen_material('Bonjou, real phone conversation','phone-screen.png')
box('Desk',(0,0,-.19),(200,200,.3),stone,.03)
# Laptop is assembled in local coordinates then rotated together.
start=set(bpy.data.objects)
box('Aluminium lower shell',(0,0,.075),(3.35,2.15,.15),silver,.075)
box('Deck seam',(0,0,.144),(3.29,2.09,.025),edge,.06)
box('Keyboard recess',(0,.27,.161),(2.87,1.13,.024),black,.055)
# Familiar physical keyboard geometry, small legends and full-width spacebar.
rows=[list('1234567890-=') ,list('QWERTYUIOP[]'),list('ASDFGHJKL;'),list('ZXCVBNM,./')]
for r, letters in enumerate(rows):
    y=.72-r*.226
    for c, char in enumerate(letters):
        x=-1.285+c*.226+(0 if r<2 else .055*r)
        box('Key '+char,(x,y,.19),(.193,.181,.045),black,.022)
        bpy.ops.object.text_add(location=(x,y-.018,.215)); t=bpy.context.object; t.name='Legend '+char; t.data.body=char; t.data.align_x='CENTER'; t.data.size=.048; t.data.extrude=0; t.data.materials.append(keylegend)
# Modifiers and arrow keys frame the spacebar.
for x,w in [(-1.285,.2),(-1.045,.2),(-.805,.2),(0,1.32),(.82,.2),(1.06,.2),(1.3,.2)]: box('Bottom key',(x,-.184,.19),(w,.18,.045),black,.02)
box('Trackpad outline',(0,-.657,.166),(1.3,.57,.013),edge,.07)
box('Trackpad',(0,-.657,.175),(1.28,.55,.012),track,.064)
# Hinge and tilted display. Image faces the viewing side of the laptop.
box('Display hinge',(0,.955,.18),(2.95,.16,.13),black,.055)
angle=math.radians(72)
lidloc=Vector((0,1.278,1.18))
normal=Vector((0,-math.sin(angle),math.cos(angle)))
box('Display aluminium lid',lidloc,(3.32,2.12,.075),silver,.07,(angle,0,0))
round_panel('Display glass',3.24,2.04,.06,lidloc+normal*.04,glass,(angle,0,0))
round_panel('Laptop screen',3.10,1.9375,.025,lidloc+normal*.042,laptop_screen,(angle,0,0))
# Camera dot above the display, inset in the bezel.
campos=lidloc+Vector((0,math.cos(angle)*1.01,math.sin(angle)*1.01))+normal*.044
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.012,location=campos); bpy.context.object.data.materials.append(black)
laptop=bpy.data.objects.new('Laptop assembly',None); bpy.context.collection.objects.link(laptop)
for o in set(bpy.data.objects)-start-{laptop}: o.parent=laptop
laptop.location=(-.62,.37,0); laptop.rotation_euler.z=math.radians(-8)
# Phone laid naturally on the desk.
start=set(bpy.data.objects)
frame=round_panel('Phone titanium frame',1.00,2.12,.13,(0,0,.18),silver)
solid=frame.modifiers.new('Frame thickness','SOLIDIFY'); solid.thickness=.16; solid.offset=-1
bevel=frame.modifiers.new('Frame edge','BEVEL'); bevel.width=.008; bevel.segments=3
frame.modifiers.new('Frame normals','WEIGHTED_NORMAL')
round_panel('Phone gasket',.975,2.095,.116,(0,0,.197),glass)
round_panel('Phone screen',.931,2.014,.084,(0,0,.202),phone_screen)
box('Earpiece',(0,.963,.207),(.14,.017,.008),black,.008)
box('Power button',(.505,.38,.1),(.022,.31,.055),edge,.014)
box('Volume rocker',(-.505,.37,.1),(.02,.37,.053),edge,.013)
phone=bpy.data.objects.new('Phone assembly',None); bpy.context.collection.objects.link(phone)
for o in set(bpy.data.objects)-start-{phone}: o.parent=phone
phone.location=(1.64,-.97,0); phone.rotation_euler.z=math.radians(-18)
# A small clothbound notebook lends a restrained Bonjou red accent.
start=set(bpy.data.objects)
box('Book lower cover',(0,0,.035),(1.11,1.57,.035),red,.025)
box('Book pages',(.012,0,.108),(1.055,1.51,.11),paper,.014)
box('Book upper cover',(0,0,.177),(1.11,1.57,.035),red,.025)
box('Book spine',(-.53,0,.108),(.065,1.55,.15),red,.028)
for i in range(12): box('Page edge',(0,-.756,.062+i*.008),(1.02,.002,.0013),paper,0)
book=bpy.data.objects.new('Notebook assembly',None); bpy.context.collection.objects.link(book)
for o in set(bpy.data.objects)-start-{book}: o.parent=book
book.location=(-2.16,-1.3,0); book.rotation_euler.z=math.radians(11)
# Ceramic cup made from a real hollow revolved cross-section.
profile=[(.0,.02),(.27,.02),(.31,.045),(.37,.12),(.405,.58),(.407,.64),(.39,.66),(.367,.64),(.365,.60),(.325,.15),(.27,.08),(0,.08)]
verts=[]; faces=[]; steps=96
for r,z in profile:
    for j in range(steps):
        a=j*2*math.pi/steps; verts.append((r*math.cos(a)+2.03,r*math.sin(a)+1.49,z))
for i in range(len(profile)-1):
    for j in range(steps): faces.append((i*steps+j,i*steps+(j+1)%steps,(i+1)*steps+(j+1)%steps,(i+1)*steps+j))
mesh=bpy.data.meshes.new('Cup profile'); mesh.from_pydata(verts,[],faces); mesh.update(); cup=bpy.data.objects.new('Porcelain cup',mesh); bpy.context.collection.objects.link(cup); mesh.materials.append(ceramic)
for poly in mesh.polygons: poly.use_smooth=True
bpy.ops.mesh.primitive_torus_add(major_radius=.21,minor_radius=.055,major_segments=48,minor_segments=16,location=(2.48,1.49,.36),rotation=(math.pi/2,0,0)); bpy.context.object.name='Cup handle'; bpy.context.object.data.materials.append(ceramic)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.359,depth=.008,location=(2.03,1.49,.555)); bpy.context.object.data.materials.append(coffee)
# Large window and soft bounce. No coloured lights or floating UI effects.
world=bpy.data.worlds.new('Daylight studio'); world.use_nodes=True; world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.83,.9,1); world.node_tree.nodes['Background'].inputs[1].default_value=.35; bpy.context.scene.world=world

def area(name,loc,power,size,target,color=(1,.96,.89)):
    bpy.ops.object.light_add(type='AREA',location=loc); light=bpy.context.object; light.name=name; light.data.energy=power; light.data.shape='DISK'; light.data.size=size; light.data.color=color; light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
area('Large window',(-3,-4,7),700,4,(0,0,0))
area('White wall bounce',(4,2,5),350,5,(0,0,0),(.91,.95,1))
bpy.ops.object.camera_add(location=(5,-7.5,8.8)); camera=bpy.context.object; target=Vector((.03,.12,.70)); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.type='ORTHO'; camera.data.ortho_scale=7.7
scene=bpy.context.scene; scene.camera=camera; scene.render.engine='CYCLES'; scene.cycles.samples=96; scene.cycles.use_denoising=True
scene.render.resolution_x=1600; scene.render.resolution_y=1400; scene.render.resolution_percentage=int(os.environ.get('RENDER_PERCENT','100'))
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(ASSETS/'nearby-devices.png')
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
scene.render.film_transparent=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS/'nearby-devices.blend'))
bpy.ops.render.render(write_still=True)
