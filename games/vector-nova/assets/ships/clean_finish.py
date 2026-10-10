"""Fleet clean coated bodywork, resin composite and machined alloy.

Broad reflection shapes establish the finish. The existing four-map bake carries
only restrained manufacturing variation and rounded-edge normals; clearcoat and
metallicity remain scalar glTF properties, requiring no additional runtime maps.
"""


def crafted_finish(mat, kind, heat_start=None, heat_end=None, scuffs=None):
    # Keep the shared fleet call signature. This factory finish intentionally
    # does not turn heat coordinates or maintenance scuffs into painted damage.
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')

    def node(type, label=''):
        result = nodes.new(type)
        result.label = label
        return result

    def op(operation, a, b):
        result = node('ShaderNodeMath')
        result.operation = operation
        for index, value in enumerate((a, b)):
            if isinstance(value, (float, int)):
                result.inputs[index].default_value = value
            else:
                links.new(value, result.inputs[index])
        return result.outputs[0]

    def mix(a, b, factor):
        result = node('ShaderNodeMixRGB')
        for index, value in enumerate((factor, a, b)):
            if isinstance(value, (float, int, tuple)):
                result.inputs[index].default_value = value
            else:
                links.new(value, result.inputs[index])
        return result.outputs[0]

    geometry = node('ShaderNodeNewGeometry', 'Manufactured finish in metre space')

    def noise(scale, label, detail=1):
        vector = node('ShaderNodeVectorMath')
        vector.operation = 'MULTIPLY'
        vector.inputs[1].default_value = scale
        links.new(geometry.outputs['Position'], vector.inputs[0])
        result = node('ShaderNodeTexNoise', label)
        result.inputs['Scale'].default_value = 1
        result.inputs['Detail'].default_value = detail
        links.new(vector.outputs[0], result.inputs['Vector'])
        return result.outputs['Fac']

    # These are linear material values, not display RGB. The coat is a separate
    # dielectric highlight over the quieter body/reflection lobe underneath.
    settings = {
        'pearl': {
            'color': (.40, .425, .43, 1), 'metal': .025,
            'roughness': .22, 'variation': .012,
            'coat': .72, 'coat_roughness': .10, 'radius': .006,
        },
        'pearl2': {
            'color': (.23, .27, .29, 1), 'metal': .02,
            'roughness': .29, 'variation': .012,
            'coat': .50, 'coat_roughness': .15, 'radius': .004,
        },
        'carbon': {
            'color': (.017, .021, .024, 1), 'metal': .12,
            'roughness': .32, 'variation': .024,
            'coat': .78, 'coat_roughness': .10, 'radius': .003,
        },
        'metal': {
            'color': (.34, .365, .385, 1), 'metal': .95,
            'roughness': .225, 'variation': .035,
            'coat': 0, 'coat_roughness': .2, 'radius': .0025,
        },
        'darkmetal': {
            'color': (.09, .115, .13, 1), 'metal': .88,
            'roughness': .31, 'variation': .026,
            'coat': 0, 'coat_roughness': .2, 'radius': .002,
        },
    }[kind]
    # Defaults also give the fast geometry/scalar preview the authored finish
    # when its export intentionally strips procedural texture links.
    bsdf.inputs['Base Color'].default_value = settings['color']
    bsdf.inputs['Roughness'].default_value = settings['roughness']
    mat.diffuse_color = settings['color']
    bsdf.inputs['Metallic'].default_value = settings['metal']
    bsdf.inputs['IOR'].default_value = 1.48
    bsdf.inputs['Coat Weight'].default_value = settings['coat']
    bsdf.inputs['Coat Roughness'].default_value = settings['coat_roughness']
    bsdf.inputs['Coat IOR'].default_value = 1.5

    metal = kind in ('metal', 'darkmetal')
    grain = noise((145, 7, 145) if metal else (72, 72, 72),
                  'Axial finishing grain' if metal else 'Restrained coating response')
    roughness = op('ADD', settings['roughness'],
                   op('MULTIPLY', op('SUBTRACT', grain, .5), settings['variation']))
    # Surface color stays calm. Reflection and contact shading describe form;
    # no broad noise, cavity dirt or scratches are baked into the paint color.
    color = mix(settings['color'], settings['color'], 0)

    if kind == 'carbon':
        position = node('ShaderNodeSeparateXYZ')
        links.new(geometry.outputs['Position'], position.inputs[0])
        # Restrained bundle structure under resin, not raised quilted fibers.
        # Its low contrast survives the existing 512 atlas without busy moire.
        u = op('MULTIPLY', op('ADD', position.outputs['X'], position.outputs['Y']), 235)
        v = op('MULTIPLY', op('SUBTRACT', position.outputs['X'], position.outputs['Y']), 235)
        weave = op('ADD', .5, op('MULTIPLY',
                    op('MULTIPLY', op('SINE', u, 0), op('SINE', v, 0)), .5))
        color = mix(settings['color'], (.029, .034, .039, 1),
                    op('MULTIPLY', weave, .42))
        roughness = op('ADD', roughness, op('MULTIPLY', weave, .025))

    bevel = node('ShaderNodeBevel', 'Clean rounded reflection at component edges')
    bevel.inputs['Radius'].default_value = settings['radius']
    bevel.samples = 4
    normal = bevel.outputs['Normal']
    if metal:
        bump = node('ShaderNodeBump', 'Subtle machined grain below the specular lobe')
        bump.inputs['Strength'].default_value = .12
        bump.inputs['Distance'].default_value = .00012
        links.new(grain, bump.inputs['Height'])
        links.new(normal, bump.inputs['Normal'])
        normal = bump.outputs[0]

    # Separate occlusion retains actual join depth without dirtying exposed
    # surfaces. The exporter packs this into the existing roughness/AO texture.
    ao = node('ShaderNodeAmbientOcclusion', 'Short-range fitted-component contact')
    ao.inputs['Distance'].default_value = .045
    ao.samples = 12
    cavity = op('ADD', .45, op('MULTIPLY', ao.outputs['AO'], .55))
    links.new(color, bsdf.inputs['Base Color'])
    links.new(roughness, bsdf.inputs['Roughness'])
    links.new(normal, bsdf.inputs['Normal'])
    return {'color': color, 'roughness': roughness, 'occlusion': cavity}
