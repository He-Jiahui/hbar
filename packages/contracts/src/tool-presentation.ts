import { z } from 'zod'

/** One top-level argument key, never an expression, object path or prototype lookup. */
export const toolPresentationFieldSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine((value) => !['__proto__', 'prototype', 'constructor'].includes(value))

const fileRead = z.strictObject({ kind: z.literal('file-read'), pathField: toolPresentationFieldSchema })
const fileWrite = z.strictObject({ kind: z.literal('file-write'), pathField: toolPresentationFieldSchema })
const fileEdit = z.strictObject({ kind: z.literal('file-edit'), pathField: toolPresentationFieldSchema })
const directoryList = z.strictObject({ kind: z.literal('directory-list'), pathField: toolPresentationFieldSchema })
const command = z.strictObject({
  kind: z.literal('command'),
  commandField: toolPresentationFieldSchema,
  descriptionField: toolPresentationFieldSchema.optional(),
})
const textSearch = z.strictObject({
  kind: z.literal('text-search'),
  patternField: toolPresentationFieldSchema,
  pathField: toolPresentationFieldSchema.optional(),
})
const fileSearch = z.strictObject({
  kind: z.literal('file-search'),
  queryField: toolPresentationFieldSchema.optional(),
  includeField: toolPresentationFieldSchema.optional(),
  pathField: toolPresentationFieldSchema.optional(),
})
const hasFileSearchInput = (value: {
  kind: string
  queryField?: string | undefined
  includeField?: string | undefined
}) => value.kind !== 'file-search' || value.queryField !== undefined || value.includeField !== undefined

/** Tool-authored requested-input semantics, not an authorization or effect guarantee. */
export const toolPresentationDeclarationSchema = z
  .discriminatedUnion('kind', [fileRead, fileWrite, fileEdit, directoryList, command, textSearch, fileSearch])
  .refine(hasFileSearchInput, { message: 'File search presentation requires a query or include field' })

const version = { version: z.literal(1) }
/** Host-captured declaration. Locale text and extracted argument values are deliberately absent. */
export const toolCallPresentationSchema = z
  .discriminatedUnion('kind', [
    fileRead.extend(version),
    fileWrite.extend(version),
    fileEdit.extend(version),
    directoryList.extend(version),
    command.extend(version),
    textSearch.extend(version),
    fileSearch.extend(version),
  ])
  .refine(hasFileSearchInput, { message: 'File search presentation requires a query or include field' })

export type ToolPresentationDeclaration = z.output<typeof toolPresentationDeclarationSchema>
export type ToolCallPresentation = z.output<typeof toolCallPresentationSchema>
