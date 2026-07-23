import { z } from "zod"

export const unitSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  abbreviation: z.string().min(1, "Abbreviation required").max(10),
  isActive: z.boolean(),
})

export type UnitFormValues = z.infer<typeof unitSchema>
