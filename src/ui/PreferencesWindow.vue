<template>
  <main class="preferences-surface">
    <header class="preferences-titlebar" data-tauri-drag-region>
      <div>
        <p class="eyebrow">OH MY PETS</p>
        <h1>偏好设置</h1>
      </div>
      <span>macOS 预览候选版</span>
    </header>

    <section class="preferences-placeholder" aria-labelledby="preferences-next">
      <p class="section-label">PRODUCT SHELL</p>
      <h2 id="preferences-next">桌宠窗口已独立运行</h2>
      <p>
        活动频率、安静模式、开机启动与诊断入口将在后续候选版票据中接入。
        关闭本窗口不会退出宠物或菜单栏。
      </p>
    </section>

    <section class="developer-entry" aria-labelledby="developer-entry-title">
      <div>
        <p class="section-label">DEVELOPER</p>
        <h2 id="developer-entry-title">高级开发预览</h2>
        <p>保留当前宠物包校验、动作时间线与诊断工作台，仅从此受控入口进入。</p>
      </div>
      <a class="developer-link" href="?surface=developer">打开开发预览</a>
    </section>
  </main>
</template>
