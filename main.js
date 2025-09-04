// ==UserScript==
// @name         Bilibili Video List Summary
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Calculates and displays video list summary at the TOP of the video description text. Ensures description container height is auto.
// @match        *://www.bilibili.com/video/BV*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- Selectors ---
    const LIST_PRESENCE_SELECTOR = '.video-pod__list'; // To find the video list
    const DURATION_ITEM_SELECTOR = '.video-pod__list .stat-item.duration'; // To get durations
    const DESCRIPTION_TEXT_SELECTOR = 'span.desc-info-text'; // Target for insertion
    const DESCRIPTION_CONTAINER_SELECTOR = '#v_desc'; // Element to observe for changes
    const DESC_BASIC_INFO_SELECTOR = '.basic-desc-info'; // Parent div to set height auto

    // --- Constants ---
    const SUMMARY_PREFIX = '[合集统计]'; // Unique identifier for our text
    // Use a simpler marker for easier regex handling
    const SUMMARY_MARKER = '<!-- BILI_SUMMARY -->';

    // --- State ---
    let observer = null; // MutationObserver instance
    let debounceTimer = null; // For debouncing observer callback

    // --- Function to Calculate Summary String ---
    function calculateSummaryString() {
        const durationElements = document.querySelectorAll(DURATION_ITEM_SELECTOR);
        if (!durationElements.length) return null;

        let totalSeconds = 0;
        const videoCount = durationElements.length;
        durationElements.forEach(el => { /* ... standard parsing logic ... */
            const timeString = el.textContent.trim();
            const parts = timeString.split(':');
            if (parts.length === 2) {
                const minutes = parseInt(parts[0], 10);
                const seconds = parseInt(parts[1], 10);
                if (!isNaN(minutes) && !isNaN(seconds)) totalSeconds += (minutes * 60) + seconds;
            } else if (parts.length === 3) {
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const seconds = parseInt(parts[2], 10);
                if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) totalSeconds += (hours * 3600) + (minutes * 60) + seconds;
            }
        });

        if (videoCount === 0 || totalSeconds === 0) return null;

        const totalHours = Math.floor(totalSeconds / 3600);
        const totalMinutes = Math.floor((totalSeconds % 3600) / 60);
        const remainingSecondsTotal = totalSeconds % 60;
        const averageSecondsTotal = totalSeconds / videoCount;
        const avgMinutes = Math.floor(averageSecondsTotal / 60);
        const avgSeconds = Math.round(averageSecondsTotal % 60);
        return `共 ${videoCount} P · 总 ${totalHours > 0 ? `${totalHours} 时 ${totalMinutes} 分` : `${totalMinutes} 分 ${remainingSecondsTotal} 秒`} · 平均 ${avgMinutes} 分 ${avgSeconds} 秒/P`;
    }

    // --- Function to Update Description ---
    function updateDescriptionWithSummary() {
        const descSpan = document.querySelector(DESCRIPTION_TEXT_SELECTOR);
        const descContainer = document.querySelector(DESCRIPTION_CONTAINER_SELECTOR); // For observer
        const basicInfoDiv = descContainer ? descContainer.querySelector(DESC_BASIC_INFO_SELECTOR) : null; // Div to set height

        if (!descSpan || !descContainer || !basicInfoDiv) {
             console.log("Bilibili Summary: Description elements (span, container, basic-info) not found.");
             if(observer) { observer.disconnect(); observer = null; }
            return;
        }

        // Calculate latest summary data
        const summaryDataString = calculateSummaryString();

        // Get current HTML and clean previously inserted summary (if any)
        let currentHTML = descSpan.innerHTML;
        // Escape prefix and marker for regex
        const prefixEscaped = SUMMARY_PREFIX.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const markerEscaped = SUMMARY_MARKER.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Regex to find our summary line: prefix, any chars, marker, optional <br>s
        const removalRegex = new RegExp(`^\\s*${prefixEscaped}.*?${markerEscaped}(\\s*<br>\\s*)*`, 'si');
        let originalContent = currentHTML.replace(removalRegex, '').trim(); // Remove our old summary from the start

        let finalHTML;

        if (summaryDataString) {
            // Construct the new summary line to prepend
            const summaryLine = `${SUMMARY_PREFIX} ${summaryDataString}${SUMMARY_MARKER}<br><br>`;
            // Combine: New summary + original content
            finalHTML = summaryLine + originalContent;
        } else {
            // If no summary data, just use the cleaned original content
            finalHTML = originalContent;
        }

        // Only update DOM if content actually changed
        if (descSpan.innerHTML !== finalHTML) {
            console.log("Bilibili Summary: Updating description HTML.");
            descSpan.innerHTML = finalHTML;
        }

        // Ensure parent div height is auto
        if (basicInfoDiv.style.height !== 'auto') {
            console.log("Bilibili Summary: Setting .basic-desc-info height to auto.");
            basicInfoDiv.style.height = 'auto';
        }

         // Ensure observer is running on the description container
         setupObserver(descContainer);
    }

    // --- Function to set up the MutationObserver ---
    function setupObserver(targetNode) {
        if (!targetNode) return;
        if (observer && observer.target === targetNode) return;
        if (observer) observer.disconnect();

        const config = { childList: true, subtree: true, characterData: true };
        const callback = function(mutationsList, obs) {
             let relevantMutation = false;
             for (const mutation of mutationsList) {
                  if (mutation.type === 'characterData' || mutation.type === 'childList') {
                       if (targetNode.contains(mutation.target) || Array.from(mutation.addedNodes).some(n => targetNode.contains(n)) || Array.from(mutation.removedNodes).some(n => targetNode.contains(n))) {
                           relevantMutation = true;
                           break;
                       }
                   }
             }
             if (relevantMutation) {
                 clearTimeout(debounceTimer);
                 debounceTimer = setTimeout(() => {
                     console.log("Bilibili Summary: Description mutation detected, re-validating summary and height.");
                     updateDescriptionWithSummary(); // Re-run the logic
                 }, 300);
             }
        };

        observer = new MutationObserver(callback);
        observer.observe(targetNode, config);
        observer.target = targetNode;
        console.log(`Bilibili Summary: MutationObserver started/restarted on ${DESCRIPTION_CONTAINER_SELECTOR}.`);
    }

    // --- Function to wait for initial elements ---
    function waitForInitialElements(selectors, callback) {
        const C_INTERVAL = 200;
        const C_TIMEOUT = 25000;
        let timePassed = 0;
        if (window.biliSummaryInterval) clearInterval(window.biliSummaryInterval);

        const interval = setInterval(function() {
            timePassed += C_INTERVAL;
            let allFound = true;
            let missingSelector = null;
            for (const selector of selectors) {
                if (!document.querySelector(selector)) {
                    allFound = false;
                    missingSelector = selector;
                    break;
                }
            }

            if (allFound) {
                clearInterval(interval);
                window.biliSummaryInterval = null;
                console.log("Bilibili Summary: Initial elements found for desc top update + height.");
                setTimeout(callback, 500); // Run update logic
            } else if (timePassed >= C_TIMEOUT) {
                clearInterval(interval);
                window.biliSummaryInterval = null;
                console.warn(`Bilibili Summary: Timed out waiting for initial elements. Missing: ${missingSelector || 'unknown'}`);
            }
        }, C_INTERVAL);
         window.biliSummaryInterval = interval;
    }

    // --- Start the process ---
    // Wait for list (calc), desc span (target), desc container (observer), basic info div (height)
    waitForInitialElements([
        LIST_PRESENCE_SELECTOR,
        DESCRIPTION_TEXT_SELECTOR,
        DESCRIPTION_CONTAINER_SELECTOR,
        DESC_BASIC_INFO_SELECTOR
    ], updateDescriptionWithSummary);

})();