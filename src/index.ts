import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { tasksRouter } from "./endpoints/tasks/router";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { DummyEndpoint } from "./endpoints/dummyEndpoint";
// Start a Hono app
const app = new Hono<{ Bindings: Env }>();
app.onError((err, c) => {
	if (err instanceof ApiException) {
		return c.json(
			{ success: false, errors: err.buildResponse() },
			err.status as ContentfulStatusCode,
		);
	}
	console.error("Global error handler caught:", err);
	return c.json(
		{
			success: false,
			errors: [{ code: 7000, message: "Internal Server Error" }],
		},
		500,
	);
});
// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
	schema: {
		info: {
			title: "MCP Benelux API",
			version: "1.0.0",
			description: "API for MCP Benelux client onboarding + integrations.",
		},
	},
});
// ---- NEW: health endpoint (easy routing test) ----
openapi.get("/api/health", (c) => {
	return c.json({ ok: true, service: "mcpbenelux-api" }, 200);
});
// ---- NEW: Connect Meta Ads (Composio OAuth) ----
openapi.get("/api/connect-meta", async (c) => {
	const auth = c.req.header("Authorization") || "";
	const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
	if (!jwt) return c.text("Missing Authorization: Bearer <jwt>", 401);
	const SUPABASE_URL = c.env.SUPABASE_URL;
	const SUPABASE_SERVICE_ROLE_KEY = c.env.SUPABASE_SERVICE_ROLE_KEY;
	const COMPOSIO_API_KEY = c.env.COMPOSIO_API_KEY;
	const AUTH_CONFIG_ID = c.env.COMPOSIO_METAADS_AUTH_CONFIG_ID;
	const missing = [
  ["SUPABASE_URL", !!SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", !!SUPABASE_SERVICE_ROLE_KEY],
  ["COMPOSIO_API_KEY", !!COMPOSIO_API_KEY],
  ["COMPOSIO_METAADS_AUTH_CONFIG_ID", !!AUTH_CONFIG_ID],
].filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) {
  return c.text("Missing env vars: " + missing.join(", "), 500);
}
	// 1) Verify user via Supabase
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
	const user = (await userRes.json()) as { id: string };
	const entityId = user.id;
	// 2) Create a Composio connect URL for this entityId
	// NOTE: If this endpoint differs in your Composio deployment, we’ll adjust after first test.
	const composioRes = await fetch("https://backend.composio.dev/api/v1/auth-apps/connect", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${COMPOSIO_API_KEY}`,
		},
		body: JSON.stringify({
			auth_config_id: AUTH_CONFIG_ID,
			entity_id: entityId,
		}),
	});
	const raw = await composioRes.text();
	if (!composioRes.ok) {
		return c.text(`Composio connect link error: ${raw}`, 500);
	}
	let parsed: any = null;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// ignore
	}
	const redirectUrl =
		parsed?.redirect_url ||
		parsed?.data?.redirect_url ||
		parsed?.url ||
		parsed?.data?.url;
	if (!redirectUrl) {
		return c.text(`Composio response missing redirect_url. Raw: ${raw}`, 500);
	}
	return c.redirect(redirectUrl, 302);
});
// Register Tasks Sub router
openapi.route("/tasks", tasksRouter);
// Register other endpoints
openapi.post("/dummy/:slug", DummyEndpoint);
// Export the Hono app
export default app;
