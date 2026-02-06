import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const userId = authHeader.replace("Bearer ", "").trim();
    if (!userId) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const result = await query<{ id: string; email: string; name: string; created_at: Date }>(
      "SELECT id, email, name, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const user = result.rows[0];
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
