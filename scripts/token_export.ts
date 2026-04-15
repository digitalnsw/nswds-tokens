import { GetLocalVariablesResponse, LocalVariable } from '@figma/rest-api-spec'
import { rgbToHex } from './color.js'
import { Token, TokensFile } from './token_types.js'

type MutableTokenGroup = Record<string, unknown>

function isTokenLeaf(value: unknown): value is Token {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '$value' in value
}

function tokenTypeFromVariable(variable: LocalVariable) {
  switch (variable.resolvedType) {
    case 'BOOLEAN':
      return 'boolean'
    case 'COLOR':
      return 'color'
    case 'FLOAT':
      return 'number'
    case 'STRING':
      return 'string'
  }
}

function tokenValueFromVariable(
  variable: LocalVariable,
  modeId: string,
  localVariables: { [id: string]: LocalVariable },
) {
  const value = variable.valuesByMode[modeId]
  if (typeof value === 'object') {
    if ('type' in value && value.type === 'VARIABLE_ALIAS') {
      const aliasedVariable = localVariables[value.id]
      return `{${aliasedVariable.name.replace(/\//g, '.')}}`
    } else if ('r' in value) {
      return rgbToHex(value)
    }

    throw new Error(`Format of variable value is invalid: ${value}`)
  } else {
    return value
  }
}

export function tokenFilesFromLocalVariables(localVariablesResponse: GetLocalVariablesResponse) {
  const tokenFiles: { [fileName: string]: TokensFile } = {}
  const localVariableCollections = localVariablesResponse.meta.variableCollections
  const localVariables = localVariablesResponse.meta.variables

  Object.values(localVariables).forEach((variable) => {
    // Skip remote variables because we only want to generate tokens for local variables
    if (variable.remote) {
      return
    }

    const collection = localVariableCollections[variable.variableCollectionId]

    collection.modes.forEach((mode) => {
      const fileName = `${collection.name}.${mode.name}.json`

      if (!tokenFiles[fileName]) {
        tokenFiles[fileName] = {}
      }

      let obj: MutableTokenGroup = tokenFiles[fileName]
      const pathSegments = variable.name.split('/')

      pathSegments.forEach((groupName, index) => {
        const segmentPath = pathSegments.slice(0, index + 1).join('/')
        const next = obj[groupName]

        if (next === undefined) {
          obj[groupName] = {}
        } else if (typeof next !== 'object' || next === null || Array.isArray(next)) {
          throw new Error(
            `Token name collision in ${fileName}: "${segmentPath}" is already defined as a non-group value`,
          )
        } else if (isTokenLeaf(next)) {
          throw new Error(
            `Token name collision in ${fileName}: "${segmentPath}" is already defined as a token`,
          )
        }

        obj = obj[groupName] as MutableTokenGroup
      })

      if (Object.keys(obj).length > 0) {
        throw new Error(
          `Token name collision in ${fileName}: "${variable.name}" conflicts with an existing token group`,
        )
      }

      const token: Token = {
        $type: tokenTypeFromVariable(variable),
        $value: tokenValueFromVariable(variable, mode.modeId, localVariables),
        $description: variable.description,
        $extensions: {
          'com.figma': {
            hiddenFromPublishing: variable.hiddenFromPublishing,
            scopes: variable.scopes,
            codeSyntax: variable.codeSyntax,
          },
        },
      }

      Object.assign(obj, token)
    })
  })

  return tokenFiles
}
