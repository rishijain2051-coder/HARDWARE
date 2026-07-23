import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthUser } from "@/types";

/**
 * Get the currently authenticated user from the request.
 * Returns null if no valid session exists.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    });

    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: {
        id: user.role.id,
        name: user.role.name,
      },
      isActive: user.isActive,
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication. Returns 401 if unauthenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new AuthError(401, "Authentication required");
  }
  return user;
}

/**
 * Require a specific permission. Returns 403 if unauthorized.
 */
export async function requirePermission(
  module: string,
  action: string
): Promise<AuthUser> {
  const user = await requireAuth();

  const hasPermission = await prisma.rolePermission.findFirst({
    where: {
      roleId: user.role.id,
      permission: {
        module,
        action,
      },
    },
  });

  if (!hasPermission) {
    throw new AuthError(403, "Insufficient permissions");
  }

  return user;
}

/**
 * Custom error class for auth errors that can be caught in route handlers.
 */
export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

/**
 * Wraps a route handler with authentication and optional permission check.
 * Handles AuthError automatically.
 */
export function withAuth(
  handler: (user: AuthUser, request: Request) => Promise<Response>,
  permission?: { module: string; action: string }
) {
  return async (request: Request) => {
    try {
      const user = permission
        ? await requirePermission(permission.module, permission.action)
        : await requireAuth();
      return handler(user, request);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status }
        );
      }
      console.error("Auth middleware error:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
