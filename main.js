// ==UserScript==
// @name         Bilibili Video List Summary 
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  在视频简介的第一行显示合集统计信息
// @match        https://www.bilibili.com/video/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置 ---
    const CONSTANTS = {
        LIST_ITEMS: '.video-pod__list .stat-item.duration', // 列表时长元素
        // 这里的选择器非常关键：必须定位到简介文本的最内层容器
        DESC_TEXT_CONTAINER: '#v_desc .basic-desc-info > span',
        SUMMARY_ID: 'bili-list-summary-inline'
    };

    // --- 核心逻辑 ---

    function calculateSummary() {
        const durationElements = document.querySelectorAll(CONSTANTS.LIST_ITEMS);
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

        // 返回纯文本数据
        return { count, total: formatTime(totalSeconds), avg: formatTime(avgSeconds) };
    }

    function renderSummary() {
        // 1. 寻找简介文本的父级容器 (span)
        const textContainer = document.querySelector(CONSTANTS.DESC_TEXT_CONTAINER);
        if (!textContainer) return;

        // 2. 检查是否已经插入过，避免重复插入导致死循环
        let summarySpan = document.getElementById(CONSTANTS.SUMMARY_ID);

        // 3. 计算数据
        const data = calculateSummary();

        // 如果不是合集视频（无数据），且存在旧的统计标签，则移除
        if (!data) {
            if (summarySpan) summarySpan.remove();
            return;
        }

        // 4. 构建显示内容
        // 注意：样式直接继承父级 (inherit)，加粗以示区分，最后加两个换行符模拟“第一行”效果
        if (!summarySpan) {
            summarySpan = document.createElement('span');
            summarySpan.id = CONSTANTS.SUMMARY_ID;
            summarySpan.style.fontWeight = 'bold';
            summarySpan.style.color = 'inherit'; // 继承B站简介颜色
            summarySpan.style.fontSize = 'inherit'; // 继承B站简介字体大小
            summarySpan.style.lineHeight = 'inherit';
            summarySpan.style.marginRight = '10px';

            // 关键：插入到文本容器的最前面 (prepend)
            // 这样它就变成了简介文本的一部分，不会破坏 DOM 树结构
            textContainer.prepend(summarySpan);
        }

        // 生成文本内容
        const newText = `[合集统计] ${data.count}P · 总${data.total} · 平均${data.avg}/P`;

        // 仅当内容变动时更新，防止光标跳动或反复重绘
        // 后面加上 \n\n 也就是 HTML 中的 <br> 效果，让它独占一行
        const finalHtml = `${newText}<br><br>`;

        if (summarySpan.innerHTML !== finalHtml) {
            summarySpan.innerHTML = finalHtml;
        }
    }

    // --- 观察者 ---
    // B站简介点击“展开”后，DOM会被Vue重置，所以需要高频监测
    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
        // 过滤掉我们自己引起的变动，防止死循环
        const isMyMutation = mutations.some(m => m.target.id === CONSTANTS.SUMMARY_ID || (m.target.parentNode && m.target.parentNode.id === CONSTANTS.SUMMARY_ID));
        if (isMyMutation) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (document.querySelector('.video-pod__list')) {
                renderSummary();
            }
        }, 200);
    });

    function init() {
        // 延迟一点执行，确保B站主要框架加载完毕
        setTimeout(renderSummary, 1000);

        // 监听 body，应对 SPA 页面切换和简介展开/收起
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true // 监听文字变化
        });
    }

    init();

})();
