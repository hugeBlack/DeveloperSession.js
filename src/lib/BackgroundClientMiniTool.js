
import {v4} from "uuid"

class BackgroundClient {
    requestPool;

    constructor() {
        this.requestPool = {}
        window.miniTool.onMessage((payload) => {
            let uuid = payload.uuid
            if(uuid === undefined) {
                window.miniTool.log("received a message without uuid!" + JSON.stringify(payload))
                return
            }
            let funcs = this.requestPool[uuid]
            if(funcs === undefined) {
                window.miniTool.log("received a message with invalid uuid!" + JSON.stringify(payload))
            }
            if(payload.error !== undefined) {
                funcs[1](payload.error)
            } else {
                funcs[0](payload.data)
            }
            delete this.requestPool[uuid]


        })
    }

    /**
     * 
     * @param {string} command 
     * @param {*} data 
     * @returns {Promise}
     */
    #sendRequest(command, data) {
        return new Promise((resolve, reject) => {
            let uuid = v4()
            this.requestPool[uuid] = [resolve, reject]
            window.miniTool.postMessage({
                uuid, "cmd": command, data
            })
        })
    }

    getInstalledAppsByTeamId(teamId) {
        return this.#sendRequest("getInstalledAppsByTeamId", {"teamId": teamId})
    }

    /**
     * 
     * @param {Buffer} profile 
     * @returns {Promise<string>}
     */
    installProfile(profile) {
        let profileB64 = btoa(String.fromCharCode.apply(null, new Uint8Array(profile)));
        return this.#sendRequest("installProfile", { b64: profileB64 })
    }

    /**
     * 
     * @returns {Promise<string>}
     */
    resetHandles() {
        return this.#sendRequest("resetHandles")
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
