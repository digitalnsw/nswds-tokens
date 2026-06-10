import * as fs from 'fs'
import * as path from 'path'

import { colorApproximatelyEqual, dtcgToRgb, isDtcgColor, parseColor } from './color.js'
import { FIGMA_COLLECTIONS } from './figma-collections.js'
import { areSetsEqual, assertSafeObjectKey, assertSafePathSegment } from './utils.js'
import { DtcgDimension, Token, TokenOrTokenGroup, TokensFile } from './token_types.js'
import {
  GetLocalVariablesResponse,
  LocalVariable,
  LocalVariableCollection,
  PostVariablesRequestBody,
  VariableCodeSyntax,
  VariableCreate,
  VariableUpdate,
  VariableValue,
} from '@figma/rest-api-spec'

export type FlattenedTokensByFile = {
  [fileName: string]: {
    [tokenName: string]: Token
  }
}

export function readJsonFiles(files: string[]) {
  const tokensJsonByFile: FlattenedTokensByFile = {}

  const seenCollectionsAndModes = new Set<string>()

  files.forEach((file) => {
    if (path.basename(file) === '.DS_Store') {
      return
    }
    const baseFileName = assertSafePathSegment(path.basename(file), 'token file name')
    const { collectionName, modeName } = collectionAndModeFromFileName(baseFileName)

    if (seenCollectionsAndModes.has(`${collectionName}.${modeName}`)) {
      throw new Error(`Duplicate collection and mode in file: ${file}`)
    }

    seenCollectionsAndModes.add(`${collectionName}.${modeName}`)

    const fileContent = fs.readFileSync(file, { encoding: 'utf-8' })

    if (!fileContent) {
      throw new Error(`Invalid tokens file: ${file}. File is empty.`)
    }
    const tokensFile: TokensFile = JSON.parse(fileContent)

    tokensJsonByFile[baseFileName] = flattenTokensFile(tokensFile)
  })

  return tokensJsonByFile
}

function flattenTokensFile(tokensFile: TokensFile) {
  const flattenedTokens: { [tokenName: string]: Token } = {}

  Object.entries(tokensFile).forEach(([tokenGroup, groupValues]) => {
    assertSafeObjectKey(tokenGroup, 'token group name')
    traverseCollection({ key: tokenGroup, object: groupValues, tokens: flattenedTokens })
  })

  return flattenedTokens
}

function traverseCollection({
  key,
  object,
  tokens,
}: {
  key: string
  object: TokenOrTokenGroup
  tokens: { [tokenName: string]: Token }
}) {
  // if key is a meta field, move on
  if (key.charAt(0) === '$') {
    return
  }

  assertSafeObjectKey(key, 'token name')

  if (object.$value !== undefined) {
    tokens[key] = object
  } else {
    Object.entries<TokenOrTokenGroup>(object).forEach(([key2, object2]) => {
      if (key2.charAt(0) !== '$' && typeof object2 === 'object') {
        assertSafeObjectKey(key2, 'token name')
        traverseCollection({
          key: `${key}/${key2}`,
          object: object2,
          tokens,
        })
      }
    })
  }
}

export function collectionAndModeFromFileName(fileName: string) {
  // Prefer the explicit manifest (decouples kebab-case file names from Figma collection
  // names that contain spaces / em-dashes). Fall back to the legacy convention of
  // deriving {collectionName}.{modeName} from the file name itself.
  const mapped = FIGMA_COLLECTIONS[fileName]
  if (mapped) {
    return mapped
  }

  const fileNameParts = fileName.split('.')
  if (fileNameParts.length < 3) {
    throw new Error(
      `Invalid tokens file name: ${fileName}. File names must be in the format: {collectionName}.{modeName}.json`,
    )
  }
  const [collectionName, modeName] = fileNameParts
  return { collectionName, modeName }
}

function variableResolvedTypeFromToken(token: Token) {
  switch (token.$type) {
    case 'color':
      return 'COLOR'
    case 'number':
    case 'dimension': // Figma variables have no unit concept — dimensions sync as FLOAT px
      return 'FLOAT'
    case 'string':
      return 'STRING'
    case 'boolean':
      return 'BOOLEAN'
    default:
      throw new Error(`Invalid token $type: ${token.$type}`)
  }
}

// Narrow an unknown $value to a DTCG dimension object ({ value, unit }).
function isDtcgDimension(value: unknown): value is DtcgDimension {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.value === 'number' && (v.unit === 'px' || v.unit === 'rem')
}

// Figma variables are unitless floats; the px convention is what Figma's own UI uses for
// spacing/radius. rem values convert at the 16px default root font size. The reverse
// (FLOAT -> dimension on export) is collection-aware and lands with milestone 4e.
const REM_PX = 16
function figmaFloatFromDimension(d: DtcgDimension): number {
  return d.unit === 'rem' ? d.value * REM_PX : d.value
}

