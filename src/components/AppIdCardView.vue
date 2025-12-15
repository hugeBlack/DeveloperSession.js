<script setup>
import { Button, Cell, CellGroup, showConfirmDialog, Empty, Field, NavBar, PullRefresh, showLoadingToast, closeToast, showNotify, Sticky, Popup, Switch, Checkbox, CheckboxGroup, showSuccessToast } from "vant";
import router from "@/router";
import shared from "@/shared";
import { DeveloperDeviceType, AppId, ApplicationGroup } from "@/lib/DeveloperSession";
import { computed, onMounted, ref, watch } from "vue";

/**
 * @type{{readonly appId: AppId, readonly appGroups: ApplicationGroup[]}}
 */
const props = defineProps({
  appId: AppId,
  appGroups: Array
});

const emit = defineEmits(["refresh"]);

const expirationDateString = computed(() => props.appId.expirationDate?.toLocaleString() || "");

const supportedCapabilities = [
    { id: "INCREASED_MEMORY_LIMIT", label: "Increased Memory Limit" },
    { id: "HEALTHKIT", label: "HealthKit" },
    { id: "APP_GROUPS", label: "App Groups" },
    { id: "HOMEKIT", label: "HomeKit" },
    { id: "GAME_CENTR", label: "Game Center" },
    { id: "AUTOFILL_CREDENTIAL_PROVIDER", label: "Autofill Credential Provider" },
    { id: "WIRELESS_ACCESSORY_CONFIGURATION", label: "Wireless Accessory Configuration" },
];

const team = ref(undefined);
const capabilityStates = ref(
    supportedCapabilities.reduce((acc, cap) => {
        acc[cap.id] = false;
        return acc;
    }, {})
);
const assignedAppGroups = ref([]);
const capabilityLoading = ref(false);
const appGroupSelectorOpen = ref(false);
const selectedGroupIds = ref([]);
const assigningAppGroups = ref(false);
const availableAppGroups = computed(() => props.appGroups || []);

const syncSelectedGroups = () => {
    const assigned = Array.isArray(assignedAppGroups.value) ? assignedAppGroups.value : [];
    const assignedSet = new Set(assigned);
    selectedGroupIds.value = availableAppGroups.value
        .filter(group => assignedSet.has(group.identifier) || assignedSet.has(group.applicationGroup))
        .map(group => group.applicationGroup);
};

const decodeProfile = (encodedProfile) => {
    if (!encodedProfile) return new Uint8Array();
    if (encodedProfile instanceof Uint8Array) return encodedProfile;
    if (Array.isArray(encodedProfile)) return Uint8Array.from(encodedProfile);
    if (typeof encodedProfile === "string") {
        try {
            const binary = atob(encodedProfile);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } catch (e) {
            console.error("Failed to decode base64 profile", e);
        }
    }
    return new Uint8Array();
};

const deleteAppId = async (appId) => {
    try {
        await showConfirmDialog({ title: "Delete App ID", message: `Delete ${appId.name || appId.identifier}?` });
    } catch (e) {
        return;
    }
    const toast = showLoadingToast({ message: "Deleting...", duration: 0, forbidClick: true });
    try {
        const session = await shared.getSession();
        const currentTeam = await shared.getSelectedTeam();
        await session.deleteAppId(DeveloperDeviceType.Ios, currentTeam, appId.appIdId);
        emit("refresh");
        showNotify({ type: "success", message: "Deleted" });
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        closeToast();
    }
};

