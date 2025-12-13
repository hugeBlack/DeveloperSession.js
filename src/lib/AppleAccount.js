import { Buffer } from "buffer";
import axios from "axios";
import { Srp, Mode, Hash } from "@foxt/js-srp";
import plist from "plist"
import { sha256, pbkdf2WebCrypto, decryptAES256GCM, hmacSha256, decryptAesCbc } from "./crypto";
import { AnisetteData } from "./AnisetteData";

const axiosInstance = axios.create({
    responseType: "arraybuffer", // Set default responseType to arraybuffer
});

// Configure SRP library for compatibility with Apple's implementation
const gsaHost = import.meta.env.VITE_GSA_HOST
const userAgentHeaderKey = import.meta.env.VITE_USER_AGENT_HEADER_KEY
window.Buffer = Buffer

class AppToken {
    /**
     * @type {number}
     */
    duration;

    /**
     * @type {expiry}
     */
    expiry;

    /**
     * @type {string}
     */
    token;
}

class AppleAccount {

    /**
     * @type {string}
     */
    email;

    /**
     * @type {AnisetteData} 
     */
    anisetteData;

    /**
     * @type {Record<string, any>|undefined}
     */
    spd;

    /** @type {Object.<string, AppToken>} */
    tokens;

    /**
     * 
     * @param {AnisetteData} anisetteData 
     */
    constructor(anisetteData) {
        /**
         * @type {AnisetteData}
         */
        this.anisetteData = anisetteData
        this.spd = undefined
        this.tokens = {}
    }

    /**
     * 
     * @param {string} username 
     * @param {string} password 
     * @param {function(void):Promise<string>} twofaCallback 
     */
    async emailPasswordLogin(username, password, twofaCallback) {
        const srp = new Srp(Mode.GSA, Hash.SHA256, 2048);
        const usr = await srp.newClient(Buffer.from(username), Buffer.from(""));
        const A = usr.A;

        // --- Step 1: SRP Initialization ---
        let r = await this.gsaAuthenticatedRequest({
            A2k: Buffer.from(A.toString(16), "hex"),
            ps: ["s2k", "s2k_fo"],
            u: username,
            o: "init",
        });

        if (!r || !r.sp) {
            throw new Error("GSA Init failed. Response was empty or invalid.");
        }

        if (!["s2k", "s2k_fo"].includes(r.sp)) {
            throw new Error(
                `This implementation only supports s2k and sk2_fo. Server returned ${r.sp}`
            );
        }

        // --- Step 2: SRP Challenge Response ---
        usr.p = await this.encryptPassword(password, Buffer.from(r.s, "hex"), r.i, r.sp);
        const M = await usr.generate(
            Buffer.from(r.s, "hex"),
            Buffer.from(r.B, "hex")
        );

        if (!M) {
            throw new Error("Failed to generate SRP challenge");
        }

        r = await this.gsaAuthenticatedRequest({
            c: r.c,
            M1: Buffer.from(M.toString("hex"), "hex"),
            u: username,
            o: "complete",
        });

        if (!r || !r.M2) {
            if(r.Status?.em && r.Status?.ec) {
                throw new Error(`GSA Authentication failed. ${r.Status.em} (${r.Status.ec})`);
            }
                throw new Error("GSA Authentication failed. Response was empty or invalid.");

        }

        // --- Step 3: Verify Server and Decrypt Session ---
        const M2 = await usr.generateM2();
        if (
            Buffer.from(r.M2, "hex").toString("hex") !== Buffer.from(M2).toString("hex")
        ) {
            throw new Error("Failed to verify session (M2 mismatch)");
        }

        const spd = await this.decryptCbc(usr, Buffer.from(r.spd, "base64"));
        const parsedSpd = plist.parse("<plist>" + spd.toString() + "</plist>");
        this.spd = parsedSpd;

        // --- FIX: This is the corrected logic block ---
        if (
            r.Status &&
            ["trustedDeviceSecondaryAuth", "secondaryAuth"].includes(r.Status.au)
        ) {
            // CASE 1: 2FA is explicitly required.
            console.log("2FA required, requesting code");
            for (const key in parsedSpd) {
                if (Buffer.isBuffer(parsedSpd[key])) {
                    parsedSpd[key] = parsedSpd[key].toString("base64");
                }
            }
            if (r.Status.au === "secondaryAuth") {
                await this.smsSecondFactor(parsedSpd.adsid, parsedSpd.GsIdmsToken, twofaCallback);
            } else if (r.Status.au === "trustedDeviceSecondaryAuth") {
                await this.trustedSecondFactor(parsedSpd.adsid, parsedSpd.GsIdmsToken, twofaCallback);
            }
            // After 2FA is complete, re-run the entire authentication flow.
            return this.gsaAuthenticate(username, password, second_factor);
        } else {
            // CASE 2: No 'au' key is present. This is a SUCCESS.
            // Return the parsed session data.
            this.email = username;
            return parsedSpd;
        }
    }

