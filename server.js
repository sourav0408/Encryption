const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs-extra");
const path = require("path");
const fileUpload = require("express-fileupload");

const app = express();

// Middleware
app.use(bodyParser.json({ limit: "100mb" }));
app.use(fileUpload());
app.use(express.static("public"));
app.use("/keys", express.static("keys"));

// Variables
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
//file upload

app.post("/upload-pem", (req, res) => {

    if (!req.files || !req.files.pem) {
        return res.status(400).send("No PEM file uploaded");
    }
    const pemName = req.body.pemName;
    const newFileName = pemName+ ".pem";
    const pemFile = req.files.pem;
    const savePath = path.join(__dirname, "keys", newFileName);

    pemFile.mv(savePath, err => {
        if (err) return res.status(500).send("Error saving PEM file");

        res.send(`PEM saved successfully at ${savePath}`);
    });
});

// Sender sends encrypted AES key
app.post("/api/send-key", (req, res) => {
    //encryptedKey = req.body.encKey;
    encryptedKey = req.body;
    fs.writeJsonSync(path.join(__dirname, "data/encrypted_key.json"), encryptedKey, { spaces: 2 });
    console.log("Encrypted AES key received and saved.2");
    res.json({ ok: true });
});


// Receiver fetches encrypted AES key
app.get("/api/encrypted-key", (req, res) => {
    if (!encryptedKey) return res.status(404).json({ error: "No key found" });
    //res.json({ encKey: encryptedKey });
    res.json(encryptedKey);
});
app.post("/api/clear-encrypted-key", (req, res) => {

    const filePathKey = path.join(__dirname, "data/encrypted_key.json");

    // Overwrite file with empty object
    fs.writeJson(filePathKey, {}, { spaces: 2 })
        .then(() => {
            encryptedKey = null // also clear in-memory encryptedKey
            console.log("✅ payload.json clearedss.");
            res.json({ ok: true, message: "encrypted Key cleared successfully." });
        })
        .catch(err => {
            console.error("❌ Failed to clear payload.json:", err);
            res.status(500).json({ error: "Failed to clear encrypted Key." });
        });
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
