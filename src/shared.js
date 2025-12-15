import { AppleAccount } from "./lib/AppleAccount";
import { ref } from "vue";
import { DeveloperSession, DeveloperTeam } from "./lib/DeveloperSession";
import { AnisetteData } from "./lib/AnisetteData";

/**
 * @type {import("vue").Ref<AppleAccount | undefined>}
 */
let appleId = ref(undefined)
/**
 * @type {DeveloperSession | undefined}
 */
let session = undefined

/**
 * @type {DeveloperTeam | undefined}
 */
let selectedTeam = undefined

async function getSession() {
    if(session) {
        return session;
    }
    if(!appleId.value) {
        throw Error("Please login first.")
    }
    session = new DeveloperSession(appleId.value)
    return session
}

async function getSelectedTeam() {
    if(selectedTeam) {
        return selectedTeam;
    }
    let session = await getSession()
    let teams = await session.listTeams()
    selectedTeam = teams[0]
    return selectedTeam;
}

function loadAccountFromLocalStorage() {
    let spd = window.localStorage.getItem("spd")
    let identifier = window.localStorage.getItem("identifier")
    let adi_pb = window.localStorage.getItem("adi_pb")
    let xcodeToken = window.localStorage.getItem("xcodeToken")
    if(spd === null || identifier === null || adi_pb === null) {
        return false
    }
    spd = JSON.parse(spd)
    spd['c'] = new Uint8Array(spd.c.data)
    spd['sk'] = new Uint8Array(spd.sk.data)

    let ani = new AnisetteData(identifier, adi_pb)
    let aid = new AppleAccount(ani)
    aid.email = spd['acname']
    aid.spd = spd
    if(xcodeToken !== null) {
        try {
            aid.tokens["com.apple.gs.xcode.auth"] = JSON.parse(xcodeToken)
        } catch(e) {
            console.log("failed to parse xcode token " + e.toString())
            return false
        }
    }
    appleId.value = aid
    session = new DeveloperSession(aid)
    return true
}

function clearLocalStorage() {
    window.localStorage.removeItem("spd")
    window.localStorage.removeItem("identifier")
    window.localStorage.removeItem("adi_pb")
    window.localStorage.removeItem("xcodeToken")
}

export default {
    appleId,
    session,
    selectedTeam,
    getSession,
    getSelectedTeam,

    clearLocalStorage,
    loadAccountFromLocalStorage
}