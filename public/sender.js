console.log("Sender script loaded");

let aesKey;
let gtext = "Ready.\n";
let counter = 1;

// ---- Utility Functions ----
function ab2b64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
function b642ab(base64) {
    const binary = atob(base64);
    return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}


function setStatus(text) {
    gtext += `${counter}. ${text}\n`;
    counter++;

    document.getElementById("detailedStatus").innerText = gtext;
}

// ---- RSA Import ----
async function importRSAPublicKey(pem) {
    const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
    const der = b642ab(b64);
    return crypto.subtle.importKey(
        "spki",
        der,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );
}

// ---- Generate AES key & send ----
async function sendKey() {
    setStatus("Generating AES key...");

    aesKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const rawKey = await crypto.subtle.exportKey("raw", aesKey);
    const rawKeyB64 = ab2b64(rawKey);
   // console.log("aes KEY" + rawKeyB64);

    setStatus("Loading receiver public key...");
    const pubPem = await fetch("/keys/receiver_public.pem").then(r => r.text());
    const pubKey = await importRSAPublicKey(pubPem);
    setStatus("Encrypting AES key...");
    const encKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, rawKey);
    const encKeyB64 = ab2b64(encKey);
    //setStatus("Receiver public key: " + encKeyB64);

    setStatus("Sending encrypted AES key...");

    await fetch("/api/send-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encKey: encKeyB64 })
    });

    //document.getElementById("status").textContent = "AES key encrypted and sent!";
    document.getElementById("lastKey").textContent = rawKeyB64;
    setStatus("AES key sent successfully.");
}


///notification for paylod ready
async function checkForPayload() {
    const res = await fetch("/api/payload");

    if (res.ok) {
        // Payload exists
        showNotification("📩 New secure message received!");
    }
}

function showNotification(msg) {
    const box = document.getElementById("notificationBox");
    box.innerText = msg;
    box.style.display = "block";
}
setInterval(checkForPayload, 500);

//reset all
async function resetTool() {
    // Clear AES key
    aesKey = null;

    // Reset status messages
    gtext = "Ready.\n";
    counter = 1;
    document.getElementById("detailedStatus").innerText = gtext;
    document.getElementById("status").innerText = gtext;

    // Clear last key display
    document.getElementById("lastKey").innerText = "—";

    // Clear output and any file download links
    const output = document.getElementById("output");
    output.innerText = "";
    const links = output.querySelectorAll("a");
    links.forEach(link => link.remove());

    // Hide notification box
    const notif = document.getElementById("notificationBox");
    if (notif) {
        notif.innerText = "";
        notif.style.display = "none";
    }

    // Clear payload.json on the server
    try {
        const res = await fetch("/api/clear-payload", { method: "POST" });
        if (!res.ok) throw new Error("Failed to clear payload.json");
        console.log("✅ payload.json cleared on server.");
    } catch (err) {
        console.error("❌ Error clearing payload.json:", err);
    }

    // Update status
    setStatus("Tool has been reset. You can start from the beginning.");
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
// Attach to button
document.getElementById("resetBtn").onclick = resetTool;


// Copy AES key to clipboard
document.getElementById("copyKeyBtn").onclick = () => {
    const lastKey = document.getElementById("lastKey").textContent;

    if (!lastKey || lastKey === "—") {
        alert("No AES key to copy!");
        return;
    }

    navigator.clipboard.writeText(lastKey)
        .then(() => {
            setStatus("✅ AES key copied to clipboard!");
        })
        .catch(err => {
            console.error("Failed to copy:", err);
            setStatus("❌ Failed to copy AES key", "#f87171");
        });
};


// ---- Fetch & decrypt payload ----
async function fetchAndDecryptPayload() {
    setStatus("Fetching encrypted payload...");
    const res = await fetch("/api/payload");

    if (!res.ok) {
        setStatus("No payload found.");
        alert("No payload found");
        return;
    }

    const data = await res.json();

    setStatus("Decrypting message...");
    const iv = new Uint8Array(atob(data.messageIv).split("").map(c => c.charCodeAt(0)));
    const ciphertext = b642ab(data.messageCiphertext);

    const decoded = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ciphertext
    );

    const message = new TextDecoder().decode(decoded);
    document.getElementById("output").innerText = "📩 Message: " + message;

    // decrypt file (if exists)
    if (data.fileCiphertext) {
        setStatus("Decrypting attached file...");

        const fileIv = new Uint8Array(atob(data.fileIv).split("").map(c => c.charCodeAt(0)));
        const fileData = b642ab(data.fileCiphertext);
        const fileBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fileIv },
            aesKey,
            fileData
        );

        const blob = new Blob([fileBuf], { type: data.mimetype });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = data.filename;
        link.textContent = "📎 Download File";

        document.getElementById("output").appendChild(document.createElement("br"));
        document.getElementById("output").appendChild(link);
    }

    setStatus("Decryption completed.");
}

// ---- Init ----
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("sendKeyBtn").onclick = sendKey;
    document.getElementById("fetchPayloadBtn").onclick = fetchAndDecryptPayload;
    document.getElementById("uploadPemBtn").onclick = uploadPem;
    setStatus("Ready.");
});


/*
console.log("Sender script loaded");

let aesKey;
let msg;
//Converts binary data (ArrayBuffer) to Base64
function ab2b64(buffer) {
                                 return btoa(String.fromCharCode(...new Uint8Array(buffer)));
                               }
//Converts Base64 string back to binary
function b642ab(base64) {
                                     const binary = atob(base64);
                                     return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
                                   }

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
    document.getElementById("detailedStatus").textContent = msg;
});
*/
