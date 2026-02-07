<template>
  <div class="app-shell">
    <aside class="app-shell__sidebar">
      <div class="app-shell__brand">
        <div class="app-shell__eyebrow">GraphiteUI</div>
        <h1 class="app-shell__title">Vue Frontend</h1>
      </div>
      <nav class="app-shell__nav">
        <RouterLink to="/" class="app-shell__link">首页</RouterLink>
        <RouterLink to="/editor" class="app-shell__link">编辑器</RouterLink>
        <RouterLink to="/runs" class="app-shell__link">运行记录</RouterLink>
        <RouterLink to="/settings" class="app-shell__link">设置</RouterLink>
      </nav>
    </aside>
    <main class="app-shell__content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  background: linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  color: #3c2914;
}

.app-shell__sidebar {
  border-right: 1px solid rgba(154, 52, 18, 0.12);
  padding: 24px 20px;
  display: grid;
  align-content: start;
  gap: 24px;
  background: rgba(255, 252, 247, 0.78);
  backdrop-filter: blur(10px);
}

.app-shell__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.app-shell__title {
  margin: 6px 0 0;
  font-size: 1.5rem;
}

.app-shell__nav {
  display: grid;
  gap: 10px;
}

.app-shell__link {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  padding: 10px 14px;
  color: inherit;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.72);
}

.app-shell__link.router-link-active {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
}

.app-shell__content {
  min-width: 0;
  padding: 28px;
}
</style>
