console.log("Receiver script loaded");

let aesKey;
let counterR=1;
//let gtextR = "Ready.\n"
let gtextR = "Ready.\n";

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
    return crypto.subtle.importKey(
        "pkcs8",                          // Format: PKCS#8 (standard for private keys)
        der,                              // The binary key data
        { name: "RSA-OAEP", hash: "SHA-256" },  // Algorithm config
        false,                            // Not extractable (can't export key later)
        ["decrypt"]                       // Only allow decryption operations
    );
}

// --- UI Helper ---
function setStatus(text, color = "#06b6d4") {
    gtextR += `${counterR}. ${text}\n`;
    counterR++;

    const el = document.getElementById("status");
    const elR = document.getElementById("statusR");

    elR.textContent = gtextR;
    el.textContent = text;
    el.style.color = color;
}


///notification for AES key
async function checkForAESKey() {
    const res = await fetch("/api/encrypted-key");
    if (res.ok) {
        // Payload exists
        showNotification("📩 New secure message received!");
    }
}

function showNotification(msg) {
    const box = document.getElementById("notificationBoxR");
    box.innerText = msg;
    box.style.display = "block";
}
setInterval(checkForAESKey, 500);


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
function clearEncryptedKey() {
    localStorage.removeItem("encKey");
    document.getElementById("encKey").textContent = "Cleared";
    setStatus("🗑️ Encrypted key cleared", "#10b981");
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
//pem file upload

async function uploadPem() {
    const fileInput = document.getElementById("pemFile");
    const file = fileInput.files[0];

    if (!file) {
        alert("Select a PEM file first!");
        return;
    }

    const fd = new FormData();
    fd.append("pem", file);

    const res = await fetch("/upload-pem", {
        method: "POST",
        body: fd
    });

    const msg = await res.text();
    alert(msg);

    // Clear the file input after successful upload
    fileInput.value = "";
}
// --- Button bindings ---
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("fetchKeyBtn").onclick = fetchEncryptedKey;
    document.getElementById("decryptKeyBtn").onclick = decryptAESKey;
    document.getElementById("encryptSendBtn").onclick = encryptAndSendPayload;
    document.getElementById("uploadPemBtn").onclick = uploadPem;
});
// Clear when user closes tab/navigates away
window.addEventListener("beforeunload", () => {
    localStorage.removeItem("encKey");
});

async function resetToolR() {
    // Clear AES key
    aesKey = null;

    // Reset status messages
    gtextR = "Ready.\n";
    counter = 1;
    document.getElementById("statusR").innerText = gtextR;

    document.getElementById("decKey").innerText = "—";

    // Clear last key display
    document.getElementById("encKey").innerText = "—";
    //alert("hello world!");
    // Clear output and any file download links
    /*const output = document.getElementById("output");
    output.innerText = "";*/
    const links = output.querySelectorAll("a");
    links.forEach(link => link.remove());

    // Hide notification box
    const notif = document.getElementById("notificationBoxR");
    if (notif) {
        notif.innerText = "";
        notif.style.display = "none";
    }

    // Clear payload.json on the server
    try {
        const resKey = await fetch("/api/clear-encrypted-key", { method: "POST" });
        if (!resKey.ok) throw new Error("Failed to clear encrypted key");
        localStorage.removeItem("encKey");
        const res = await fetch("/api/clear-payload", { method: "POST" });
        if (!res.ok) throw new Error("Failed to clear payload.json");
        console.log("✅ payload.json cleared on server.");
    } catch (err) {
        console.error("❌ Error clearing payload.json:", err);
    }

    // Update status
    setStatus("Tool has been reset. You can start from the beginning.");
}

// Attach to button
document.getElementById("resetBtnR").onclick = resetToolR;