const downloadProfile = async (appId) => {
    const toast = showLoadingToast({ message: "Downloading profile...", duration: 0, forbidClick: true });
    let isDownloaded = false
    try {
        const session = await shared.getSession();
        const currentTeam = await shared.getSelectedTeam();
        const profile = await session.downloadTeamProvisioningProfile(DeveloperDeviceType.Ios, currentTeam, appId);
        const bytes = decodeProfile(profile?.encodedProfile);
        const blob = new Blob([bytes], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${profile?.name || appId.name || "provision"}.mobileprovision`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        isDownloaded = true
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        closeToast();
    }
    if(isDownloaded) {
        showSuccessToast({message: "Profile Saved"})
    }
};

const loadCapabilities = async (showToast = true) => {
    capabilityLoading.value = true;
    if (showToast) {
        showLoadingToast({ message: "Loading entitlements...", duration: 0, forbidClick: true });
    }
    try {
        const session = await shared.getSession();
        team.value = await shared.getSelectedTeam();
        const res = await session.v1GetBundleCapabilities(team.value, props.appId);

        const enabledSet = new Set(res.getEnabledCapabilities());
        capabilityStates.value = supportedCapabilities.reduce((acc, cap) => {
            acc[cap.id] = enabledSet.has(cap.id);
            return acc;
        }, {});
        assignedAppGroups.value = res.getAppGroups() || [];
        syncSelectedGroups();
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        capabilityLoading.value = false;
        if (showToast) {
            closeToast();
        }
    }
};

const toggleCapability = async (capabilityId, enabled) => {
    const previous = capabilityStates.value[capabilityId];
    capabilityStates.value = { ...capabilityStates.value, [capabilityId]: enabled };
    capabilityLoading.value = true;
    showLoadingToast({ message: "Updating entitlement...", duration: 0, forbidClick: true });
    try {
        const session = await shared.getSession();
        const currentTeam = team.value || (await shared.getSelectedTeam());
        team.value = currentTeam;
        await session.v1SetBundleBoolCapability(currentTeam, props.appId, { id: capabilityId }, enabled);
        if (capabilityId === "APP_GROUPS") {
            if (enabled) {
                await loadCapabilities(false);
            } else {
                assignedAppGroups.value = [];
                selectedGroupIds.value = [];
            }
        }
    } catch (e) {
        capabilityStates.value = { ...capabilityStates.value, [capabilityId]: previous };
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        capabilityLoading.value = false;
        closeToast();
    }
};

const openAppGroupSelector = () => {
    syncSelectedGroups();
    appGroupSelectorOpen.value = true;
};

const applyAppGroupSelection = async () => {
    assigningAppGroups.value = true;
    showLoadingToast({ message: "Updating app groups...", duration: 0, forbidClick: true });
    try {
        const session = await shared.getSession();
        const currentTeam = team.value || (await shared.getSelectedTeam());
        team.value = currentTeam;
        await session.assignApplicationGroupToAppId(DeveloperDeviceType.Ios, currentTeam, props.appId, selectedGroupIds.value || []);
        await loadCapabilities(false);
        appGroupSelectorOpen.value = false;
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        assigningAppGroups.value = false;
        closeToast();
    }
};

onMounted(() => {
    loadCapabilities();
});

watch(() => props.appId?.appIdId, () => {
    if (props.appId) {
        loadCapabilities();
    }
});

watch(availableAppGroups, () => {
    if (!appGroupSelectorOpen.value) {
        syncSelectedGroups();
    }
});

</script>

<template>
    <CellGroup inset title=" ">
        <Field v-model="props.appId.appIdId" label="App ID ID" readonly />
        <Field v-model="props.appId.identifier" label="Identifier" readonly />
        <Field v-model="expirationDateString" label="Expires" readonly />
    </CellGroup>

    <CellGroup inset title="Entitlements">
        <Cell v-for="cap in supportedCapabilities" :key="cap.id" :title="cap.label" center>
            <template #right-icon>
                <Switch :model-value="capabilityStates[cap.id]"
                            size=" 20px" @change="(val) => toggleCapability(cap.id, val)" :disabled="capabilityLoading" />
            </template>
        </Cell>
        <Cell v-if="capabilityStates.APP_GROUPS" title="App Groups" is-link @click="openAppGroupSelector">
            <template #label>
                <div v-if="assignedAppGroups.length">
                    <div v-for="group in assignedAppGroups" :key="group" >{{ group }}</div>
                </div>
                <div v-else>No app groups assigned</div>
            </template>
        </Cell>

    </CellGroup>

    <Popup v-model:show="appGroupSelectorOpen" round position="bottom" :style="{ height: '70%' }" @click-overlay="appGroupSelectorOpen = false">
        <NavBar title="Assign App Groups" 
            left-arrow @click-left="appGroupSelectorOpen = false"
            right-text="Save" @click-right="applyAppGroupSelection" 
        />
        <div class="app-group-selector">
            <CellGroup inset>
                <div v-if="availableAppGroups.length">
                    <CheckboxGroup v-model="selectedGroupIds" direction="vertical">
                        <Cell v-for="group in availableAppGroups" :key="group.applicationGroup" center>
                            <template #title>
                                <div class="app-group-title">{{ group.name }}</div>
                                <div class="app-group-subtitle">{{ group.identifier }}</div>
                            </template>
                            <template #right-icon>
                                <Checkbox :name="group.applicationGroup" shape="square" />
                            </template>
                        </Cell>
                    </CheckboxGroup>
                </div>
                <Empty v-else description="No Application Groups" :image-size="120" />
            </CellGroup>
        </div>
    </Popup>

    <CellGroup>
        <div style="padding: 12px;">
            <Button size="small" type="primary" block @click.stop="downloadProfile(props.appId)">Download
                Profile</Button>
        </div>
        <div style="padding: 12px; padding-top: 0;">
            <Button size="small" type="danger" block @click.stop="deleteAppId(props.appId)">Delete</Button>
        </div>
    </CellGroup>
</template>

<style>
.app-group-actions {
    margin-top: 8px;
}

.app-group-selector {
    padding: 12px;
}

.app-group-title {
    font-weight: 600;
    font-size: 14px;
}

.app-group-subtitle {
    color: #7a7a7a;
    font-size: 12px;
}

</style>
