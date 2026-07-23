"use server"

import { prisma } from "@/lib/prisma"

export async function getAuditLogs() {
  return await prisma.auditLog.findMany({
    include: {
      user: { select: { name: true } },
    },
    orderBy: { timestamp: "desc" },
    take: 500,
  })
}