    async gsaAuthenticatedRequest(parameters) {
        const { anisetteData } = await this.anisetteData.generateAnisetteHeaders();

        const body = {
            Header: { Version: "1.0.1" },
            Request: { cpd: await this.generateCpd(anisetteData) },
        };
        Object.assign(body.Request, parameters);

        const headers = {
            "Content-Type": "text/x-xml-plist",
            Accept: "*/*",
            ...anisetteData,
        };
        headers[userAgentHeaderKey] = "akd/1.0 CFNetwork/978.0.7 Darwin/18.7.0"

        const requestBody = plist.build(body);

        const resp = await axiosInstance.post(
            gsaHost + "/grandslam/GsService2",
            requestBody,
            {
                headers,
                validateStatus: () => true,
                timeout: 5000,
                responseType: "arraybuffer", // Ensure response is treated as buffer
            }
        );

        if (resp.status !== 200) {
            throw new Error(`Request failed with status ${resp.status}`);
        }

        const responseString = Buffer.from(resp.data).toString();
        return plist.parse(responseString).Response;
    }

    async generateCpd(anisetteData) {
        const cpd = {
            bootstrap: "true",
            icscrec: "true",
            pbe: "false",
            prkgen: "true",
            svct: "iCloud",
            loc: anisetteData["X-Apple-Locale"], // FIX: Add the missing 'loc' key.
        };

        // FIX: The Python version does not include X-Mme-Client-Info inside the cpd block,
        // so we must remove it before merging.
        delete anisetteData["X-Mme-Client-Info"];

        // Use the provided Anisette data.
        Object.assign(cpd, anisetteData);
        return cpd;
    }

    async encryptPassword(password, salt, iterations, protocol) {
        if (!["s2k", "s2k_fo"].includes(protocol)) {
            throw new Error("Unsupported protocol");
        }
        let p = await sha256(Buffer.from(password, "utf8"));
        if (protocol === "s2k_fo") {
            p = Buffer.from(p.toString("hex"));
        }
        // @foxt/js-srp's Client.setPassword expects a Buffer, so we need to ensure the output is a Buffer.
        // The original Python uses pbkdf2 from the `pbkdf2` library, which returns bytes.
        // Node.js crypto.pbkdf2 returns a Buffer.
        return pbkdf2WebCrypto(p, salt, iterations, 32, "SHA-256");
    }

    async createSessionKey(usr, name) {
        const k = usr.K; // @foxt/js-srp stores the session key in `K` property
        if (!k) {
            throw new Error("No session key");
        }
        const keyBuffer = Buffer.isBuffer(k) ? k : Buffer.from(k);
        return hmacSha256(keyBuffer, Buffer.from(name, "utf8"));
    }
    async decryptCbc(usr, data) {
        const extraDataKey = await this.createSessionKey(usr, "extra data key:");
        const extraDataIv = (await this.createSessionKey(usr, "extra data iv:")).slice(0, 16);
        const decrypted = await decryptAesCbc(extraDataKey, extraDataIv, data);
        const padLength = decrypted[decrypted.length - 1];
        if (padLength > 0 && padLength <= 16) {
            return decrypted.slice(0, decrypted.length - padLength);
        }
        return decrypted;
    }

