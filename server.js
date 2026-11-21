require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const setupAdmin = require("./admin-system");

const app = express();
app.use("/sounds", express.static(path.join(__dirname, "public")));
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: "20kb" }));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;

if (!URL || !KEY) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

setupAdmin(app, io, URL);

async function db(table, options = {}) {
  const response = await fetch(
    `${URL}/rest/v1/${table}${options.query || ""}`,
    {
      method: options.method || "GET",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: options.prefer || "return=representation"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/data", async (req, res) => {
  try {
    const groups = await db("pager_groups", {
      query: "?select=*&order=created_at.asc"
    });

    const items = await db("pager_items", {
      query: "?select=*&order=created_at.asc"
    });

    res.json({ groups, items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "تعذر تحميل البيانات" });
  }
});

app.post("/api/groups", async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    if (!title || title.length > 60) {
      return res.status(400).json({ error: "اسم القائمة غير صالح" });
    }

    const result = await db("pager_groups", {
      method: "POST",
      body: { title }
    });

    res.json(result[0]);
    io.emit("data-changed");
  } catch (error) {
    res.status(400).json({ error: "تعذر إضافة القائمة أو أنها موجودة" });
  }
});

app.patch("/api/groups/:id", async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    if (!title || title.length > 60) {
      return res.status(400).json({ error: "اسم القائمة غير صالح" });
    }

    const result = await db("pager_groups", {
      method: "PATCH",
      query: `?id=eq.${encodeURIComponent(req.params.id)}`,
      body: { title }
    });

    io.emit("data-changed");
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: "تعذر تعديل القائمة" });
  }
});

app.delete("/api/groups/:id", async (req, res) => {
  try {
    await db("pager_groups", {
      method: "DELETE",
      query: `?id=eq.${encodeURIComponent(req.params.id)}`
    });

    io.emit("data-changed");
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: "تعذر حذف القائمة" });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    const phrase = String(req.body.phrase || "").trim();
    const group_id = String(req.body.group_id || "");

    if (!phrase || phrase.length > 200 || !/^[0-9a-f-]{36}$/i.test(group_id)) {
      return res.status(400).json({ error: "بيانات البيجر غير صالحة" });
    }

    const result = await db("pager_items", {
      method: "POST",
      body: { phrase, group_id }
    });

    io.emit("data-changed");
    res.json(result[0]);
  } catch (error) {
    res.status(400).json({ error: "تعذر إضافة البيجر" });
  }
});

app.patch("/api/items/:id", async (req, res) => {
  try {
    const phrase = String(req.body.phrase || "").trim();
    if (!phrase || phrase.length > 200) {
      return res.status(400).json({ error: "العبارة غير صالحة" });
    }

    const result = await db("pager_items", {
      method: "PATCH",
      query: `?id=eq.${encodeURIComponent(req.params.id)}`,
      body: { phrase }
    });

    io.emit("data-changed");
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: "تعذر تعديل البيجر" });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    await db("pager_items", {
      method: "DELETE",
      query: `?id=eq.${encodeURIComponent(req.params.id)}`
    });

    io.emit("data-changed");
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: "تعذر حذف البيجر" });
  }
});

io.on("connection", (socket) => {
  let lastMessage = 0;
  let currentWave = 1;

  socket.join("wave-" + currentWave);

  socket.on("join-wave", (wave) => {
    const nextWave = Number(wave);

    if (!Number.isInteger(nextWave) || nextWave < 1 || nextWave > 50) {
      return;
    }

    socket.leave("wave-" + currentWave);
    currentWave = nextWave;
    socket.join("wave-" + currentWave);

    socket.emit("wave-joined", currentWave);
  });

  socket.on("send-message", (message) => {
    if (typeof message !== "string") return;
    if (!message.trim() || message.length > 200) return;

    const now = Date.now();
    if (now - lastMessage < 700) return;
    lastMessage = now;

    socket.to("wave-" + currentWave).emit("pager-message", message);
    socket.emit("send-success");
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log("BLACK PAGER running on port " + PORT);
});
