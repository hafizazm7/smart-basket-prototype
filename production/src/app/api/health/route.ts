import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        status: "error",
        database: "not_configured",
        message: "Supabase environment variables are missing.",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("retailers")
    .select("key,name")
    .order("name");

  if (error) {
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        message: error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: "ok",
    database: "connected",
    retailerCount: data.length,
    retailers: data,
  });
}
