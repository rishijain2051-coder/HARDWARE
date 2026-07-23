import { z } from "zod"

export const binSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  location: z.string().optional(),
  isActive: z.boolean(),
})

export type BinFormValues = z.infer<typeof binSchema>
