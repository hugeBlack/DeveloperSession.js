import { Buffer } from "buffer";
import axios from "axios";
import { sha256Hex } from "./crypto";

const anisetteHost = import.meta.env.VITE_ANISETTE_HOST

class AnisetteData {
    anisetteDict;
    clientInfo;
    /**
     * @type {Date|undefined}
     */
    lastFetchedDate;
    constructor(identifier, adiPb) {
        this.anisetteInfo = {
            "identifier": identifier,
            "adi_pb": adiPb
        }
        this.anisetteDict = undefined
        this.clientInfo = undefined
        this.lastFetchedDate = undefined
    }

    async generateAnisetteHeaders(anisetteUrl = undefined) {
        const AN_URL =
            anisetteUrl || anisetteHost || "http://localhost:6969";
        try {

            if (this.anisetteDict === undefined || this.clientInfo === undefined || (new Date()) - this.lastFetchedDate > 60_000) {
                const response = await axios.post(AN_URL + "/v3/get_headers", this.anisetteInfo, {
                    timeout: 10000,
                    responseType: "json"
                });

                const anisetteData = response.data;

                if (anisetteData["X-Apple-I-MD-M"] === undefined) {
                    throw Error("Failed to get anisette headers: " + this.anisetteData['message'])
                }
                if(!this.clientInfo){
                    const clientInfoResponse = await axios.get(AN_URL + "/v3/client_info")
                    this.clientInfo = clientInfoResponse.data['client_info']
                }

                // Generate X-Apple-I-MD-LU: sha256(adi_pb['keychain_identifier'])
                // For simplicity, we'll use the identifier as keychain_identifier
                const keychainIdentifier = Buffer.from(this.anisetteInfo['identifier'], 'base64');
                const mdLu = (await sha256Hex(keychainIdentifier)).toUpperCase();

                // Generate X-Mme-Device-Id: UUID based on keychain_identifier
                // Create a deterministic UUID from the keychain identifier
                const deviceIdHash = Buffer.from(this.anisetteInfo['identifier'], 'base64').toString('hex');
                const deviceId = [
                    deviceIdHash.substr(0, 8),
                    deviceIdHash.substr(8, 4),
                    deviceIdHash.substr(12, 4),
                    deviceIdHash.substr(16, 4),
                    deviceIdHash.substr(20, 12)
                ].join('-').toUpperCase();

                // Generate current timestamp
                const now = new Date().toISOString();
                this.lastFetchedDate = (new Date()).getTime()
                let headers = {
                    "X-Apple-I-Client-Time": now.replace('+00:00', 'Z'),
                    "X-Apple-I-MD": anisetteData["X-Apple-I-MD"], // get_headers
                    "X-Apple-I-MD-LU": mdLu, // sha256(adi_pb['keychain_identifier'])
                    "X-Apple-I-MD-M": anisetteData["X-Apple-I-MD-M"], // get_headers
                    "X-Apple-I-MD-RINFO": anisetteData["X-Apple-I-MD-RINFO"], // get_headers
                    "X-Apple-I-SRL-NO": "0", // fixed
                    "X-Apple-I-TimeZone": "UTC", // fixed
                    "X-Apple-Locale": "en_US", // fixed
                    "X-MMe-Client-Info": this.clientInfo, // get_client_info
                    "X-Mme-Device-Id": deviceId // UUID(adi_pb['keychain_identifier'])
                }
                this.anisetteDict = headers
            } else {
                const now = new Date().toISOString();
                this.anisetteDict["X-Apple-I-Client-Time"] = now.replace('+00:00', 'Z')
            }
            return { anisetteData: this.anisetteDict };
        } catch (e) {
            console.error(
                `Failed to query anisette server at ${AN_URL}. Please ensure it's running.`
            );
            // It's better to throw an error here than to continue with an invalid request
            throw new Error("Anisette server is unavailable.");
        } 
    }
}

export {
    AnisetteData
}