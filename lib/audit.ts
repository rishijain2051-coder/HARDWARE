import { prisma } from "@/lib/prisma";
import { AuditAction, Prisma } from "@prisma/client";

interface CreateAuditLogParams {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
}

/**
 * Create an audit log entry for any tracked action.
 * Used by all CRUD operations and authentication events.
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        changes: params.changes ? (params.changes as Prisma.InputJsonValue) : undefined,
        reason: params.reason,
        ipAddress: params.ipAddress,
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error("Failed to create audit log:", error);
  }
}

/**
 * Create audit log entries for bulk operations (e.g., imports)
 */
export async function createBulkAuditLog(
  userId: string,
  action: AuditAction,
  entity: string,
  entityIds: string[],
  reason?: string,
  ipAddress?: string
): Promise<void> {
  try {
    await prisma.auditLog.createMany({
      data: entityIds.map((entityId) => ({
        userId,
        action,
        entity,
        entityId,
        reason,
        ipAddress,
      })),
    });
  } catch (error) {
    console.error("Failed to create bulk audit logs:", error);
  }
}
