<script setup>
import { ConfigProvider } from 'vant';
import { onMounted, onUnmounted, ref } from 'vue';
const isDarkMode = ref(false)

const detectTheme = (event) => {
    isDarkMode.value = event.matches;

}

onMounted(() => {
    // Check initial preference
    isDarkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Listen for changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', detectTheme);
})

onUnmounted(() => {
    // Clean up the listener when the component is unmounted
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', detectTheme);
})
</script>

<template>
    <ConfigProvider :theme="isDarkMode ? 'dark' : 'light'">
        <RouterView />
    </ConfigProvider>
</template>

<style scoped>

</style>
