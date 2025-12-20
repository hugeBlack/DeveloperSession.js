import axios from "axios";

class BackgroundClient {

    constructor() {

    }


    async getInstalledAppsByTeamId(teamId) {
        let res = await axios.post("/device/getInstalledAppsByTeamId", {"teamId": teamId});
        if(res.data.error) {
            throw new Error(res.data.error)
        }
        return res.data.data
    }

    /**
     * 
     * @param {Buffer} profile 
     * @returns {Promise<string>}
     */
    async installProfile(profile) {
        let profileB64 = btoa(String.fromCharCode.apply(null, new Uint8Array(profile)));
        let res = await axios.post("/device/installProfile", {"b64": profileB64});
        if(res.data.error) {
            throw new Error(res.data.error)
        }
        return res.data.data
    }

    /**
     * 
     * @returns {Promise<string>}
     */
    resetHandles() {
        // return this.#sendRequest("resetHandles")
    }
}

let client = undefined
function getBackgroundClient() {
    if(client === undefined) {
        client = new BackgroundClient()
    }    
    return client
}

export {
    BackgroundClient,
    getBackgroundClient
}
