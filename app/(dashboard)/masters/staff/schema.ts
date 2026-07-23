import { z } from "zod"

export const staffSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  department: z.string().optional(),
  employeeCode: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean(),
})

export type StaffFormValues = z.infer<typeof staffSchema>
