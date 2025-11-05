console.log("Receiver script loaded");

let aesKey;

// --- Utility Functions ---
function ab2b64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000; // process in 32KB chunks
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function b642ab(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function importRSAPrivateKey(pem) {
    const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
    const der = b642ab(b64);
    return crypto.subtle.importKey("pkcs8", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
}

// --- UI Helper ---
function setStatus(text, color = "#06b6d4") {
    const el = document.getElementById("status");
    el.textContent = text;
    el.style.color = color;
}

function shortKeyDisplay(b64) {
    if (!b64) return "—";
    return b64.slice(0, 30) + "…";
}

// --- Fetch Encrypted Key from Server ---
async function fetchEncryptedKey() {
    setStatus("Fetching encrypted AES key…", "#facc15");
    try {
        const res = await fetch("/api/encrypted-key");
        if (!res.ok) throw new Error("No encrypted key available.");

        const data = await res.json();
        localStorage.setItem("encKey", data.encKey);

        document.getElementById("encKey").textContent = shortKeyDisplay(data.encKey);
        setStatus("✅ Encrypted AES key fetched successfully!");
    } catch (err) {
        console.error(err);
        setStatus("❌ Failed to fetch encrypted key", "#f87171");
    }
}

// --- Decrypt AES Key ---
async function decryptAESKey() {
    const encKeyB64 = localStorage.getItem("encKey");
    if (!encKeyB64) return setStatus("Fetch encrypted key first!", "#f87171");

    setStatus("Decrypting AES key…", "#facc15");

    try {
        const privPem = await fetch("/keys/receiver_private.pem").then(r => r.text());
        const privKey = await importRSAPrivateKey(privPem);

        const encKey = b642ab(encKeyB64);
        const rawKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privKey, encKey);
        aesKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);

        const rawKeyB64 = ab2b64(rawKey);
        document.getElementById("decKey").textContent = shortKeyDisplay(rawKeyB64);
        setStatus("✅ AES key decrypted successfully!");
    } catch (err) {
        console.error("Decryption failed:", err);
        setStatus("❌ AES key decryption failed", "#f87171");
    }
}

// --- Encrypt Message & File and Send to Sender ---
async function encryptAndSendPayload() {
    try {
        if (!aesKey) return setStatus("Decrypt AES key first!", "#f87171");

        const message = document.getElementById("message").value.trim();
        const fileInput = document.getElementById("fileInput");

        setStatus("Encrypting payload…", "#facc15");

        // Encrypt message
        const msgIv = crypto.getRandomValues(new Uint8Array(12));
        const msgEncoded = new TextEncoder().encode(message || "(empty)");
        const msgCipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: msgIv }, aesKey, msgEncoded);

        // Encrypt file (optional)
        let fileIv = null, fileCiphertext = null, filename = null, mimetype = null;
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const buffer = await file.arrayBuffer();
            fileIv = crypto.getRandomValues(new Uint8Array(12));
            const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: fileIv }, aesKey, buffer);
            fileCiphertext = ab2b64(cipher);
            filename = file.name;
            mimetype = file.type;
        }

        // Build payload
        const payload = {
            messageIv: ab2b64(msgIv.buffer),
            messageCiphertext: ab2b64(msgCipher),
            fileIv: fileIv ? ab2b64(fileIv.buffer) : null,
            fileCiphertext,
            filename,
            mimetype
        };

        console.log("Payload preview:", JSON.stringify(payload).slice(0, 200) + "...");

        const response = await fetch("/api/payload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        setStatus("✅ Payload encrypted and sent!");
    } catch (err) {
        console.error("❌ Failed to send payload:", err);
        setStatus("❌ Failed to send payload: " + err.message, "#f87171");
    }
}

// --- Button bindings ---
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("fetchKeyBtn").onclick = fetchEncryptedKey;
    document.getElementById("decryptKeyBtn").onclick = decryptAESKey;
    document.getElementById("encryptSendBtn").onclick = encryptAndSendPayload;
});
