openapi.get("/api/connect-meta", async (c) => {
  // Optional: still require Supabase login (keeps your app gated)
  const auth = c.req.header("Authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!jwt) return c.text("Missing Authorization: Bearer <jwt>", 401);
  const SUPABASE_URL = c.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = c.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return c.text("Server misconfigured: missing Supabase env vars", 500);
  }
  // Verify token is valid (optional but recommended)
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!userRes.ok) {
    const txt = await userRes.text();
    return c.text(`Supabase auth failed: ${txt}`, 401);
  }
  // Redirect to Composio hosted connect link
  return c.redirect("https://connect.composio.dev/link/lk_quK2xB-Iy3Mm", 302);
});
