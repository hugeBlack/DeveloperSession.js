<script setup>
import { Form, CellGroup, Field, NavBar, Button, Uploader, showNotify, showLoadingToast, closeToast, Sticky } from "vant";
import router from "@/router";
import { reactive, ref, watch } from "vue";
import { AnisetteData } from "@/lib/AnisetteData";
import { AppleAccount } from "@/lib/AppleAccount";
import shared from "@/shared";

const password = ref("")

const files = ref([])
const email = ref('')
const adiConfig = ref({})

const goBack = () =>{
    router.go(-1)
}

// read and show email
watch(files, (newFiles, oldFiles) => {
    if(newFiles.length < 1) {
        email.value = undefined
        adiConfig.value = {}
        return;
    }
    let uploaderFile = newFiles[0]
    let file = uploaderFile?.file
    if(!file) {
        email.value = undefined
        adiConfig.value = {}
        return;
    }
    let fr = new FileReader()
    fr.onload = () => {
        let txt = fr.result
        let txtJson
        try {
            txtJson = JSON.parse(txt)
        } catch(e) {
            showNotify({ type: 'danger', message: "Error reading the account config file." + e});
            files.value = []
            return;
        }
        if(txtJson['local_user'] === undefined) {
            showNotify({ type: 'danger', message: "The account config file does not contain identifier."});
            files.value = []
            return
        }
        if(txtJson['adiPb'] === undefined) {
            showNotify({ type: 'danger', message: "The account config file does not contain adiPb."});
            files.value = []
            return;
        }
        adiConfig.value['identifier'] = txtJson['local_user']
        adiConfig.value['adiPb'] = txtJson['adiPb']
        if('email' in txtJson) {
            email.value = txtJson['email']
        }
        if('password' in txtJson) {
            password.value = txtJson['password']
        }
    }
    fr.onerror = () => {
        showNotify({ type: 'danger', message: "Error reading the account config file."});
        files.value = []
    };
    fr.readAsText(file)
})

async function login() {
    showLoadingToast({
            message: 'Signing in...',
            forbidClick: true,
            duration: 0
    })
    let aniData = new AnisetteData(adiConfig.value['identifier'], adiConfig.value['adiPb'])
    let appleId = new AppleAccount(aniData)
    try {
        let spd = await appleId.emailPasswordLogin(email.value, password.value);
        console.log(spd)
        shared.appleId.value = appleId

        window.localStorage.setItem("spd", JSON.stringify(appleId.spd))
        window.localStorage.setItem("identifier", appleId.anisetteData.anisetteInfo['identifier'])
        window.localStorage.setItem("adi_pb", appleId.anisetteData.anisetteInfo['adi_pb'])

        closeToast();
        router.push("/")
    } catch(e) {
        closeToast();
        showNotify({ type: 'danger', message: e.toString()});
        return;
    }
}

</script>

<template>
    <Sticky>
        <NavBar left-arrow title="Login" @click-left="goBack" />
    </Sticky>


    <CellGroup title="Apple ID Sign In" inset>
        <Field name="uploader" label="Account">
            <template #input>
                <Uploader v-model="files" accept="*" max-count="1">
                    <Button>Select Exported SideStore Account</Button>
                </Uploader>
            </template>
        </Field>
        <Field label="Email"name="email" placeholder="example@example.com" v-model="email" />

        <Field v-model="password" type="password" name="password" label="Password" placeholder="Password"
            :rules="[{ required: true, message: 'Apple ID\'s password is required.' }]" />
    </CellGroup>
    <div style="margin: 16px;">
        <Button round block type="primary" native-type="submit" :disabled="!email || !password || !('identifier' in adiConfig) || !('adiPb' in adiConfig)" @click="login">
            Login
        </Button>
    </div>
</template>

<style>

</style>