    /**
     * Request an application token for the given app.
     * @param {string} appName
     * @returns {Promise<AppToken>}
     */
    async getAppToken(appName) {
        if (!appName) {
            throw new Error("appName is required");
        }

        if(this.tokens[appName]?.expiry > (new Date()).getTime()) {
            return this.tokens[appName]
        }

        if (!this.spd) {
            throw new Error("Missing SPD session; authenticate first.");
        }

        const spd = this.spd;
        const dsid = spd.adsid || spd["adsid"];
        const authToken = spd.GsIdmsToken || spd["GsIdmsToken"];
        if (!dsid || !authToken) {
            throw new Error("Missing dsid or GsIdmsToken in SPD.");
        }

        const skRaw = spd.sk || spd["sk"];
        const cRaw = spd.c || spd["c"];
        const sk = Buffer.isBuffer(skRaw) ? skRaw : Buffer.from(skRaw, "base64");
        const c = Buffer.isBuffer(cRaw) ? cRaw : Buffer.from(cRaw, "base64");

        const checksum = await this.createChecksum(sk, dsid.toString(), appName);

        const { anisetteData } = await this.anisetteData.generateAnisetteHeaders();
        const anisetteHeaders = { ...anisetteData };
        const clientInfo = anisetteHeaders["X-MMe-Client-Info"];
        if (!clientInfo) {
            throw new Error("Missing X-MMe-Client-Info anisette header.");
        }

        const requestBody = plist.build({
            Header: { Version: "1.0.1" },
            Request: {
                cpd: await this.generateCpd(anisetteHeaders),
                app: [appName],
                c,
                o: "apptokens",
                t: authToken.toString(),
                u: dsid.toString(),
                checksum,
            },
        });

        const headers = {
                    "Content-Type": "text/x-xml-plist",
                    Accept: "*/*",
                    "X-MMe-Client-Info": clientInfo,
                }

        headers[userAgentHeaderKey] = "akd/1.0 CFNetwork/978.0.7 Darwin/18.7.0"

        const resp = await axiosInstance.post(
            gsaHost + "/grandslam/GsService2",
            requestBody,
            {
                headers,
                validateStatus: () => true,
                timeout: 5000,
                responseType: "arraybuffer",
            }
        );

        if (resp.status !== 200) {
            throw new Error(`Request failed with status ${resp.status}`);
        }

        const parsed = plist.parse(Buffer.from(resp.data).toString());
        const responseDict = parsed.Response || parsed;
        if (
            responseDict.Status &&
            responseDict.Status.ec !== undefined &&
            responseDict.Status.ec !== 0
        ) {
            throw new Error(
                responseDict.Status.em || "GSA returned an error response."
            );
        }

        const encryptedToken = responseDict.et;
        if (!encryptedToken) {
            throw new Error("Encrypted token is missing from response.");
        }
        const encryptedBuffer = Buffer.isBuffer(encryptedToken)
            ? encryptedToken
            : Buffer.from(encryptedToken, "base64");

        if (encryptedBuffer.length < 3 + 16 + 16) {
            throw new Error("Encrypted token is in an unknown format.");
        }
        const header = encryptedBuffer.slice(0, 3);
        if (header.toString() !== "XYZ") {
            throw new Error("Encrypted token is in an unknown format.");
        }
        const iv = encryptedBuffer.slice(3, 19);
        const ciphertextAndTag = encryptedBuffer.slice(19);

        if (sk.length !== 32) {
            throw new Error("Session key has an unexpected length.");
        }
        if (iv.length !== 16) {
            throw new Error("Initialization vector has an unexpected length.");
        }

        let decrypted = await decryptAES256GCM(sk, iv, header, ciphertextAndTag);

        const decryptedToken = plist.parse("<plist>" + decrypted.toString() + "</plist>");
        const appTokens = decryptedToken.t;
        const appTokenDict = appTokens?.[appName];
        const token = appTokenDict?.token;
        const expiry = appTokenDict?.expiry
        if (!token) {
            throw new Error("Failed to parse app token from decrypted payload.");
        }

        for(let appName in appTokens) {
            this.tokens[appName] = appTokens[appName]
        }

        return appTokens[appName];
    }

    /**
     * HMAC-SHA256 checksum helper used by getAppToken.
     * @param {Buffer} sessionKey
     * @param {string} dsid
     * @param {string} appName
     */
    async createChecksum(sessionKey, dsid, appName) {
        const key = Buffer.isBuffer(sessionKey)
            ? sessionKey
            : Buffer.from(sessionKey);
        const payload = Buffer.concat([
            Buffer.from("apptokens", "utf8"),
            Buffer.from(dsid, "utf8"),
            Buffer.from(appName, "utf8"),
        ]);
        return hmacSha256(key, payload);
    }
    /**
     * 
     * @param {string} dsid 
     * @param {string} idmsToken 
     * @param {function(void):Promise<string>} twofaCallback 
     */
    async trustedSecondFactor(dsid, idmsToken, twofaCallback) {
        const identityToken = Buffer.from(`${dsid}:${idmsToken}`).toString("base64");

        const { anisetteData } = await generateAnisetteHeaders();

        const headers = {
            Accept: "application/json, text/javascript, */*", // FIX: Correct Accept header
            "X-Apple-Identity-Token": identityToken,
            "X-Xcode-Version": "11.2 (11B41)",
            "X-Apple-App-Info": "com.apple.gs.xcode.auth",
            "Content-Type": "text/x-xml-plist",
            "Accept": "text/x-xml-plist",
            "Accept-Language": "en-us",
            "Loc": anisetteData["X-Apple-Locale"],
            ...anisetteData,
        };

        headers[userAgentHeaderKey] = "Xcode"
        let res2 = await axiosInstance.get(gsaHost + "/auth/verify/trusteddevice", {
            headers,
            validateStatus: () => true,
            timeout: 10000,
        });

        console.log(res2)
        const code = await twofaCallback();
        headers["security-code"] = code;
        headers["Accept"] = "text/x-xml-plist";

        const resp = await axiosInstance.get(
            gsaHost + "/grandslam/GsService2/validate",
            {
                headers,
                validateStatus: () => true,
                timeout: 10000,
            }
        );

        if (resp.status === 200) {
            console.log("2FA successful");
        } else {
            console.error("2FA failed:", resp.status, resp.data);
        }
    }

