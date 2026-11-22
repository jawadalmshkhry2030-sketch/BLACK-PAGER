const crypto = require("crypto");

module.exports = function setupAdmin(app, io, URL) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const PASSWORD = process.env.PAGER_ADMIN_PASSWORD;
  const online = new Map();

  function hash(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  function token() {
    return crypto.randomBytes(32).toString("hex");
  }

  function validId(id) {
    return /^[0-9a-f-]{36}$/i.test(id);
  }

  async function db(query, method = "GET", body = null, prefer = "return=representation") {
    if (!KEY) throw new Error("Missing admin key");

    const r = await fetch(URL.replace(/\/$/, "") + "/rest/v1/pager_admin_devices" + query, {
      method,
      headers: {
        apikey: KEY,
        ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}),
        "Content-Type": "application/json",
        Prefer: prefer
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(JSON.stringify(data));
    return data;
  }


  const LEGACY_INDEX_PASSWORD = process.env.PAGER_INDEX_LEGACY_PASSWORD || "";

  async function settingsDb(query, method = "GET", body = null, prefer = "return=representation") {
    if (!KEY) throw new Error("Missing admin key");

    const r = await fetch(
      URL.replace(/\/$/, "") + "/rest/v1/pager_settings" + query,
      {
        method,
        headers: {
          apikey: KEY,
          ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}),
          "Content-Type": "application/json",
          Prefer: prefer
        },
        body: body ? JSON.stringify(body) : undefined
      }
    );

    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(JSON.stringify(data));
    return data;
  }

  function makePasswordHash(password) {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(password, salt, 64);
    return "scrypt$" + salt.toString("hex") + "$" + derived.toString("hex");
  }

  function verifyPasswordHash(password, stored) {
    try {
      const [algorithm, saltHex, hashHex] = String(stored).split("$");
      if (algorithm !== "scrypt" || !/^[0-9a-f]{32}$/i.test(saltHex) ||
          !/^[0-9a-f]{128}$/i.test(hashHex)) return false;

      const expected = Buffer.from(hashHex, "hex");
      const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
      return crypto.timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  async function getIndexPasswordRecord() {
    const rows = await settingsDb(
      "?select=setting_value&setting_key=eq.index_password&limit=1"
    );
    return rows[0]?.setting_value || "";
  }

  async function checkIndexPassword(password) {
    const stored = await getIndexPasswordRecord();
    if (stored) return verifyPasswordHash(password, stored);
    return Boolean(LEGACY_INDEX_PASSWORD) && password === LEGACY_INDEX_PASSWORD;
  }

  async function auth(req) {
    const id = String(req.headers["x-device-id"] || "");
    const secret = String(req.headers["x-admin-token"] || "");

    if (!validId(id) || !/^[0-9a-f]{64}$/i.test(secret)) return null;

    const rows = await db(
      "?select=device_id,role&device_id=eq." + encodeURIComponent(id) +
      "&token_hash=eq." + hash(secret) + "&limit=1"
    );

    return rows[0] || null;
  }

  function devices(rows) {
    const roles = new Map(rows.map(x => [x.device_id, x.role]));
    const result = [];

    for (const [id, sockets] of online) {
      for (const info of sockets.values()) {
        result.push({
          deviceId: id,
          wave: info.wave,
          role: roles.get(id) || "member"
        });
      }
    }

    return result;
  }


  app.post("/api/index/verify", async (req, res) => {
    try {
      const password = String(req.body.password || "");
      if (!password || password.length > 128) {
        return res.status(400).json({ success: false, error: "كلمة المرور غير صحيحة" });
      }

      const valid = await checkIndexPassword(password);
      res.json({ success: valid });
    } catch (e) {
      console.error("Index password verification:", e.message);
      res.status(503).json({ success: false, error: "تعذر التحقق من كلمة المرور" });
    }
  });

  app.post("/api/admin/index-password", async (req, res) => {
    try {
      const user = await auth(req);
      if (!user || user.role !== "owner") {
        return res.status(403).json({ error: "المالك فقط يستطيع تغيير كلمة مرور الفهرس" });
      }

      const currentPassword = String(req.body.currentPassword || "");
      const newPassword = String(req.body.newPassword || "");

      if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" });
      }

      if (!(await checkIndexPassword(currentPassword))) {
        return res.status(403).json({ error: "كلمة المرور الحالية غير صحيحة" });
      }

      const passwordHash = makePasswordHash(newPassword);

      await settingsDb(
        "?on_conflict=setting_key",
        "POST",
        { setting_key: "index_password", setting_value: passwordHash },
        "resolution=merge-duplicates,return=minimal"
      );

      res.json({ success: true });
    } catch (e) {
      console.error("Change index password:", e.message);
      res.status(503).json({ error: "تعذر تغيير كلمة مرور الفهرس" });
    }
  });

  app.get("/api/admin/status", async (req, res) => {
    try {
      const owners = await db("?select=device_id&role=eq.owner&limit=1");
      const user = await auth(req);

      res.json({
        claimed: owners.length > 0,
        role: user?.role || null
      });
    } catch (e) {
      console.error("Admin status:", e.message);
      res.status(503).json({ error: "تعذر التحقق من الإدارة" });
    }
  });

  app.post("/api/admin/claim", async (req, res) => {
    try {
      const id = String(req.headers["x-device-id"] || "");

      if (!validId(id)) {
        return res.status(400).json({ error: "معرف الجهاز غير صالح" });
      }

      if (!PASSWORD || String(req.body.password || "") !== PASSWORD) {
        return res.status(403).json({ error: "كلمة المرور غير صحيحة" });
      }

      const owners = await db("?select=device_id&role=eq.owner&limit=1");

      if (owners.length) {
        return res.status(409).json({ error: "تم تعيين المالك مسبقاً" });
      }

      const secret = token();

      await db("", "POST", {
        device_id: id,
        role: "owner",
        token_hash: hash(secret)
      });

      res.json({ success: true, token: secret, role: "owner" });
    } catch (e) {
      console.error("Owner claim:", e.message);
      res.status(409).json({ error: "تعذر تعيين المالك أو أن المالك موجود مسبقاً" });
    }
  });


  app.post("/api/admin/recover-owner", async (req, res) => {
    try {
      const id = String(req.headers["x-device-id"] || "");
      const password = String(req.body.password || "");

      if (!validId(id)) {
        return res.status(400).json({ error: "معرف الجهاز غير صالح" });
      }

      if (!PASSWORD || password !== PASSWORD) {
        return res.status(403).json({ error: "كلمة مرور الإدارة غير صحيحة" });
      }

      const owners = await db("?select=device_id&role=eq.owner&limit=2");
      if (owners.length !== 1) {
        return res.status(409).json({ error: "تعذر تحديد سجل المالك الحالي" });
      }

      const existing = await db(
        "?select=device_id,role&device_id=eq." + encodeURIComponent(id) + "&limit=1"
      );

      if (existing.length && existing[0].role !== "owner") {
        return res.status(409).json({ error: "هذا الجهاز مسجل بصلاحية أخرى" });
      }

      const secret = token();
      const oldId = owners[0].device_id;

      const updated = await db(
        "?role=eq.owner&device_id=eq." + encodeURIComponent(oldId),
        "PATCH",
        { device_id: id, token_hash: hash(secret) }
      );

      if (!Array.isArray(updated) || updated.length !== 1) {
        return res.status(409).json({ error: "لم يتم تحديث سجل المالك" });
      }

      res.json({ success: true, token: secret, role: "owner" });
    } catch (e) {
      console.error("Owner recovery:", e.message);
      res.status(503).json({ error: "تعذرت استعادة صلاحية المالك" });
    }
  });

  app.get("/api/admin/panel", async (req, res) => {
    try {
      const user = await auth(req);

      if (!user) {
        return res.status(403).json({ error: "غير مصرح" });
      }

      const rows = await db("?select=device_id,role,created_at&order=created_at.asc");

      res.json({
        role: user.role,
        online: devices(rows),
        admins: rows.map(x => ({
          deviceId: x.device_id,
          role: x.role,
          online: online.has(x.device_id)
        }))
      });
    } catch (e) {
      console.error("Admin panel:", e.message);
      res.status(503).json({ error: "تعذر تحميل لوحة الإشراف" });
    }
  });

  // إضافة إداري عن طريق رمز الجهاز، دون اشتراط اتصاله بنفس السيرفر
  app.post("/api/admin/add", async (req, res) => {
    try {
      const user = await auth(req);

      if (!user || user.role !== "owner") {
        return res.status(403).json({ error: "المالك فقط يستطيع إضافة إداريين" });
      }

      const id = String(req.body.deviceId || "");
      const secret = String(req.body.deviceToken || "");

      if (!validId(id) || id === user.device_id) {
        return res.status(400).json({ error: "معرف الجهاز غير صالح" });
      }

      if (!/^[0-9a-f]{64}$/i.test(secret)) {
        return res.status(400).json({ error: "رمز ربط الجهاز غير صالح" });
      }

      const existing = await db(
        "?select=device_id,role&device_id=eq." +
        encodeURIComponent(id) + "&limit=1"
      );

      if (existing[0]?.role === "owner") {
        return res.status(400).json({ error: "لا يمكن تغيير المالك" });
      }

      const all = await db("?select=device_id,role");

      if (!existing.length && all.length >= 3) {
        return res.status(409).json({ error: "الحد الأقصى 3 أجهزة إدارية" });
      }

      await db("?on_conflict=device_id", "POST", {
        device_id: id,
        role: "admin",
        token_hash: hash(secret)
      }, "resolution=merge-duplicates,return=representation");

      // تحديث الأجهزة المتصلة على نفس النسخة فقط
      for (const sid of online.get(id)?.keys() || []) {
        io.sockets.sockets.get(sid)?.emit("admin-granted", {
          token: secret,
          role: "admin"
        });
      }

      res.json({ success: true });
    } catch (e) {
      console.error("Add admin:", e.message);
      res.status(400).json({ error: "تعذرت إضافة الإداري" });
    }
  });

  app.delete("/api/admin/remove/:id", async (req, res) => {
    try {
      const user = await auth(req);

      if (!user || user.role !== "owner") {
        return res.status(403).json({ error: "المالك فقط يستطيع حذف الإداريين" });
      }

      const id = String(req.params.id || "");

      if (!validId(id)) {
        return res.status(400).json({ error: "معرف الجهاز غير صالح" });
      }

      const rows = await db(
        "?select=device_id,role&device_id=eq." +
        encodeURIComponent(id) + "&limit=1"
      );

      if (!rows.length || rows[0].role !== "admin") {
        return res.status(400).json({ error: "هذا الجهاز ليس إدارياً" });
      }

      await db("?device_id=eq." + encodeURIComponent(id), "DELETE");

      for (const sid of online.get(id)?.keys() || []) {
        io.sockets.sockets.get(sid)?.emit("admin-revoked");
      }

      res.json({ success: true });
    } catch (e) {
      console.error("Remove admin:", e.message);
      res.status(400).json({ error: "تعذر حذف الإداري" });
    }
  });

  io.on("connection", socket => {
    socket.on("register-device", id => {
      if (typeof id !== "string" || !validId(id)) return;

      socket.data.deviceId = id;

      if (!online.has(id)) online.set(id, new Map());

      online.get(id).set(socket.id, { wave: 1 });
      io.emit("admin-online-changed");
    });

    socket.on("join-wave", wave => {
      const id = socket.data.deviceId;
      if (!id || !online.has(id)) return;

      const sockets = online.get(id);

      if (sockets.has(socket.id)) {
        sockets.get(socket.id).wave = Number(wave);
        io.emit("admin-online-changed");
      }
    });

    socket.on("disconnect", () => {
      const id = socket.data.deviceId;
      if (!id || !online.has(id)) return;

      online.get(id).delete(socket.id);

      if (!online.get(id).size) online.delete(id);

      io.emit("admin-online-changed");
    });
  });
};
