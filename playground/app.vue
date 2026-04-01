<template>
    <NuxtLayout>
        <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    </NuxtLayout>
</template>

<style>
* {
    box-sizing: border-box;
}

body {
    font-family: -apple-system, sans-serif;
    margin: 0;
    padding: 0;
    background: #f8f7f4;
    color: #1a1a18;
}

/* ── Page transition ── */
.page-enter-active,
.page-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.page-enter-from {
    opacity: 0;
    transform: translateY(6px);
}

.page-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}
</style>
