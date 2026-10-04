import { z } from 'zod';

// Our input contracts use this deliberately small subset of Zod 3.
// Runtime Zod parsing remains authoritative for cross-field refinements.
export function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodEffects) return jsonSchema(schema.innerType());
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional) return jsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodNullable) return { anyOf: [jsonSchema(schema.unwrap()), { type: 'null' }] };
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    return { type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, jsonSchema(v)])), required: Object.entries(shape).filter(([, v]) => !v.isOptional()).map(([k]) => k), additionalProperties: false };
  }
  if (schema instanceof z.ZodDiscriminatedUnion || schema instanceof z.ZodUnion) return { anyOf: schema.options.map((s: z.ZodTypeAny) => jsonSchema(s)) };
  if (schema instanceof z.ZodArray) return { type: 'array', items: jsonSchema(schema.element), ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { type: typeof schema.value, const: schema.value };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
      if (check.kind === 'regex') result.pattern = check.regex.source;
    }
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: schema.isInt ? 'integer' : 'number' };
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
      if (check.kind === 'max') result[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
      if (check.kind === 'multipleOf') result.multipleOf = check.value;
    }
    return result;
  }
  throw new Error('Unsupported contract schema');
}
