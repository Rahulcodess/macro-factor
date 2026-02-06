import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { ok: false, error: "Database not configured. Please set DATABASE_URL." },
        { status: 500 }
      );
    }
    const { email, password } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
    }

    if (!password || typeof password !== "string" || password.length < 4) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 4 characters." },
        { status: 400 }
      );
    }

    const e = email.trim().toLowerCase();
    const name = e.split("@")[0] || "User";

    // Check if user exists, if not create one
    let userResult = await query<{ id: string; email: string; name: string; created_at: Date }>(
      "SELECT id, email, name, created_at FROM users WHERE email = $1",
      [e]
    );

    let user;
    if (userResult.rows.length === 0) {
      // Create new user
      const insertResult = await query<{ id: string; email: string; name: string; created_at: Date }>(
        "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at",
        [e, name]
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at.toISOString(),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
