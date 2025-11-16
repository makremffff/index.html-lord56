export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "POST only" });
        }

        const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).json({ error: "Supabase ENV missing" });
        }

        const { action, user_id, ref_by, amount, points, link, target_users, binance_uid, ton } = req.body;

        const headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json"
        };

        // ROUTER
        switch (action) {

            // -------------------------------------------------------
            case "init_user":
                return proxy("users_data?user_id=eq." + user_id, "GET");

            // -------------------------------------------------------
            case "create_user":
                return proxy("users_data", "POST", {
                    user_id,
                    ref_by
                });

            // -------------------------------------------------------
            case "convert_points":
                return proxy("rpc/convert_points_single", "POST", {
                    user_id,
                    p: points
                });

            // -------------------------------------------------------
            case "task_join":
                return proxy("rpc/do_task_join", "POST", { user_id });

            // -------------------------------------------------------
            case "task_ads":
                return proxy("rpc/ads_reward_single", "POST", { user_id });

            // -------------------------------------------------------
            case "withdraw":
                return proxy("withdraw", "POST", {
                    user_id,
                    amount,
                    binance_uid
                });

            // -------------------------------------------------------
            case "ton_deposit":
                return proxy("rpc/ton_deposit_single", "POST", { user_id, ton });

            default:
                return res.status(400).json({ error: "Unknown action" });
        }

        // SUPABASE WRAPPER
        async function proxy(route, method, body = null) {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/${route}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : null
            });
            const data = await r.json();
            return res.status(r.status).json(data);
        }

    } catch (err) {
        console.log("API ERROR:", err);
        res.status(500).json({ error: err.message });
    }
}