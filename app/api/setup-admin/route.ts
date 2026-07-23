import { prisma } from "@/lib/prisma";
import { hashPassword } from "better-auth/crypto";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const email = "admin@hardware-erp.local";
    
    // Get the admin role ID
    const role = await prisma.role.findFirst({
      where: { name: "Admin" }
    });

    if (!role) {
      return NextResponse.json({ error: "Admin role not found. Run seed first." }, { status: 400 });
    }

    // Delete existing admin user if it exists to cleanly recreate
    await prisma.user.deleteMany({
      where: { email }
    });

    // Create user manually with correct schema
    const user = await prisma.user.create({
      data: {
        email,
        name: "System Admin",
        roleId: role.id,
        emailVerified: true,
        isActive: true,
      },
    });

    // Create credential account with properly hashed password
    const passwordHash = await hashPassword("AdminPassword123!");
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });

    return NextResponse.json({ success: true, email, message: "Admin created with password: AdminPassword123!" });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
