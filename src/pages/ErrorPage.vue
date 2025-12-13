<script setup>
import router from "@/router";

const goBack = () =>{
    router.go(-1)
}

</script>

<template>
    <div class="pageWrapper">
        <div class="contentWrapper">
            <div class="errorMsg"><i class="fi fi-sr-info"></i><span>Not Found</span></div>
            <el-button type="primary" @click="goBack" round>Go Back</el-button>
        </div>


    </div>
</template>

<style>
.pageWrapper {
    height: 100vh;
    width: 100vw;
    box-sizing: border-box;
    background-color: var(--el-color-primary-light-9);
    display: flex;
    justify-content: center;
    align-items: center;
}

.contentWrapper{
    text-align: center;
}

.errorMsg{
    font-size: 20px;
    margin-bottom: 20px;
}
</style>