<template>
  <div id="brick-app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
</script>

<style>
:root {
  --primary-blue: #0070C0;
  --primary-blue-light: #0080CB;
  --primary-blue-dark: #005a99;
  --primary-gradient: linear-gradient(135deg, #0070C0 0%, #0080CB 100%);
  --primary-gradient-hover: linear-gradient(135deg, #005a99 0%, #0070C0 100%);
  --primary-dark: #003a66;
  --primary-light: #d6ebf7;
  --bg-color: #f4faff;
  --card-shadow: 0 4px 24px rgba(0, 112, 192, 0.08);
  --el-color-primary: #0070C0;
  --el-color-primary-light-3: #0080CB;
  --el-color-primary-light-5: #4ba8de;
  --el-color-primary-light-7: #99c8e8;
  --el-color-primary-light-9: #e6f2fb;
  --el-color-primary-dark-2: #005a99;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html { scroll-behavior: smooth; }

body {
  font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  background: var(--bg-color);
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(0,112,192,.03) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(0,112,192,.04) 0%, transparent 50%);
  color: #333;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#brick-app {
  min-height: 100vh;
}

.el-button--primary {
  --el-button-bg-color: #0070C0;
  --el-button-border-color: #0070C0;
  --el-button-hover-bg-color: #005a99;
  --el-button-hover-border-color: #005a99;
  --el-button-active-bg-color: #1e40af;
  --el-button-active-border-color: #1e40af;
}

.el-button {
  border-radius: 8px !important;
  font-weight: 500;
}

.el-progress__text { font-size: 13px !important; font-weight: 600; }

.el-divider { border-top-color: #d6ebf7 !important; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #c0d0e0; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #a0b4cc; }

::selection { background: #bfdbfe; color: #003a66; }

/* Global: suppress stray upload list items */
.el-upload-list { display: none !important; }

/* ===================== MOBILE GLOBAL STYLES ===================== */
/* Safe area for notched devices (iPhone X+) */
@supports (padding: env(safe-area-inset-bottom)) {
  body {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}

/* Touch device optimizations */
@media (hover: none) and (pointer: coarse) {
  /* Disable hover effects on touch */
  * {
    -webkit-tap-highlight-color: transparent;
  }
  
  /* Larger touch targets */
  .el-button {
    min-height: 44px;
    padding: 10px 16px;
  }
  
  .el-input__wrapper {
    min-height: 44px;
  }
  
  .el-input-number {
    min-height: 44px;
  }
  
  /* Prevent zoom on input focus (iOS) */
  input, select, textarea {
    font-size: 16px !important;
  }
  
  /* Better scrolling */
  .el-table__body-wrapper {
    -webkit-overflow-scrolling: touch;
  }
}

/* Mobile scrollbar - hide on touch devices */
@media (max-width: 768px) {
  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: rgba(0, 112, 192, 0.3);
  }
}

/* Prevent horizontal scroll */
html, body {
  overflow-x: hidden;
  max-width: 100vw;
}

/* Element Plus mobile overrides */
@media (max-width: 768px) {
  .el-message-box {
    width: 90% !important;
    max-width: 320px;
  }
  
  .el-message {
    min-width: auto !important;
    max-width: 90vw;
  }
  
  .el-dropdown-menu {
    max-width: 90vw;
  }
  
  .el-table {
    font-size: 12px;
  }
  
  .el-table th, .el-table td {
    padding: 8px 6px;
  }
  
  .el-tag {
    font-size: 11px;
    padding: 0 6px;
    height: 20px;
    line-height: 18px;
  }
  
  .el-divider {
    margin: 16px 0;
  }
  
  .el-col {
    margin-bottom: 12px;
  }
}

/* Small mobile Element Plus */
@media (max-width: 480px) {
  .el-button {
    font-size: 13px;
    padding: 8px 12px;
  }
  
  .el-button--small {
    font-size: 12px;
    padding: 6px 10px;
  }
}

/* Landscape mobile */
@media (max-width: 768px) and (orientation: landscape) {
  .el-message-box {
    max-height: 90vh;
    overflow-y: auto;
  }
}

/* Print styles */
@media print {
  body {
    background: white !important;
  }
  
  .el-button, .el-dropdown {
    display: none !important;
  }
}
</style>
