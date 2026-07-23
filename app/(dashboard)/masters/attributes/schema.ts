import { z } from "zod"

export const attributeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  type: z.enum(["TEXT", "NUMBER", "DROPDOWN", "BOOLEAN"]),
  isRequired: z.boolean(),
  isSearchable: z.boolean(),
  options: z.array(z.string()),
})

export type AttributeFormValues = z.infer<typeof attributeSchema>
