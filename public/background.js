let installationProxyHandle = undefined;
async function getInstallationProxyHandle() {
    if(installationProxyHandle === undefined) {
        installationProxyHandle = await installation_proxy_connect()
    }
    return installationProxyHandle
}

let misagentHandle = undefined
async function getMisagentHandle() {
    if(misagentHandle === undefined) {
        misagentHandle = await misagent_connect()
    }
    return misagentHandle
}

async function getInstalledAppsByTeamId(teamId) {
    let instHandle = await getInstallationProxyHandle()
    let apps = await installation_proxy_get_apps(instHandle, "User", undefined);
    // let apps = apps1
    return apps.filter((app) => {
        return app.Entitlements?.['com.apple.developer.team-identifier'] == teamId
    }).map((app)=> {
        return {
            "CFBundleIdentifier": app.CFBundleIdentifier,
            "CFBundleName": app.CFBundleName,
            "Entitlements": app.Entitlements
        }
    })
}

async function installProfile(profileBase64) {
    let profileNSData = undefined;
    try {
        profileNSData = await nsdata_create(profileBase64);
        let handle = await getMisagentHandle();
        await misagent_install(handle, profileNSData)
    } catch(e) {
        throw e
    } finally {
        if(profileNSData !== undefined) {
            await nsdata_free(profileNSData)
        }
    }

}

function postMsg(uuid, data, error) {
    miniTool.postMessage({
        uuid,
        data,
        error
    })
}

miniTool.onMessage(async (payload) => {
    let command = payload.cmd
    let uuid = payload.uuid
    if(command === undefined || uuid === undefined) {
        miniTool.log("command or uuid is undefined!" + JSON.stringify(payload))
        return
    }
    let data = payload.data
    if(command === "installProfile") {
        let b64 = data.b64
        if(b64 === undefined) {
            postMsg(uuid, undefined, "b64 is required")
            return
        }
        try {
            await installProfile(b64)
            postMsg(uuid, "ok", undefined)
        } catch(e) {
            postMsg(uuid, undefined, e.toString())
        }
    } else if (command === "getInstalledAppsByTeamId") {
        let teamId = data.teamId
        if(teamId === undefined) {
            postMsg(uuid, undefined, "teamId is required")
            return
        }
        try {
            let ans = await getInstalledAppsByTeamId(teamId)
            postMsg(uuid, ans, undefined)
        } catch(e) {
            postMsg(uuid, undefined, e.toString())
        }
    } else if (command === "resetHandles") {
        misagentHandle = undefined
        installationProxyHandle = undefined
        postMsg(uuid, "ok", undefined)
    }
})