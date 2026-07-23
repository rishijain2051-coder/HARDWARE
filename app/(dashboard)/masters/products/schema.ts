import { z } from "zod"

export const productSchema = z.object({
  id: z.string().optional(),
  sku: z.string().optional(), // Auto-generated if empty
  previousSku: z.string().optional(),
  description: z.string().min(3, "Description must be at least 3 characters"),
  categoryId: z.string().min(1, "Category is required"),
  unitId: z.string().min(1, "Unit is required"),
  finish: z.string().optional(),
  size: z.string().optional(),
  minStock: z.coerce.number().min(0),
  openingStock: z.coerce.number().min(0),
  defaultBinId: z.string().optional(),
  isActive: z.boolean(),
  aliases: z.array(z.string()),
  attributes: z.array(
    z.object({
      attributeId: z.string(),
      value: z.string(),
    })
  ),
})

export type ProductFormValues = z.infer<typeof productSchema>
