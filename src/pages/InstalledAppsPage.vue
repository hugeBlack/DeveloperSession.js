<script setup>
import { computed, onMounted, ref } from "vue";
import { Button, Cell, CellGroup, Empty, NavBar, PullRefresh, Sticky, showLoadingToast, closeToast, showNotify, showDialog, showSuccessToast } from "vant";
import router from "@/router";
import shared from "@/shared";
import { DeveloperDeviceType, AppId, DeveloperSession, DeveloperTeam, ApplicationGroup } from "@/lib/DeveloperSession";
import { getBackgroundClient } from "@/lib/BackgroundClient";

const apps = ref([]);
const appIds = ref([]);
const refreshing = ref(false);
const installingBundleId = ref("");
const team = ref(undefined);

const isLoggedIn = computed(() => !!shared.appleId.value);

const goBack = () => router.back();

const entitlementKeyToId = {
    "com.apple.developer.kernel.increased-memory-limit": { id: "INCREASED_MEMORY_LIMIT", label: "Increased Memory Limit" },
    "com.apple.developer.healthkit": { id: "HEALTHKIT", label: "HealthKit" },
    "com.apple.security.application-groups": { id:  "APP_GROUPS", label: "App Groups" },
    "com.apple.developer.homekit": { id: "HOMEKIT", label: "HomeKit" },
    "com.apple.developer.game-center": { id: "GAME_CENTR", label: "Game Center" },
    "com.apple.developer.authentication-services.autofill-credential-provider": { id: "AUTOFILL_CREDENTIAL_PROVIDER", label: "Autofill Credential Provider" },
    "com.apple.external-accessory.wireless-configuration": { id: "WIRELESS_ACCESSORY_CONFIGURATION", label: "Wireless Accessory Configuration" },
    "inter-app-audio": { id: "INTER_APP_AUDIO", label: "Inter App Audio" },
}

const ignoredEntitlementKeys = [
    "com.apple.developer.healthkit.background-delivery",
    "com.apple.developer.healthkit.access",
    "com.apple.developer.team-identifier",
    "get-task-allow",
    "keychain-access-groups",
    "application-identifier"
]

/**
 * @param {DeveloperSession} session
 * @param {AppId} appId 
 * @param entitlementsDict 
 */
const registerEntitlements = async (session, team, appId, entitlementsDict) => {
    let unknownList = []
    let errorList = []
    for(let key in entitlementsDict) {
        if(ignoredEntitlementKeys.includes(key)) {
            continue;
        }
        if(!(key in entitlementKeyToId)) {
            unknownList.push(key)
            continue
        }
        let entitlementId = entitlementKeyToId[key].id
        try {
            await session.v1SetBundleBoolCapability(team, appId, { id: entitlementId },true)
        } catch(e) {
            errorList.push({"key": key, error: e})
        }
    }
    if("com.apple.security.application-groups" in entitlementsDict) {
        let groups = entitlementsDict["com.apple.security.application-groups"]
        try {
            let registeredGroups = await session.listApplicationGroups(DeveloperDeviceType.Ios, team);
            const requestedGroups = (Array.isArray(groups) ? groups : [groups]).filter(Boolean);
            if (requestedGroups.length) {
                const missing = requestedGroups.filter(identifier => !registeredGroups.some(group => group.identifier === identifier));
                if (missing.length) {
                    const created = await Promise.all(missing.map(identifier => session.addApplicationGroup(DeveloperDeviceType.Ios, team, identifier, identifier)));
                    registeredGroups = registeredGroups.concat(created);
                }
                const targetGroups = registeredGroups
                    .filter(group => requestedGroups.includes(group.identifier))
                    .map(group => group.applicationGroup);
                await session.assignApplicationGroupToAppId(DeveloperDeviceType.Ios, team, appId, targetGroups);
            }
        } catch(e) {
            errorList.push({"key": "assignApplicationGroupToAppId", error: e.toString()})
        }
    }
    return {unknownList, errorList}
}

const decodeProfile = (encodedProfile) => {
    if (!encodedProfile) return new Uint8Array();
    if (encodedProfile instanceof Uint8Array) return encodedProfile;
    if (Array.isArray(encodedProfile)) return Uint8Array.from(encodedProfile);
    if (typeof encodedProfile === "string") {
        try {
            const binary = atob(encodedProfile);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } catch (e) {
            console.error("Failed to decode profile", e);
        }
    }
    return new Uint8Array();
};

const isRegistered = (bundleId) => appIds.value.some((id) => id.identifier === bundleId);

