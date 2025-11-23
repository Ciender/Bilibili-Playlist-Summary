// ==UserScript==
// @name         Bilibili Video List Summary (Text Mode)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  在视频简介顶部显示合集统计信息（纯文本模式，修复B站原生报错）
// @match        https://www.bilibili.com/video/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置常量 ---
    const SELECTORS = {
        LIST_ITEMS: '.video-pod__list .stat-item.duration', // 列表时长元素
        WRAPPER: '#v_desc', // 简介的最外层包裹器（插入位置的父级）
        DESC_CONTENT: '.basic-desc-info', // 简介内容的敏感区域（插入位置的兄弟级）
        SUMMARY_ID: 'bili-list-summary-text' // 我们的元素ID
    };

    // --- 样式注入 ---
    const style = document.createElement('style');
    style.innerHTML = `
        /* 统计文本样式：仿原生，无框，一排字 */
        #${SELECTORS.SUMMARY_ID} {
            font-size: 14px;
            color: #18191c; /* B站正文颜色 */
            margin-bottom: 12px; /* 与下方简介拉开一点距离 */
            line-height: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-weight: 500;
        }
        #${SELECTORS.SUMMARY_ID} span.gray-text {
            color: #9499a0; /* 辅助文字灰色 */
            margin: 0 4px;
        }
    `;
    document.head.appendChild(style);

    // --- 核心逻辑 ---

    /**
     * 计算列表统计信息
     */
    function calculateSummary() {
        const durationElements = document.querySelectorAll(SELECTORS.LIST_ITEMS);
        const count = durationElements.length;

        if (count === 0) return null;

        let totalSeconds = 0;
        durationElements.forEach(el => {
            const timeParts = el.textContent.trim().split(':').map(Number);
            let seconds = 0;
            if (timeParts.length === 2) {
                seconds = timeParts[0] * 60 + timeParts[1];
            } else if (timeParts.length === 3) {
                seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
            }
            if (!isNaN(seconds)) totalSeconds += seconds;
        });

        if (totalSeconds === 0) return null;

        const formatTime = (sec) => {
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = Math.round(sec % 60);
            return h > 0 ? `${h}小时${m}分` : `${m}分${s}秒`;
        };

        const avgSeconds = totalSeconds / count;

        // 生成纯文本风格的 HTML
        return `[合集统计] <span class="gray-text">·</span> 共 ${count} P <span class="gray-text">·</span> 总 ${formatTime(totalSeconds)} <span class="gray-text">·</span> 平均 ${formatTime(avgSeconds)}/P`;
    }

    /**
     * 渲染逻辑
     */
    function renderSummary() {
        // 1. 找到父容器 (#v_desc)
        const wrapper = document.querySelector(SELECTORS.WRAPPER);
        // 2. 找到兄弟元素 (.basic-desc-info)
        // 注意：我们必须确保插在 basic-desc-info 之前，但不能插在它里面
        const descContent = document.querySelector(SELECTORS.DESC_CONTENT);

        if (!wrapper || !descContent) return;

        const summaryHTML = calculateSummary();
        let summaryEl = document.getElementById(SELECTORS.SUMMARY_ID);

        // 如果没有合集数据（非合集视频），移除已存在的统计条
        if (!summaryHTML) {
            if (summaryEl) summaryEl.remove();
            return;
        }

        // 如果元素不存在，创建它
        if (!summaryEl) {
            summaryEl = document.createElement('div');
            summaryEl.id = SELECTORS.SUMMARY_ID;
            // 关键修改：插入到 wrapper 中，放在 descContent 之前
            // 这样完全不干扰 descContent 内部的“展开更多”计算逻辑
            wrapper.insertBefore(summaryEl, descContent);
        }

        // 仅当内容不同时更新，防止触发不必要的 DOM 变动
        if (summaryEl.innerHTML !== summaryHTML) {
            summaryEl.innerHTML = summaryHTML;
            // console.log('[Bilibili Summary] 统计显示已更新');
        }
    }

    // --- 观察者 ---
    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // 检查列表是否存在，减少不必要的计算
            if (document.querySelector('.video-pod__list')) {
                renderSummary();
            }
        }, 500);
    });

    function init() {
        // 初始运行
        renderSummary();
        // 监听 body 变动 (B站是SPA，页面不刷新)
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    init();

})();
