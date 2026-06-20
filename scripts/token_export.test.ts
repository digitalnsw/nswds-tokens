import { GetLocalVariablesResponse } from '@figma/rest-api-spec'
import { tokenFilesFromLocalVariables } from './token_export.js'

describe('tokenFilesFromLocalVariables', () => {
  it('ignores remote variables', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: 'primitives',
            modes: [{ modeId: '1:0', name: 'mode1' }],
            defaultModeId: '1:0',
            remote: true,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'spacing/1',
            key: 'variable_key',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'FLOAT',
            valuesByMode: {
              '1:0': 8,
            },
            remote: true,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    const tokenFiles = tokenFilesFromLocalVariables(localVariablesResponse)
    expect(tokenFiles).toEqual({})
  })

  it('reconstructs a Motion FLOAT back to a DTCG duration object (ms)', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:9:1': {
            id: 'VariableCollectionId:9:1',
            name: 'Motion',
            modes: [{ modeId: '9:0', name: 'base' }],
            defaultModeId: '9:0',
            remote: false,
            key: 'motionKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:9:1'],
          },
        },
        variables: {
          'VariableID:9:1': {
            id: 'VariableID:9:1',
            name: 'duration/fast',
            key: 'duration_fast',
            variableCollectionId: 'VariableCollectionId:9:1',
            resolvedType: 'FLOAT',
            valuesByMode: { '9:0': 150 },
            remote: false,
            description: 'Fast',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    const tokenFiles = tokenFilesFromLocalVariables(localVariablesResponse)
    // The Motion export rule reattaches the unit the unitless Figma FLOAT dropped.
    expect(tokenFiles['motion.base.json'].duration).toMatchObject({
      fast: { $type: 'duration', $value: { value: 150, unit: 'ms' } },
    })
  })

  it('ignores deleted-but-referenced variables', () => {
    // Variables deleted in Figma linger in the API while a layer/style still references
    // them (deletedButReferenced: true). Exporting them would resurrect deleted variables
    // in staging — and the next import push would re-create them in Figma. Modelled on
    // the real case: a stray 'Font family' string variable deleted from the colour
    // collection but still bound somewhere in the file.
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: 'primitives',
            modes: [{ modeId: '1:0', name: 'mode1' }],
            defaultModeId: '1:0',
            remote: false,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1', 'VariableID:2:2'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'spacing/1',
            key: 'variable_key',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'FLOAT',
            valuesByMode: {
              '1:0': 8,
            },
            remote: false,
            description: '8px spacing',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:2:2': {
            id: 'VariableID:2:2',
            name: 'Font family',
            key: 'variable_key2',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'STRING',
            valuesByMode: {
              '1:0': 'Public Sans',
            },
            remote: false,
            deletedButReferenced: true,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    const tokenFiles = tokenFilesFromLocalVariables(localVariablesResponse)
    expect(tokenFiles).toEqual({
      'primitives.mode1.json': {
        spacing: {
          '1': {
            $type: 'number',
            $value: 8,
            $description: '8px spacing',
            $extensions: {
              'com.figma': {
                hiddenFromPublishing: false,
                scopes: ['ALL_SCOPES'],
                codeSyntax: {},
              },
            },
          },
        },
      },
    })
  })

  it('returns token files', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: 'primitives',
            modes: [
              { modeId: '1:0', name: 'mode1' },
              { modeId: '1:1', name: 'mode2' },
            ],
            defaultModeId: '1:0',
            remote: false,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1', 'VariableID:2:2', 'VariableID:2:3', 'VariableID:2:4'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'spacing/1',
            key: 'variable_key',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'FLOAT',
            valuesByMode: {
              '1:0': 8,
              '1:1': 8,
            },
            remote: false,
            description: '8px spacing',
            hiddenFromPublishing: true,
            scopes: ['TEXT_CONTENT'],
            codeSyntax: { WEB: 'web', ANDROID: 'android' },
          },
          'VariableID:2:2': {
            id: 'VariableID:2:2',
            name: 'spacing/2',
            key: 'variable_key2',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'FLOAT',
            valuesByMode: {
              '1:0': 16,
              '1:1': 16,
            },
            remote: false,
            description: '16px spacing',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:2:3': {
            id: 'VariableID:2:3',
            name: 'color/brand/radish',
            key: 'variable_key3',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 1, g: 0.7450980392156863, b: 0.08627450980392157, a: 1 },
              '1:1': { r: 1, g: 0.796078431372549, b: 0.7176470588235294, a: 1 },
            },
            remote: false,
            description: 'Radish color',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:2:4': {
            id: 'VariableID:2:4',
            name: 'color/brand/pear',
            key: 'variable_key4',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 1, g: 0, b: 0.08627450980392157, a: 1 },
              '1:1': { r: 0.8705882352941177, g: 0.9529411764705882, b: 0.34509803921568627, a: 1 },
            },
            remote: false,
            description: 'Pear color',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    const tokenFiles = tokenFilesFromLocalVariables(localVariablesResponse)

    expect(tokenFiles['primitives.mode1.json']).toEqual({
      spacing: {
        '1': {
          $type: 'number',
          $value: 8,
          $description: '8px spacing',
          $extensions: {
            'com.figma': {
              hiddenFromPublishing: true,
              scopes: ['TEXT_CONTENT'],
              codeSyntax: { WEB: 'web', ANDROID: 'android' },
            },
          },
        },
        '2': {
          $type: 'number',
          $value: 16,
          $description: '16px spacing',
          $extensions: {
            'com.figma': {
              hiddenFromPublishing: false,
              scopes: ['ALL_SCOPES'],
              codeSyntax: {},
            },
          },
        },
      },
      color: {
        brand: {
          radish: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [1, 0.7450980392156863, 0.08627450980392157],
              alpha: 1,
              hex: '#ffbe16',
            },
            $description: 'Radish color',
            $extensions: {
              'com.figma': {
                hiddenFromPublishing: false,
                scopes: ['ALL_SCOPES'],
                codeSyntax: {},
              },
            },
          },
          pear: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [1, 0, 0.08627450980392157],
              alpha: 1,
              hex: '#ff0016',
            },
            $description: 'Pear color',
            $extensions: {
              'com.figma': {
                hiddenFromPublishing: false,
                scopes: ['ALL_SCOPES'],
                codeSyntax: {},
              },
            },
          },
        },
      },
    })

    expect(tokenFiles['primitives.mode2.json']).toEqual({
      spacing: {
        '1': {
          $type: 'number',
          $value: 8,
          $description: '8px spacing',
          $extensions: {
            'com.figma': {
              hiddenFromPublishing: true,
              scopes: ['TEXT_CONTENT'],
              codeSyntax: { WEB: 'web', ANDROID: 'android' },
            },
          },
        },
        '2': {
          $type: 'number',
          $value: 16,
          $description: '16px spacing',
          $extensions: {
            'com.figma': {
              hiddenFromPublishing: false,
              scopes: ['ALL_SCOPES'],
              codeSyntax: {},
            },
          },
        },
      },
      color: {
        brand: {
          radish: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [1, 0.796078431372549, 0.7176470588235294],
              alpha: 1,
              hex: '#ffcbb7',
            },
            $description: 'Radish color',
            $extensions: {
              'com.figma': {
                hiddenFromPublishing: false,
                scopes: ['ALL_SCOPES'],
                codeSyntax: {},
              },
            },
          },
          pear: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [0.8705882352941177, 0.9529411764705882, 0.34509803921568627],
              alpha: 1,
              hex: '#def358',
            },
            $description: 'Pear color',
            $extensions: {
              'com.figma': {
                hiddenFromPublishing: false,
                scopes: ['ALL_SCOPES'],
                codeSyntax: {},
              },
            },
          },
        },
      },
    })
  })

  it('handles aliases', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: 'collection1',
            modes: [
              { modeId: '1:0', name: 'mode1' },
              { modeId: '1:1', name: 'mode2' },
            ],
            defaultModeId: '1:0',
            remote: false,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1', 'VariableID:2:2'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'var1',
            key: 'variable_key1',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'FLOAT',
            valuesByMode: {
              '1:0': 1,
            },
            remote: false,
            description: 'var1 description',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:2:2': {
            id: 'VariableID:2:2',
            name: 'var2',
            key: 'variable_key2',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'FLOAT',
            valuesByMode: {
              '1:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:2:1' },
            },
            remote: false,
            description: 'var2 description',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    const tokenFiles = tokenFilesFromLocalVariables(localVariablesResponse)

    expect(tokenFiles['collection1.mode1.json']).toEqual({
      var1: {
        $type: 'number',
        $value: 1,
        $description: 'var1 description',
        $extensions: {
          'com.figma': {
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
      var2: {
        $type: 'number',
        $value: '{var1}',
        $description: 'var2 description',
        $extensions: {
          'com.figma': {
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    })
  })

  it('throws when a token path would overwrite an existing token', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: 'primitives',
            modes: [{ modeId: '1:0', name: 'mode1' }],
            defaultModeId: '1:0',
            remote: false,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1', 'VariableID:2:2'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'color',
            key: 'variable_key',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 1, g: 0, b: 0, a: 1 },
            },
            remote: false,
            description: 'Base color token',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:2:2': {
            id: 'VariableID:2:2',
            name: 'color/brand',
            key: 'variable_key2',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 0, g: 1, b: 0, a: 1 },
            },
            remote: false,
            description: 'Nested color token',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    expect(() => tokenFilesFromLocalVariables(localVariablesResponse)).toThrowError(
      'Token name collision in primitives.mode1.json: "color" is already defined as a token',
    )
  })

  it('throws when a token path would overwrite an existing token group', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: 'primitives',
            modes: [{ modeId: '1:0', name: 'mode1' }],
            defaultModeId: '1:0',
            remote: false,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1', 'VariableID:2:2'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'color/brand',
            key: 'variable_key',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 0, g: 1, b: 0, a: 1 },
            },
            remote: false,
            description: 'Nested color token',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:2:2': {
            id: 'VariableID:2:2',
            name: 'color',
            key: 'variable_key2',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 1, g: 0, b: 0, a: 1 },
            },
            remote: false,
            description: 'Base color token',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    expect(() => tokenFilesFromLocalVariables(localVariablesResponse)).toThrowError(
      'Token name collision in primitives.mode1.json: "color" conflicts with an existing token group',
    )
  })

  it('rejects unsafe token path segments from Figma', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: 'primitives',
            modes: [{ modeId: '1:0', name: 'mode1' }],
            defaultModeId: '1:0',
            remote: false,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'color/__proto__',
            key: 'variable_key',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 1, g: 0, b: 0, a: 1 },
            },
            remote: false,
            description: 'Unsafe token path',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    expect(() => tokenFilesFromLocalVariables(localVariablesResponse)).toThrowError(
      'Invalid token path segment in "color/__proto__": "__proto__"',
    )
  })

  it('rejects unsafe collection names from Figma', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:1:1': {
            id: 'VariableCollectionId:1:1',
            name: '../primitives',
            modes: [{ modeId: '1:0', name: 'mode1' }],
            defaultModeId: '1:0',
            remote: false,
            key: 'variableKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:2:1'],
          },
        },
        variables: {
          'VariableID:2:1': {
            id: 'VariableID:2:1',
            name: 'color/brand',
            key: 'variable_key',
            variableCollectionId: 'VariableCollectionId:1:1',
            resolvedType: 'COLOR',
            valuesByMode: {
              '1:0': { r: 1, g: 0, b: 0, a: 1 },
            },
            remote: false,
            description: 'Nested color token',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    expect(() => tokenFilesFromLocalVariables(localVariablesResponse)).toThrowError(
      'Invalid collection name: "../primitives"',
    )
  })

  it('reconstructs manifest-mapped collections into their staging shapes', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:9:1': {
            id: 'VariableCollectionId:9:1',
            name: 'Space',
            modes: [{ modeId: '9:0', name: 'base' }],
            defaultModeId: '9:0',
            remote: false,
            key: 'spaceKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:9:1'],
          },
          'VariableCollectionId:9:2': {
            id: 'VariableCollectionId:9:2',
            name: 'Typography',
            modes: [{ modeId: '9:2', name: 'base' }],
            defaultModeId: '9:2',
            remote: false,
            key: 'typographyKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:9:2', 'VariableID:9:3'],
          },
          'VariableCollectionId:9:3': {
            id: 'VariableCollectionId:9:3',
            name: 'Radius',
            modes: [{ modeId: '9:4', name: 'base' }],
            defaultModeId: '9:4',
            remote: false,
            key: 'radiusKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:9:4'],
          },
        },
        variables: {
          'VariableID:9:1': {
            id: 'VariableID:9:1',
            name: 'space/4',
            key: 'space4',
            variableCollectionId: 'VariableCollectionId:9:1',
            resolvedType: 'FLOAT',
            valuesByMode: { '9:0': 16 },
            remote: false,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:9:2': {
            id: 'VariableID:9:2',
            name: 'font-family/sans',
            key: 'ffsans',
            variableCollectionId: 'VariableCollectionId:9:2',
            resolvedType: 'STRING',
            valuesByMode: { '9:2': 'Public Sans, system-ui, sans-serif' },
            remote: false,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:9:3': {
            id: 'VariableID:9:3',
            name: 'font-weight/bold',
            key: 'fwbold',
            variableCollectionId: 'VariableCollectionId:9:2',
            resolvedType: 'FLOAT',
            valuesByMode: { '9:2': 700 },
            remote: false,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:9:4': {
            id: 'VariableID:9:4',
            name: 'radius/md',
            key: 'radiusmd',
            variableCollectionId: 'VariableCollectionId:9:3',
            resolvedType: 'FLOAT',
            valuesByMode: { '9:4': 8 },
            remote: false,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    const tokenFiles = tokenFilesFromLocalVariables(localVariablesResponse)

    // Kebab-case staging file names via the reverse manifest, not "Space.base.json"
    expect(Object.keys(tokenFiles).sort()).toEqual([
      'radius.base.json',
      'space.base.json',
      'typography.base.json',
    ])

    const space = tokenFiles['space.base.json'] as Record<string, Record<string, unknown>>
    expect(space.space['4']).toMatchObject({
      $type: 'dimension',
      $value: { value: 1, unit: 'rem' }, // 16px -> 1rem at the 16px root
    })

    const radius = tokenFiles['radius.base.json'] as Record<string, Record<string, unknown>>
    expect(radius.radius.md).toMatchObject({
      $type: 'dimension',
      $value: { value: 8, unit: 'px' },
    })

    const typography = tokenFiles['typography.base.json'] as Record<string, Record<string, unknown>>
    expect(typography['font-family'].sans).toMatchObject({
      $type: 'fontFamily',
      $value: ['Public Sans', 'system-ui', 'sans-serif'],
    })
    expect(typography['font-weight'].bold).toMatchObject({
      $type: 'fontWeight',
      $value: 700,
    })
  })

  it('snaps float32-echoed FLOATs to 7 decimal places', () => {
    const localVariablesResponse: GetLocalVariablesResponse = {
      status: 200,
      error: false,
      meta: {
        variableCollections: {
          'VariableCollectionId:8:1': {
            id: 'VariableCollectionId:8:1',
            name: 'Typography',
            modes: [{ modeId: '8:0', name: 'base' }],
            defaultModeId: '8:0',
            remote: false,
            key: 'typographyKey',
            hiddenFromPublishing: false,
            variableIds: ['VariableID:8:1', 'VariableID:8:2'],
          },
        },
        variables: {
          'VariableID:8:1': {
            id: 'VariableID:8:1',
            name: 'line-height/snug',
            key: 'lhsnug',
            variableCollectionId: 'VariableCollectionId:8:1',
            resolvedType: 'FLOAT',
            valuesByMode: { '8:0': 1.3333332538604736 }, // Figma's float32 echo of 1.3333333
            remote: false,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
          'VariableID:8:2': {
            id: 'VariableID:8:2',
            name: 'letter-spacing/wide',
            key: 'lswide',
            variableCollectionId: 'VariableCollectionId:8:1',
            resolvedType: 'FLOAT',
            valuesByMode: { '8:0': 0.02500000037252903 }, // float32 echo of 0.025
            remote: false,
            description: '',
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES'],
            codeSyntax: {},
          },
        },
      },
    }

    const tokenFiles = tokenFilesFromLocalVariables(localVariablesResponse)
    const typography = tokenFiles['typography.base.json'] as Record<string, Record<string, unknown>>
    expect(typography['line-height'].snug).toMatchObject({ $value: 1.3333333 })
    expect(typography['letter-spacing'].wide).toMatchObject({ $value: 0.025 })
  })
})