        /**
     * 
     * @param {string} dsid 
     * @param {string} idmsToken 
     * @param {function(void):Promise<string>} twofaCallback 
     */
    async smsSecondFactor(dsid, idmsToken, twofaCallback) {
        const identityToken = Buffer.from(`${dsid}:${idmsToken}`).toString("base64");

        const { anisetteData } = await generateAnisetteHeaders();

        const headers = {
            "Content-Type": "application/json", // FIX: Set correct Content-Type
            Accept: "application/json, text/javascript, */*", // FIX: Correct Accept header
            "X-Apple-Identity-Token": identityToken,
            "X-Apple-App-Info": "com.apple.gs.xcode.auth",
            "X-Xcode-Version": "11.2 (11B41)",
            ...anisetteData,
        };
        headers[userAgentHeaderKey] = "Xcode"

        const body = { phoneNumber: { id: 1 }, mode: "sms" };

        try {
            const response = await axiosInstance.post(
                gsaHost + "/auth/verify/phone/",
                body,
                {
                    headers,
                    validateStatus: () => true,
                    timeout: 5000,
                    responseType: "json", // Expect a JSON response
                }
            );
            if (response.status !== 200 && response.status !== 201) {
                throw new Error("Failed to request SMS 2FA code.");
            }
        } catch (error) {
            throw error;
        }

        const code = await twofaCallback();
        body.securityCode = { code };

        const resp = await axiosInstance.post(
            gsaHost + "/auth/verify/phone/securitycode",
            body,
            {
                headers,
                validateStatus: () => true,
                timeout: 5000,
                responseType: "json", // FIX: Expect a JSON response
            }
        );

        if (resp.status === 200) {
            console.log("2FA successful");
        } else {
            console.error("2FA failed:", resp.status, resp.data);
        }
    }

    /**
     * 
     * @param {string} url 
     * @param {Object|undefined} body
     * @param {Object|undefined} extraHeaders
     * @param {"post"|"get"|"patch"|"delete"|undefined} method
     * @param {boolean} isPlist
     * @param {string} appName 
     */
    async sendRequest(url, body, extraHeaders = {}, method, isPlist, appName) {
        if (!appName) {
            throw new Error("appName is required");
        }

        if (!this.spd) {
            throw new Error("Missing SPD session; authenticate first.");
        }

        const appToken = await this.getAppToken(appName)
        const anisetteHeaders = (await this.anisetteData.generateAnisetteHeaders()).anisetteData
        const spd = this.spd;

        let headers = {
            "Accept-Language": "en-us",
            "X-Apple-I-Identity-Id": spd['adsid'],
            "X-Apple-GS-Token": appToken.token,
            "X-Apple-Locale": anisetteHeaders['X-Apple-Locale'],
            "X-Apple-App-Info": appName,
            ...extraHeaders,
            ...anisetteHeaders
        }
        headers[userAgentHeaderKey] = "Xcode"
        if(isPlist) {
            headers["Content-Type"] = "text/x-xml-plist"
            headers["Accept"] = "text/x-xml-plist"
        } else {
            headers["Content-Type"] = "application/vnd.api+json"
            headers["Accept"] = "application/vnd.api+json"
        }

        let bodyData = body ? (isPlist ? plist.build(body) : JSON.stringify(body)) : undefined
        /**
         * @type {axios.AxiosRequestConfig}
         */
        let config = {
            method: method ? method : (body ? "post": "get"),
            url: url,
            headers: headers,
            data: bodyData,
            validateStatus: () => true,
            timeout: 10000
        }

        let res = await axiosInstance.request(config)

        const resPlist = isPlist ? plist.parse(Buffer.from(res.data).toString()) : JSON.parse(Buffer.from(res.data).toString())
        return resPlist;
    }
}

export {
    AppleAccount,
    AppToken
}