function isAlias(value: string) {
  return value.toString().trim().charAt(0) === '{'
}

function variableValueFromToken(
  token: Token,
  localVariablesByCollectionAndName: Map<string, Map<string, LocalVariable>>,
): VariableValue {
  if (typeof token.$value === 'string' && isAlias(token.$value)) {
    // Assume aliases are in the format {group.subgroup.token} with any number of optional groups/subgroups
    // The Figma syntax for variable names is: group/subgroup/token
    const value = token.$value.trim().replace(/\./g, '/').replace(/[{}]/g, '')

    // When mapping aliases to existing local variables, we assume that variable names
    // are unique *across all collections* in the Figma file
    for (const localVariablesByName of localVariablesByCollectionAndName.values()) {
      const aliasedVariable = localVariablesByName.get(value)
      if (aliasedVariable) {
        return {
          type: 'VARIABLE_ALIAS',
          id: aliasedVariable.id,
        }
      }
    }

    // If we don't find a local variable matching the alias, we assume it's a variable
    // that we're going to create elsewhere in the payload.
    // If the file has an invalid alias, we rely on the Figma API to return a 400 error
    return {
      type: 'VARIABLE_ALIAS',
      id: value,
    }
  } else if (token.$type === 'color' && isDtcgColor(token.$value)) {
    return dtcgToRgb(token.$value)
  } else if (typeof token.$value === 'string' && token.$type === 'color') {
    return parseColor(token.$value) // back-compat: hex string colours
  } else if (token.$type === 'dimension' && isDtcgDimension(token.$value)) {
    return figmaFloatFromDimension(token.$value)
  } else {
    if (typeof token.$value === 'object') {
      // An object $value that reaches this branch must not be forwarded to Figma as-is —
      // fail loudly, with a message matching the token's $type: a colour object that
      // failed isDtcgColor (wrong colorSpace, malformed components) vs a non-colour
      // token that should only ever hold a primitive.
      throw new Error(
        token.$type === 'color'
          ? `Invalid color token $value (expected an srgb DTCG object, a hex string, or an alias): ${JSON.stringify(token.$value)}`
          : `Invalid ${token.$type} token $value (expected a primitive value, got an object): ${JSON.stringify(token.$value)}`,
      )
    }
    return token.$value
  }
}

function compareVariableValues(a: VariableValue, b: VariableValue) {
  if (typeof a === 'object' && typeof b === 'object') {
    if ('type' in a && 'type' in b && a.type === 'VARIABLE_ALIAS' && b.type === 'VARIABLE_ALIAS') {
      return a.id === b.id
    } else if ('r' in a && 'r' in b) {
      return colorApproximatelyEqual(a, b)
    }
  } else {
    return a === b
  }

  return false
}

function isCodeSyntaxEqual(a: VariableCodeSyntax, b: VariableCodeSyntax) {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(
      (key) => a[key as keyof VariableCodeSyntax] === b[key as keyof VariableCodeSyntax],
    )
  )
}

/**
 * Get writable token properties that are different from the variable.
 * If the variable does not exist, all writable properties are returned.
 *
 * This function is being used to decide what properties to include in the
 * POST variables call to update variables in Figma. If a token does not have
 * a particular property, we do not include it in the differences object to avoid
 * touching that property in Figma.
 */
function tokenAndVariableDifferences(token: Token, variable: LocalVariable | null) {
  const differences: Partial<
    Omit<
      VariableCreate | VariableUpdate,
      'id' | 'name' | 'variableCollectionId' | 'resolvedType' | 'action'
    >
  > = {}

  if (
    token.$description !== undefined &&
    (!variable || token.$description !== variable.description)
  ) {
    differences.description = token.$description
  }

  if (token.$extensions && token.$extensions['com.figma']) {
    const figmaExtensions = token.$extensions['com.figma']

    if (
      figmaExtensions.hiddenFromPublishing !== undefined &&
      (!variable || figmaExtensions.hiddenFromPublishing !== variable.hiddenFromPublishing)
    ) {
      differences.hiddenFromPublishing = figmaExtensions.hiddenFromPublishing
    }

    if (
      figmaExtensions.scopes &&
      (!variable || !areSetsEqual(new Set(figmaExtensions.scopes), new Set(variable.scopes)))
    ) {
      differences.scopes = figmaExtensions.scopes
    }

    if (
      figmaExtensions.codeSyntax &&
      (!variable || !isCodeSyntaxEqual(figmaExtensions.codeSyntax, variable.codeSyntax))
    ) {
      differences.codeSyntax = figmaExtensions.codeSyntax
    }
  }

  return differences
}

