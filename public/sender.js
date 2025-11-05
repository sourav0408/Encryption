console.log("Sender script loaded");

let aesKey;

function ab2b64(buffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))); }
function b642ab(base64) { const binary = atob(base64); return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer; }

async function importRSAPublicKey(pem) {
    const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
    const der = b642ab(b64);
    return crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
}

// Generate AES key and send
async function sendKey() {
    aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const rawKey = await crypto.subtle.exportKey("raw", aesKey);
    const rawKeyB64 = ab2b64(rawKey);

    const pubPem = await fetch("/keys/receiver_public.pem").then(r => r.text());
    const pubKey = await importRSAPublicKey(pubPem);

    const encKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, rawKey);
    const encKeyB64 = ab2b64(encKey);

    await fetch("/api/send-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encKey: encKeyB64 })
    });

    document.getElementById("status").textContent = "✅ AES key encrypted and sent!";
    document.getElementById("lastKey").textContent = rawKeyB64; // show key in UI
}



// Fetch payload and decrypt
async function fetchAndDecryptPayload() {
    const res = await fetch("/api/payload");

    if (!res.ok) return alert("No payload found");
    const data = await res.json();

    const iv = new Uint8Array(atob(data.messageIv).split("").map(c => c.charCodeAt(0)));
    const ciphertext = b642ab(data.messageCiphertext);
    const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
    const message = new TextDecoder().decode(decoded);

    document.getElementById("output").innerText = "📩 Message: " + message;

    // decrypt file
    if (data.fileCiphertext) {
        const fileIv = new Uint8Array(atob(data.fileIv).split("").map(c => c.charCodeAt(0)));
        const fileData = b642ab(data.fileCiphertext);
        const fileBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fileIv }, aesKey, fileData);
        const blob = new Blob([fileBuf], { type: data.mimetype });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = data.filename;
        link.textContent = "📎 Download File";
        document.getElementById("output").appendChild(document.createElement("br"));
        document.getElementById("output").appendChild(link);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("sendKeyBtn").onclick = sendKey;
    document.getElementById("fetchPayloadBtn").onclick = fetchAndDecryptPayload;
});
