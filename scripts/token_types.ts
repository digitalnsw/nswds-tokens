/**
 * This file defines what design tokens and design token files look like in the codebase.
 *
 * Tokens are distinct from variables, in that a [token](https://tr.designtokens.org/format/#design-token)
 * is a name/value pair (with other properties), while a variable in Figma stores multiple values,
 * one for each mode.
 */

import { VariableCodeSyntax, VariableScope } from '@figma/rest-api-spec'
import { DtcgColor } from './color.js'

// DTCG 2025.10 dimension object (Phase 4 categories: space/radius/breakpoints).
export type DtcgDimension = {
  value: number
  unit: 'px' | 'rem'
}

// DTCG 2025.10 duration object (motion category). Syncs to Figma as a unitless FLOAT.
export type DtcgDuration = {
  value: number
  unit: 'ms' | 's'
}

export interface Token {
  /**
   * The [type](https://tr.designtokens.org/format/#type-0) of the token.
   *
   * We allow `string` and `boolean` types in addition to the draft W3C spec's `color` and `number` types
   * to align with the resolved types for Figma variables.
   */
  $type:
    | 'color'
    | 'number'
    | 'string'
    | 'boolean'
    | 'dimension'
    | 'duration'
    | 'fontFamily'
    | 'fontWeight'
  /**
   * For `color` tokens written in the DTCG 2025.10 shape, `$value` is a {@link DtcgColor}
   * object (`{ colorSpace, components, alpha, hex }`); `dimension` tokens carry a
   * {@link DtcgDimension} (`{ value, unit }`); `fontFamily` tokens carry a string or a
   * fallback-stack array of strings. Aliases remain `{group.token}` strings;
   * `number`/`fontWeight`/`string`/`boolean` tokens keep their primitive values.
   */
  $value: string | number | boolean | string[] | DtcgColor | DtcgDimension | DtcgDuration
  $description?: string
  $extensions?: {
    /**
     * The `com.figma` namespace stores Figma-specific variable properties
     */
    'com.figma'?: {
      hiddenFromPublishing?: boolean
      scopes?: VariableScope[]
      codeSyntax?: VariableCodeSyntax
    }
  }
}

export type TokenGroup = {
  [tokenName: string]: TokenOrTokenGroup
} & { $type?: never; $value?: never }

export type TokenOrTokenGroup = Token | TokenGroup

/**
 * Defines what we expect a Design Tokens file to look like in the codebase.
 *
 * This format mostly adheres to the [draft W3C spec for Design Tokens](https://tr.designtokens.org/format/)
 * as of its most recent 24 July 2023 revision except for the $type property, for which
 * we allow `string` and `boolean` values in addition to the spec's `color` and `number` values.
 * We need to support `string` and `boolean` types to align with the resolved types for Figma variables.
 *
 * Additionally, we expect each tokens file to define tokens for a single variable collection and mode.
 * There currently isn't a way to represent modes or themes in the W3C community group design token specification.
 * Once the spec resolves how it wants to treat/handle modes, this code will be updated to reflect the new standard.
 *
 * Follow this discussion for updates: https://github.com/design-tokens/community-group/issues/210
 */
export type TokensFile = {
  [key: string]: TokenOrTokenGroup
}