export function generatePostVariablesPayload(
  tokensByFile: FlattenedTokensByFile,
  localVariables: GetLocalVariablesResponse,
) {
  const localVariableCollectionsByName = new Map<string, LocalVariableCollection>()
  const localVariablesByCollectionAndName = new Map<string, Map<string, LocalVariable>>()

  Object.values(localVariables.meta.variableCollections).forEach((collection) => {
    if (localVariableCollectionsByName.has(collection.name)) {
      throw new Error(`Duplicate variable collection in file: ${collection.name}`)
    }

    localVariableCollectionsByName.set(collection.name, collection)
  })

  Object.values(localVariables.meta.variables).forEach((variable) => {
    let localVariablesByName = localVariablesByCollectionAndName.get(variable.variableCollectionId)
    if (!localVariablesByName) {
      localVariablesByName = new Map<string, LocalVariable>()
      localVariablesByCollectionAndName.set(variable.variableCollectionId, localVariablesByName)
    }

    localVariablesByName.set(variable.name, variable)
  })

  console.log('Local variable collections in Figma file:', [
    ...localVariableCollectionsByName.keys(),
  ])

  const postVariablesPayload: PostVariablesRequestBody = {
    variableCollections: [],
    variableModes: [],
    variables: [],
    variableModeValues: [],
  }

  Object.entries(tokensByFile).forEach(([fileName, tokens]) => {
    const { collectionName, modeName } = collectionAndModeFromFileName(fileName)

    const variableCollection = localVariableCollectionsByName.get(collectionName)
    // Use the actual variable collection id or use the name as the temporary id
    const variableCollectionId = variableCollection ? variableCollection.id : collectionName
    const variableMode = variableCollection?.modes.find((mode) => mode.name === modeName)
    // Use the actual mode id or create a unique temporary id by combining collection and mode names
    const modeId = variableMode ? variableMode.modeId : `${collectionName}:${modeName}`

    if (
      !variableCollection &&
      !postVariablesPayload.variableCollections!.find((c) => c.id === variableCollectionId)
    ) {
      postVariablesPayload.variableCollections!.push({
        action: 'CREATE',
        id: variableCollectionId,
        name: variableCollectionId,
        initialModeId: modeId, // Use the initial mode as the first mode
      })

      // Rename the initial mode, since we're using it as our first mode in the collection
      postVariablesPayload.variableModes!.push({
        action: 'UPDATE',
        id: modeId,
        name: modeName, // Use the actual mode name for display
        variableCollectionId,
      })
    }

    // Add a new mode if it doesn't exist in the Figma file
    // and it's not the initial mode in the collection
    if (
      !variableMode &&
      !postVariablesPayload.variableCollections!.find(
        (c) => c.id === variableCollectionId && 'initialModeId' in c && c.initialModeId === modeId,
      )
    ) {
      postVariablesPayload.variableModes!.push({
        action: 'CREATE',
        id: modeId,
        name: modeName, // Use the actual mode name for display
        variableCollectionId,
      })
    }

    const localVariablesByName =
      (variableCollection && localVariablesByCollectionAndName.get(variableCollection.id)) ||
      new Map<string, LocalVariable>()

    Object.entries(tokens).forEach(([tokenName, token]) => {
      const variable = localVariablesByName.get(tokenName)
      const variableId = variable ? variable.id : tokenName
      const variableInPayload = postVariablesPayload.variables!.find(
        (v) =>
          v.id === variableId &&
          'variableCollectionId' in v &&
          v.variableCollectionId === variableCollectionId,
      )
      const differences = tokenAndVariableDifferences(token, variable ?? null)

      // Add a new variable if it doesn't exist in the Figma file,
      // and we haven't added it already in another mode
      if (!variable && !variableInPayload) {
        postVariablesPayload.variables!.push({
          action: 'CREATE',
          id: variableId,
          name: tokenName,
          variableCollectionId,
          resolvedType: variableResolvedTypeFromToken(token),
          ...differences,
        })
      } else if (variable && Object.keys(differences).length > 0) {
        if (variable.remote) {
          throw new Error(
            `Cannot update remote variable "${variable.name}" in collection "${collectionName}"`,
          )
        }

        postVariablesPayload.variables!.push({
          action: 'UPDATE',
          id: variableId,
          ...differences,
        })
      }

      const existingVariableValue = variable && variableMode ? variable.valuesByMode[modeId] : null
      const newVariableValue = variableValueFromToken(token, localVariablesByCollectionAndName)

      // Only include the variable mode value in the payload if it's different from the existing value
      if (
        existingVariableValue === null ||
        !compareVariableValues(existingVariableValue, newVariableValue)
      ) {
        postVariablesPayload.variableModeValues!.push({
          variableId,
          modeId,
          value: newVariableValue,
        })
      }
    })
  })

  return postVariablesPayload
}
