<script setup lang="ts">
import { provide, ref } from 'vue'

// Provide values for testing at different scopes
// Global scope (provided in root)
provide('theme', 'dark')
provide('appVersion', '1.0.0')

// Complex object for value inspection
const userProfile = ref({
    name: 'Test User',
    settings: {
        theme: 'auto',
        notifications: true,
        language: 'en',
    },
    preferences: {
        layout: 'grid',
        itemsPerPage: 20,
    },
})
provide('userProfile', userProfile)

// This will be shadowed by child component
provide('shadowedKey', 'parent-value')

const updateUserProfile = (): void => {
    userProfile.value = {
        name: 'Updated Name',
        settings: {
            theme: 'light',
            notifications: false,
            language: 'es',
        },
        preferences: {
            layout: 'list',
            itemsPerPage: 50,
        },
    }
}

// Expose for testing
if (import.meta.dev) {
    const win = window as unknown as { __updateUserProfile?: () => void }
    win.__updateUserProfile = updateUserProfile
}
</script>

<template>
    <div>
        <h2>Provide/Inject Verification Test Page</h2>

        <div class="controls">
            <button data-testid="update-user-profile" @click="updateUserProfile">Update User Profile</button>
        </div>

        <div class="component-tree">
            <h3>Component Tree Structure</h3>
            <div class="tree">
                <!-- Root Provider -->
                <div class="tree-node root">
                    <div class="node-header">
                        <strong>RootProvider</strong>
                        <span class="badge">global</span>
                    </div>
                    <div class="provides">Provides: theme, appVersion, userProfile, shadowedKey</div>

                    <!-- Layout Provider -->
                    <div class="tree-node layout">
                        <div class="node-header">
                            <strong>LayoutProvider</strong>
                            <span class="badge">layout</span>
                        </div>
                        <div class="provides">Provides: layoutConfig, sidebarState</div>

                        <!-- Child Component (will shadow theme) -->
                        <div class="tree-node child">
                            <div class="node-header">
                                <strong>ChildComponent</strong>
                                <span class="badge shadow-warning">⚠️ shadows 'theme'</span>
                            </div>
                            <div class="provides">Provides: theme (shadows parent), localState</div>

                            <!-- Deep Consumer (injects from 3 levels up) -->
                            <div class="tree-node deep">
                                <div class="node-header">
                                    <strong>DeepConsumer</strong>
                                    <span class="badge">injects from ancestor</span>
                                </div>
                                <div class="injects">Injects: theme (from RootProvider), userProfile (from RootProvider)</div>
                            </div>
                        </div>
                    </div>

                    <!-- Missing Provider Component -->
                    <div class="tree-node missing">
                        <div class="node-header">
                            <strong>MissingProviderConsumer</strong>
                            <span class="badge error">❌ missing provider</span>
                        </div>
                        <div class="injects">Injects: cartContext (NOT PROVIDED - will show error)</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="info">
            <h3>Testing Instructions</h3>
            <ul>
                <li>Open Nuxt DevTools → Observatory → Provide/Inject Graph</li>
                <li>Verify theme is shadowed (amber warning in child component)</li>
                <li>Verify MissingProviderConsumer shows red node</li>
                <li>Click "Update User Profile" and verify value updates in graph</li>
                <li>Check scope badges (global/layout/component)</li>
                <li>Verify DeepConsumer shows provider chain of 3 levels</li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.controls {
    margin-bottom: 20px;
}

button {
    padding: 8px 16px;
    background-color: #42b883;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

button:hover {
    background-color: #3aa876;
}

.component-tree {
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #fafafa;
    margin-bottom: 20px;
}

.tree {
    font-family: monospace;
    font-size: 14px;
}

.tree-node {
    margin-left: 30px;
    padding: 10px;
    border-left: 2px solid #ddd;
    margin-top: 10px;
}

.tree-node.root {
    margin-left: 0;
    border-left: none;
    background-color: #e8f5e9;
    border-radius: 8px;
}

.tree-node.layout {
    background-color: #e3f2fd;
    border-radius: 8px;
}

.tree-node.child {
    background-color: #fff3e0;
    border-radius: 8px;
}

.tree-node.deep {
    background-color: #f3e5f5;
    border-radius: 8px;
}

.tree-node.missing {
    background-color: #ffebee;
    border-radius: 8px;
    border-left: 3px solid #f44336;
}

.node-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 5px;
}

.badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background-color: #e0e0e0;
    font-family: sans-serif;
}

.badge.shadow-warning {
    background-color: #ff9800;
    color: white;
}

.badge.error {
    background-color: #f44336;
    color: white;
}

.provides,
.injects {
    font-size: 12px;
    color: #666;
    margin-left: 10px;
    padding: 4px;
    font-family: sans-serif;
}

.info {
    padding: 15px;
    background-color: #f5f5f5;
    border-radius: 8px;
}

.info h3 {
    margin-top: 0;
    color: #2c3e50;
}

.info ul {
    margin: 10px 0;
    padding-left: 20px;
}

.info li {
    margin: 5px 0;
    color: #555;
}
</style>
