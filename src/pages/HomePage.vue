<script setup>
import { Button, Cell, CellGroup, NavBar, Field, Popup, Picker, showNotify, Sticky, showLoadingToast, closeToast } from "vant";
import shared from "@/shared";
import router from "@/router";
import { computed, onMounted, ref } from "vue";
import { DeveloperSession, DeveloperTeam } from "@/lib/DeveloperSession";

/**
 * @type {import("vue").Ref<DeveloperTeam[]>}
 */
const teams = ref([])
/**
 * @type {import("vue").Ref<DeveloperTeam>}
 */
const selectedTeam = ref(undefined)
const isLogIn = computed(() => {
    return shared.appleId.value !== undefined
})
const teamPickerColunms = computed(() => {
    return teams.value.map((team, idx) => {
        return {
            'text': team.name,
            'value': idx
        }
    })
})
const teamPickerValues = ref([0])
const showPicker = ref(false)
const teamName = computed(() => selectedTeam.value ? selectedTeam.value.name : '')
const email = ref("")

function topRightButtonClicked() {
    if(isLogIn.value) {
        shared.appleId.value = undefined
        shared.session = undefined
        shared.selectedTeam = undefined

        teams.value = []
        selectedTeam.value = undefined
        shared.clearLocalStorage()
    } else {
        router.push("/login")
    }
}

const reloadTeams = async () => {
    let saveCredentials = false
    if (!(shared.session?.teams) || shared.session?.teams?.length == 0) {
        saveCredentials = true
        showLoadingToast({
            message: 'Loading Teams',
            forbidClick: true,
            duration: 0
        })
    }
    email.value = shared.appleId.value.email
    teams.value = await ((await shared.getSession()).listTeams());
    selectedTeam.value = await shared.getSelectedTeam();
    if (saveCredentials) {
        window.localStorage.setItem("xcodeToken", JSON.stringify(shared.appleId.value.tokens['com.apple.gs.xcode.auth']))
    }
}

onMounted(async ()=> {
    if(isLogIn.value) {
        try {
            await reloadTeams()
        } catch (e) {
            showNotify({ type: 'danger', message: e.toString()});
        } finally {
            closeToast()
        }
    } else {
        try {
            let loadSuccess = shared.loadAccountFromLocalStorage()
            if (loadSuccess) {
                await reloadTeams()
            }
        } catch(e) {
            showNotify({ type: 'danger', message: e.toString()});
        } finally {
            closeToast()
        }
    }
})

const onTeamPickerConfirm = () => {
    showPicker.value = false;
    selectedTeam.value = teams.value[teamPickerValues.value[0]]
    shared.selectedTeam = selectedTeam.value
}

</script>

<template>
    <Sticky>
        <NavBar :right-text="isLogIn ? 'Logout': 'Login'" title="Apple ID Management" @click-right="topRightButtonClicked"/>
    </Sticky>

    <CellGroup v-if="isLogIn" title="Apple ID Management" inset>
        <Cell title="Email" :value="email"/>
        <Cell
            :value="teamName"
            is-link
            readonly
            title="Team"
            placeholder="Select Team"
            @click="showPicker = true"
        />

        <Cell title="App IDs" is-link @click="router.push('/app-ids')" />
        <Cell title="Application Groups" is-link @click="router.push('/application-groups')" />
        <Cell title="Certificates" is-link @click="router.push('/certificates')" />

    </CellGroup>
    <CellGroup title="Utilities" v-if="isLogIn" inset>
        <Cell title="Fix &quot;App is no longer available&quot;" is-link @click="router.push('/installed-apps')" />
    </CellGroup>

    <CellGroup title=" " v-if="!isLogIn" inset>
        <Cell title="Please Log in first." />
    </CellGroup>

    <Popup v-model:show="showPicker" destroy-on-close round position="bottom">
        <Picker
            :model-value="teamPickerValues"
            :columns="teamPickerColunms"
            @cancel="showPicker = false"
            @confirm="onTeamPickerConfirm"
        />
    </Popup>
</template>


<style>

</style>
