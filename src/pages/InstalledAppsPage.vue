<script setup>
import { computed, onMounted, ref } from "vue";
import { Button, Cell, CellGroup, Empty, NavBar, PullRefresh, Sticky, showLoadingToast, closeToast, showNotify } from "vant";
import router from "@/router";
import shared from "@/shared";
import { DeveloperDeviceType } from "@/lib/DeveloperSession";
import { getBackgroundClient } from "@/lib/BackgroundClient";

const apps = ref([]);
const appIds = ref([]);
const refreshing = ref(false);
const installingBundleId = ref("");
const team = ref(undefined);

const isLoggedIn = computed(() => !!shared.appleId.value);

const goBack = () => router.back();

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
    const existing = appIds.value.find((id) => id.identifier === bundleId);
    if (existing) return existing;

    const session = await shared.getSession();
    const currentTeam = team.value || (await shared.getSelectedTeam());
    const name = app.CFBundleName || bundleId;
    await session.addAppId(DeveloperDeviceType.Ios, currentTeam, name, bundleId);
    await loadAppIds(currentTeam);
    const created = appIds.value.find((id) => id.identifier === bundleId);
    if (!created) {
        throw new Error("App ID registration succeeded but could not be found.");
    }
    return created;
};

const handleProvision = async (app) => {
    if (!isLoggedIn.value) {
        showNotify({ type: "warning", message: "Please log in first." });
        return;
    }
    const bundleId = app.CFBundleIdentifier;
    installingBundleId.value = bundleId;
    showLoadingToast({ message: "Preparing profile...", duration: 0, forbidClick: true });
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
        showNotify({ type: "success", message: "Profile installed on device." });
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        installingBundleId.value = "";
        closeToast();
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
