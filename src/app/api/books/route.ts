import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import type { BookStatus, BookVisibility, SourceType } from "@/types";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as BookStatus | null;
  const visibility = searchParams.get("visibility") as BookVisibility | null;

  const supabase = await createClient();
  let query = supabase
    .from("books")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (visibility) query = query.eq("visibility", visibility);

  const { data, error } = await query;
  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  return apiSuccess(data);
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  let body: {
    title?: string;
    description?: string;
    language?: string;
    source_type?: SourceType;
    price?: number;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const { title, description, language, source_type, price } = body;
  if (!title || typeof title !== "string" || title.trim() === "") {
    return apiError("title is required", "VALIDATION_ERROR", 400);
  }
  if (!source_type || !["text", "markdown", "docx"].includes(source_type)) {
    return apiError(
      "source_type must be one of: text, markdown, docx",
      "VALIDATION_ERROR",
      400,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .insert({
      owner_id: user.id,
      title: title.trim(),
      description: description ?? null,
      language: language ?? "ko",
      source_type,
      status: "draft",
      visibility: "private",
      price: typeof price === "number" && price >= 0 ? price : 0,
    })
    .select()
    .single();

  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  return apiSuccess(data, 201);
}