const loadAppIds = async (currentTeam) => {
    const session = await shared.getSession();
    const result = await session.listAppIds(DeveloperDeviceType.Ios, currentTeam);
    appIds.value = result.appIds || [];
};

const refresh = async () => {
    if (!isLoggedIn.value) {
        showNotify({ type: "warning", message: "Please log in first." });
        return;
    }

    refreshing.value = true;
    try {
        const session = await shared.getSession();
        const currentTeam = await shared.getSelectedTeam();
        team.value = currentTeam;
        await loadAppIds(currentTeam);
        const bg = getBackgroundClient();
        const installed = await bg.getInstalledAppsByTeamId(currentTeam.teamId);
        apps.value = Array.isArray(installed) ? installed : [];
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        refreshing.value = false;
    }
};

const ensureAppId = async (app) => {
    const bundleId = app.CFBundleIdentifier;
    var appId = appIds.value.find((id) => id.identifier === bundleId);
    const session = await shared.getSession();
    const currentTeam = team.value || (await shared.getSelectedTeam());
    if (!appId) {
        const name = app.CFBundleName || bundleId;
        await session.addAppId(DeveloperDeviceType.Ios, currentTeam, name, bundleId);
        await loadAppIds(currentTeam);
        appId = appIds.value.find((id) => id.identifier === bundleId);
        if (!appId) {
            throw new Error("App ID registration succeeded but could not be found.");
        }
    }
    let enableEntitlementErrorInfo = await registerEntitlements(session, currentTeam, appId, app.Entitlements)
    if(enableEntitlementErrorInfo.errorList.length > 0 || enableEntitlementErrorInfo.unknownList > 0) {
        showDialog({
            "title": "Error While Enabling Entitlements",
            "message": `The app contains unknown entitlements: ${enableEntitlementErrorInfo.unknownList.join(",")}. Failed to enable the following entitlemts: ${JSON.stringify(enableEntitlementErrorInfo.errorList)}. Your app may not work.`
        })
    }
    return appId;
};

const handleProvision = async (app) => {
    if (!isLoggedIn.value) {
        showNotify({ type: "warning", message: "Please log in first." });
        return;
    }
    const bundleId = app.CFBundleIdentifier;
    installingBundleId.value = bundleId;
    showLoadingToast({ message: "Preparing profile...", duration: 0, forbidClick: true });
    let success = false;
    try {
        const session = await shared.getSession();
        const currentTeam = team.value || (await shared.getSelectedTeam());
        const appId = await ensureAppId(app);
        const profile = await session.downloadTeamProvisioningProfile(DeveloperDeviceType.Ios, currentTeam, appId);
        const bytes = decodeProfile(profile?.encodedProfile);
        if (!bytes || !bytes.length) {
            throw new Error("Downloaded profile is empty.");
        }
        const bg = getBackgroundClient();
        await bg.installProfile(bytes);
        success = true
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        installingBundleId.value = "";
        closeToast();
    }
    if(success) {
        showSuccessToast({message: "Profile Installed"})
    }
};

onMounted(() => {
    refresh();
});
</script>

<template>
    <div>
        <Sticky>
            <NavBar title="Installed Apps" left-arrow @click-left="goBack" />
        </Sticky>

        <PullRefresh v-model="refreshing" @refresh="refresh" style="padding-top: 12px;">
            <CellGroup inset v-if="apps.length" title="Install Profiles to Fix Unavailable Apps">
                <Cell v-for="app in apps" :key="app.CFBundleIdentifier" :title="app.CFBundleName || app.CFBundleIdentifier"
                    :label="app.CFBundleIdentifier" class="cell1">
                    <template #right-icon>
                        <Button size="small" type="primary" :loading="installingBundleId === app.CFBundleIdentifier"
                            @click.stop="handleProvision(app)">
                            {{ isRegistered(app.CFBundleIdentifier) ? "Install Profile" : "Register & Install" }}
                        </Button>
                    </template>
                </Cell>
            </CellGroup>
            <Empty v-else description="No installed apps found for this team" :image-size="120" />
        </PullRefresh>
        <div class="hint">
            Can't find your app? Make sure you've logged into the Apple ID that signed and installed that app.
        </div>
    </div>
</template>

<style scoped>
    .hint {
        font-family: var(--van-base-font);
        color: var(--van-empty-description-color);
        font-size: var(--van-cell-label-font-size);
        line-height: var(--van-cell-label-font-size);
        margin: var(--van-cell-label-line-height);
    }
</style>
