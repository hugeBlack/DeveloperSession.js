<script setup>
import { computed, onMounted, ref } from "vue";
import { Button, Cell, CellGroup, showConfirmDialog, Empty, Field, NavBar, PullRefresh, closeToast, showLoadingToast, showNotify, Sticky } from "vant";
import router from "@/router";
import shared from "@/shared";
import { DeveloperDeviceType } from "@/lib/DeveloperSession";

const groups = ref([]);
const refreshing = ref(false);
const creating = ref(false);
const identifier = ref("");
const name = ref("");

const isLoggedIn = computed(() => !!shared.appleId.value);

const goBack = () => router.back();

const load = async () => {
  if (!isLoggedIn.value) return;
  refreshing.value = true;
  try {
    const session = await shared.getSession();
    const team = await shared.getSelectedTeam();
    groups.value = await session.listApplicationGroups(DeveloperDeviceType.Ios, team);
  } catch (e) {
    showNotify({ type: "danger", message: e?.message || String(e) });
  } finally {
    refreshing.value = false;
  }
};

onMounted(load);

const createGroup = async () => {
  if (!identifier.value || !name.value) {
    showNotify({ type: "warning", message: "Identifier and name are required" });
    return;
  }
  creating.value = true;
  try {
    const session = await shared.getSession();
    const team = await shared.getSelectedTeam();
    await session.addApplicationGroup(DeveloperDeviceType.Ios, team, identifier.value, name.value);
    identifier.value = "";
    name.value = "";
    await load();
    showNotify({ type: "success", message: "Application group created" });
  } catch (e) {
    showNotify({ type: "danger", message: e?.message || String(e) });
  } finally {
    creating.value = false;
  }
};

const deleteGroup = async (group) => {
  try {
    await showConfirmDialog({ title: "Delete Group", message: `Delete ${group.name || group.identifier}?` });
  } catch (e) {
    return;
  }
  const toast = showLoadingToast({ message: "Deleting...", duration: 0, forbidClick: true });
  try {
    const session = await shared.getSession();
    const team = await shared.getSelectedTeam();
    await session.deleteApplicationGroups(DeveloperDeviceType.Ios, team, group);
    await load();
    showNotify({ type: "success", message: "Deleted" });
  } catch (e) {
    showNotify({ type: "danger", message: e?.message || String(e) });
  } finally {
    closeToast();
  }
};
</script>

<template>
  <div>
    <Sticky>
        <NavBar title="Application Groups" left-arrow @click-left="goBack" />
    </Sticky>

    <CellGroup inset v-if="isLoggedIn" title=" ">
      <Field v-model="identifier" label="Identifier" placeholder="group.com.example" />
      <Field v-model="name" label="Name" placeholder="Group Name" />
      <div style="padding: 12px;">
        <Button block type="primary" :loading="creating" @click="createGroup">Create Group</Button>
      </div>
    </CellGroup>

    <PullRefresh v-model="refreshing" @refresh="load" style="padding-top: 12px;">
      <CellGroup inset v-if="groups.length">
        <Cell
          v-for="group in groups"
          :key="group.applicationGroup"
          :title="group.name"
          :label="group.identifier"
        >
          <template #right-icon>
            <Button size="small" type="danger" plain @click.stop="deleteGroup(group)">Delete</Button>
          </template>
        </Cell>
      </CellGroup>
      <Empty v-else description="No Application Groups" :image-size="120" />
    </PullRefresh>
  </div>
</template>

<style scoped>
</style>
