import { Buffer } from "buffer";

const subtleCrypto = globalThis.crypto?.subtle;

function ensureSubtle() {
    const subtle = globalThis.crypto?.subtle || subtleCrypto;
    if (!subtle) {
        throw new Error("WebCrypto is not available in this environment.");
    }
    return subtle;
}

async function sha256(buffer) {
    const subtle = ensureSubtle();
    const hash = await subtle.digest("SHA-256", buffer);
    return Buffer.from(new Uint8Array(hash));
}

async function sha256Hex(buffer) {
    return (await sha256(buffer)).toString("hex");
}

async function pbkdf2WebCrypto(passwordBuffer, salt, iterations, length, hash) {
    const subtle = ensureSubtle();
    const keyMaterial = await subtle.importKey(
        "raw",
        passwordBuffer,
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const derivedBits = await subtle.deriveBits(
        {
            name: "PBKDF2",
            hash: hash.toUpperCase(),
            salt,
            iterations,
        },
        keyMaterial,
        length * 8
    );
    return Buffer.from(new Uint8Array(derivedBits));
}

async function decryptAES256GCM(sk, iv, header, ciphertextAndTag) {
    const subtle = ensureSubtle();
    const key = await subtle.importKey(
        "raw",
        sk,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );
    const decryptedBuf = await subtle.decrypt(
        {
            name: "AES-GCM",
            iv,
            additionalData: header,
            tagLength: 128,
        },
        key,
        ciphertextAndTag
    );
    let decrypted = Buffer.from(new Uint8Array(decryptedBuf));
    return decrypted
}
async function hmacSha256(keyBuffer, dataBuffer) {
    const subtle = ensureSubtle();
    const key = await subtle.importKey(
        "raw",
        keyBuffer,
        {
            name: "HMAC",
            hash: "SHA-256",
        },
        false,
        ["sign"]
    );
    const signature = await subtle.sign("HMAC", key, dataBuffer);
    return Buffer.from(new Uint8Array(signature));
}

async function decryptAesCbc(keyBuffer, ivBuffer, dataBuffer) {
    const subtle = ensureSubtle();
    const key = await subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
    );
    const decrypted = await subtle.decrypt(
        { name: "AES-CBC", iv: ivBuffer },
        key,
        dataBuffer
    );
    return Buffer.from(new Uint8Array(decrypted));
}

export {
    sha256,
    sha256Hex,
    pbkdf2WebCrypto,
    decryptAES256GCM,
    hmacSha256,
    decryptAesCbc
}