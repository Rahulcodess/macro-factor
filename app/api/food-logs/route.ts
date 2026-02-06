import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { FoodLogEntry } from "@/lib/types";

function getUserId(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "").trim() || null;
}

export async function GET(req: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ logs: [] }, { status: 200 });
    }
    const userId = getUserId(req);
    if (!userId) {
      return NextResponse.json({ logs: [] }, { status: 200 });
    }

    const result = await query<{
      id: string;
      food_text: string;
      meal_type: string;
      estimated_calories: number;
      grams: number | null;
      confidence_range: string | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
      created_at: Date;
    }>(
      "SELECT id, food_text, meal_type, estimated_calories, grams, confidence_range, protein_g, carbs_g, fat_g, created_at FROM food_logs WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    const logs: FoodLogEntry[] = result.rows.map((row) => ({
      id: row.id,
      food_text: row.food_text,
      meal_type: row.meal_type,
      estimated_calories: row.estimated_calories,
      grams: row.grams ?? undefined,
      confidence_range: row.confidence_range ?? undefined,
      macros:
        row.protein_g != null || row.carbs_g != null || row.fat_g != null
          ? {
              protein_g: row.protein_g ?? 0,
              carbs_g: row.carbs_g ?? 0,
              fat_g: row.fat_g ?? 0,
            }
          : undefined,
      created_at: row.created_at.toISOString(),
    }));

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Get food logs error:", error);
    return NextResponse.json({ logs: [] }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { ok: false, error: "Database not configured" },
        { status: 500 }
      );
    }
    const userId = getUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { food_text, meal_type, estimated_calories, grams, confidence_range, macros } = body;

    if (!food_text || !meal_type || typeof estimated_calories !== "number") {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await query<{ id: string; created_at: Date }>(
      `INSERT INTO food_logs (user_id, food_text, meal_type, estimated_calories, grams, confidence_range, protein_g, carbs_g, fat_g)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        userId,
        food_text,
        meal_type,
        estimated_calories,
        grams ?? null,
        confidence_range ?? null,
        macros?.protein_g ?? null,
        macros?.carbs_g ?? null,
        macros?.fat_g ?? null,
      ]
    );

    const entry: FoodLogEntry = {
      id: result.rows[0].id,
      food_text,
      meal_type,
      estimated_calories,
      grams: grams ?? undefined,
      confidence_range: confidence_range ?? undefined,
      macros: macros ?? undefined,
      created_at: result.rows[0].created_at.toISOString(),
    };

    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    console.error("Create food log error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save food log" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    await query("DELETE FROM food_logs WHERE id = $1 AND user_id = $2", [id, userId]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete food log error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete food log" },
      { status: 500 }
    );
  }
}
