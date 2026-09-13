import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function getDatabaseStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { connected: false, count: 0, message: "Supabase environment variables are missing." };
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.from("retailers").select("id");

  if (error) {
    return { connected: false, count: 0, message: error.message };
  }

  return { connected: true, count: data.length, message: "Database connected" };
}

export default async function Home() {
  const db = await getDatabaseStatus();

  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">Smart Basket</p>
        <h1>Production app foundation is ready.</h1>
        <p>
          This is the clean application shell. Shopping-list functionality starts only after Step 5 is approved.
        </p>
        <p>
          <strong>{db.connected ? "✅ Database connected" : "⚠️ Database not connected"}</strong>
          <br />
          {db.connected ? `${db.count} retailers available in Supabase.` : db.message}
        </p>
      </section>
    </main>
  );
}
