import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: () => import("@/pages/LoginPage.vue")
        },
        {
            path: '/',
            name: 'home',
            component: () => import("@/pages/HomePage.vue")

        },
        {
            path: '/app-ids',
            name: 'appIds',
            component: () => import("@/pages/AppIdPage.vue")
        },
        {
            path: '/application-groups',
            name: 'applicationGroups',
            component: () => import("@/pages/ApplicationGroupsPage.vue")
        },
        {
            path: '/installed-apps',
            name: 'installedApps',
            component: () => import("@/pages/InstalledAppsPage.vue")
        },
        {
            path: '/certificates',
            name: 'certificates',
            component: () => import("@/pages/CertificatesPage.vue")
        },

        { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import("@/pages/ErrorPage.vue") },
    ]
})

export default router
