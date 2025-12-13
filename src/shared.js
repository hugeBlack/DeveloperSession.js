import { AppleAccount } from "./lib/AppleAccount";
import { ref } from "vue";
import { DeveloperSession, DeveloperTeam } from "./lib/DeveloperSession";

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

export default {
    appleId,
    session,
    selectedTeam,
    getSession,
    getSelectedTeam
}