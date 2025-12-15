<script setup>
import { computed, onMounted, ref } from "vue";
import { Button, Cell, CellGroup, showConfirmDialog, Empty, NavBar, PullRefresh, closeToast, showLoadingToast, showNotify, Sticky } from "vant";
import router from "@/router";
import shared from "@/shared";
import { DeveloperDeviceType } from "@/lib/DeveloperSession";

const certificates = ref([]);
const refreshing = ref(false);

const isLoggedIn = computed(() => !!shared.appleId.value);

const goBack = () => router.back();

const load = async () => {
  if (!isLoggedIn.value) return;
  refreshing.value = true;
  try {
    const session = await shared.getSession();
    const team = await shared.getSelectedTeam();
    certificates.value = await session.listAllDevelopmentCerts(DeveloperDeviceType.Ios, team);
  } catch (e) {
    showNotify({ type: "danger", message: e?.message || String(e) });
  } finally {
    refreshing.value = false;
  }
};

onMounted(load);

const revoke = async (cert) => {
  try {
    await showConfirmDialog({ title: "Revoke Certificate", message: `Revoke ${cert.name}?` });
  } catch (e) {
    return;
  }
  const toast = showLoadingToast({ message: "Revoking...", duration: 0, forbidClick: true });
  try {
    const session = await shared.getSession();
    const team = await shared.getSelectedTeam();
    await session.revokeDevelopmentCert(DeveloperDeviceType.Ios, team, cert.serialNumber);
    await load();
    showNotify({ type: "success", message: "Revoked" });
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
        <NavBar title="Certificates" left-arrow @click-left="goBack" />
    </Sticky>


    <PullRefresh v-model="refreshing" @refresh="load" style="padding-top: 12px;">
      <CellGroup inset v-if="isLoggedIn && certificates.length">
        <Cell
          v-for="cert in certificates"
          :key="cert.serialNumber"
          :title="cert.name"
          :label="`Serial: ${cert.serialNumber} | Machine: ${cert.machineName || 'Unknown'}`"
          class="cell1"
        >
          <template #right-icon>
            <Button size="small" type="danger" plain @click.stop="revoke(cert)">Revoke</Button>
          </template>
        </Cell>
      </CellGroup>
      <CellGroup inset v-else-if="isLoggedIn">
        <Empty description="No certificates" :image-size="120" />
      </CellGroup>
      <CellGroup inset v-else>
        <Cell title="Please login first" />
      </CellGroup>
    </PullRefresh>
  </div>
</template>

<style scoped>
</style>
