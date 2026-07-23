import { z } from "zod"

export const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal('')),
  gst: z.string().optional(),
  address: z.string().optional(),
  isActive: z.boolean(),
})

export type SupplierFormValues = z.infer<typeof supplierSchema>
