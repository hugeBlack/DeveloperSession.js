<script setup>
import { computed, onMounted, ref } from "vue";
import { Button, Cell, CellGroup, showConfirmDialog, Empty, Field, NavBar, PullRefresh, showNotify, Sticky } from "vant";
import router from "@/router";
import shared from "@/shared";
import { DeveloperDeviceType, Device } from "@/lib/DeveloperSession";

const devices = ref([]);
const deviceCountLeft = ref(undefined);
const loading = ref(false);
const refreshing = ref(false);
const creating = ref(false);
const deleting = ref(false);
const team = ref(undefined);
const newName = ref("");
const newUdid = ref("");

const isLoggedIn = computed(() => !!shared.appleId.value);

const goBack = () => router.back();

const load = async () => {
    if (!isLoggedIn.value) return;
    loading.value = true;
    try {
        refreshing.value = true;
        const session = await shared.getSession();
        team.value = await shared.getSelectedTeam();
        const devicesRes = await session.listDevices(DeveloperDeviceType.Ios, team.value);
        devices.value = devicesRes?.devices || [];
        deviceCountLeft.value = devicesRes?.availableQuantity;
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        loading.value = false;
        refreshing.value = false;
    }
};

onMounted(load);

const registerDevice = async () => {
    if (!newName.value || !newUdid.value) {
        showNotify({ type: "warning", message: "Name and UDID are required" });
        return;
    }
    creating.value = true;
    try {
        const session = await shared.getSession();
        const currentTeam = await shared.getSelectedTeam();
        await session.addDevice(DeveloperDeviceType.Ios, currentTeam, newName.value, newUdid.value);
        newName.value = "";
        newUdid.value = "";
        await load();
        showNotify({ type: "success", message: "Device registered" });
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        creating.value = false;
    }
};

/**
 * 
 * @param {Device} device
 */
const removeDevice = async (device) => {
    if (deleting.value) return;
    try {
        await showConfirmDialog({
            title: "Remove Device",
            message: `Remove ${device.name} (${device.deviceNumber})?`
        });
    } catch (e) {
        return;
    }

    try {
        deleting.value = true;
        const session = await shared.getSession();
        const currentTeam = await shared.getSelectedTeam();
        await session.deleteDevice(DeveloperDeviceType.Ios, currentTeam, device.deviceId);
        await load();
        showNotify({ type: "success", message: "Device removed" });
    } catch (e) {
        showNotify({ type: "danger", message: e?.message || String(e) });
    } finally {
        deleting.value = false;
    }
};

const deviceCountTitle = computed(() => {
    if (typeof deviceCountLeft.value === "number") {
        return `${deviceCountLeft.value} Devices Remaining`;
    }
    return "Devices";
});
</script>

<template>
    <div>
        <Sticky>
            <NavBar title="Devices" left-arrow @click-left="goBack" />
        </Sticky>

        <PullRefresh v-model="refreshing" @refresh="load" style="padding-top: 12px;">
            <CellGroup inset v-if="devices.length" :title="deviceCountTitle">
                <Cell
                    v-for="item in devices"
                    :key="item.deviceId || item.deviceNumber"
                    :title="item.name"
                    :label="`${item.deviceNumber}${item.deviceId ? ` • ${item.deviceId}` : ''}`"
                    class="cell1"
                >
                    <template #right-icon>
                        <Button size="small" type="danger" plain @click.stop="removeDevice(item)">Delete</Button>
                    </template>
                </Cell>
            </CellGroup>
            <Empty description="No Devices" v-else :image-size="120" />
        </PullRefresh>

        <CellGroup inset v-if="isLoggedIn" title=" ">
            <Field v-model="newName" label="Name" placeholder="My iPhone" />
            <Field v-model="newUdid" label="UDID" placeholder="00008030-xxxxxxxxxxxxxxxx" />
            <div style="padding: 12px;">
                <Button block type="primary" :loading="creating" @click="registerDevice">Register Device</Button>
            </div>
        </CellGroup>
    </div>
</template>

<style scoped></style>
