const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(bodyParser.json({ limit: "100mb" }));
app.use(express.static("public"));
app.use("/keys", express.static("keys"));

let encryptedKey = null;
let payload = null;

// Home route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// Serve sender & receiver pages
app.get("/sender", (req, res) => {
    res.sendFile(path.join(__dirname, "public/sender.html"));
});

app.get("/receiver", (req, res) => {
    res.sendFile(path.join(__dirname, "public/receiver.html"));
});

// Sender sends encrypted AES key
app.post("/api/send-key", (req, res) => {
    encryptedKey = req.body.encKey;
    console.log("Encrypted AES key received and saved.");
    res.json({ ok: true });
});

// Receiver fetches encrypted AES key
app.get("/api/encrypted-key", (req, res) => {
    if (!encryptedKey) return res.status(404).json({ error: "No key found" });
    res.json({ encKey: encryptedKey });
});

// Receiver sends encrypted payload (message/file)
app.post("/api/payload", (req, res) => {
    payload = req.body;
    fs.writeJsonSync(path.join(__dirname, "data/payload.json"), payload, { spaces: 2 });
    console.log("Encrypted payload received and saved.");
    res.json({ ok: true });
});

// Sender fetches encrypted payload
app.get("/api/payload", (req, res) => {
    if (!payload) return res.status(404).json({ error: "No payload found" });
    res.json(payload);
});

// Clear payload.json
app.post("/api/clear-payload", (req, res) => {
    const filePath = path.join(__dirname, "data/payload.json");

    // Overwrite file with empty object
    fs.writeJson(filePath, {}, { spaces: 2 })
        .then(() => {
            payload = null; // also clear in-memory payload
            console.log("✅ payload.json cleared.");
            res.json({ ok: true, message: "Payload cleared successfully." });
        })
        .catch(err => {
            console.error("❌ Failed to clear payload.json:", err);
            res.status(500).json({ error: "Failed to clear payload." });
        });
});


// Run the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
