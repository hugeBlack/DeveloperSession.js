<script setup>
import { computed, onMounted, ref } from "vue";
import { Button, Cell, CellGroup, showConfirmDialog, Empty, Field, NavBar, PullRefresh, showLoadingToast, closeToast, showNotify, Sticky, Popup } from "vant";
import router from "@/router";
import shared from "@/shared";
import { DeveloperDeviceType, AppId } from "@/lib/DeveloperSession";
import AppIdCardView from "@/components/AppIdCardView.vue";

const appIds = ref([]);
const appIdCountLeft = ref(0)
const loading = ref(false);
const refreshing = ref(false);
const creating = ref(false);
const appGroups = ref([]);
const team = ref(undefined);
const newName = ref("");
const newIdentifier = ref("");

const isLoggedIn = computed(() => !!shared.appleId.value);
const operatePopupShow = ref(false)



/**
 * @type {import("vue").Ref<AppId>}
 */
const currentAppId = ref(undefined)

const goBack = () => router.back();



const load = async () => {
    if (!isLoggedIn.value) return;
    loading.value = true;
    try {
        refreshing.value = true;
        const session = await shared.getSession();
        team.value = await shared.getSelectedTeam();
        const [appIdsRes, appGroupsRes] = await Promise.all([
            session.listAppIds(DeveloperDeviceType.Ios, team.value),
            session.listApplicationGroups(DeveloperDeviceType.Ios, team.value)
        ]);
        appIds.value = appIdsRes.appIds || [];
        appIdCountLeft.value = appIdsRes.availableQuantity;
        appGroups.value = appGroupsRes || [];
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        loading.value = false;
        refreshing.value = false;
    }
};

onMounted(load);

const registerAppId = async () => {
    if (!newName.value || !newIdentifier.value) {
        showNotify({ type: "warning", message: "Name and identifier are required" });
        return;
    }
    creating.value = true;
    try {
        const session = await shared.getSession();
        const currentTeam = await shared.getSelectedTeam();
        await session.addAppId(DeveloperDeviceType.Ios, currentTeam, newName.value, newIdentifier.value);
        newName.value = "";
        newIdentifier.value = "";
        await load();
        showNotify({ type: "success", message: "App ID registered" });
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        creating.value = false;
    }
};



const showPopOver = (appId) => {
    currentAppId.value = appId
    operatePopupShow.value = true
}

const handleCardRefresh = async () => {
    operatePopupShow.value = false;
    await load();
}

</script>

<template>
    <div>
        <Sticky>
            <NavBar title="App IDs" left-arrow @click-left="goBack" />
        </Sticky>

        <PullRefresh v-model="refreshing" @refresh="load" style="padding-top: 12px;">
            <CellGroup inset v-if="appIds.length" :title="appIdCountLeft + ' App IDs Remaining' ">
                <Cell v-for="item in appIds" :key="item.appIdId" :title="item.name" :label="item.identifier" is-link
                    class="cell1" @click="showPopOver(item)"/>
            </CellGroup>
            <Empty description="No App IDs" v-else :image-size="120" />
        </PullRefresh>

        <CellGroup inset v-if="isLoggedIn" title=" ">
            <Field v-model="newName" label="Name" placeholder="My App" />
            <Field v-model="newIdentifier" label="Identifier" placeholder="com.example.app" />
            <div style="padding: 12px;">
                <Button block type="primary" :loading="creating" @click="registerAppId">Register App ID</Button>
            </div>
        </CellGroup>

        <Popup :show="operatePopupShow" position="bottom"
  :style="{ height: '80%' }" round v-if="isLoggedIn" @click-overlay="operatePopupShow = false">
            <NavBar :title="currentAppId?.name" left-arrow @click-left="operatePopupShow = false"/>
            <AppIdCardView :app-id="currentAppId" :app-groups="appGroups" @refresh="handleCardRefresh" />

        </Popup>
    </div>
</template>

<style scoped></style>
