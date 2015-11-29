"use strict";

let alreadyInjectedIds = [];

// Registers the pageAction for youtube watch urls
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            schemes: [ "https" ],
            hostEquals: "www.youtube.com",
            pathEquals: "/watch"
          }
        })
      ],
      actions: [ new chrome.declarativeContent.ShowPageAction() ]
    }]);
  });
});

// When the page action is clicked, the script is injected
chrome.pageAction.onClicked.addListener(tab => {
  chrome.tabs.executeScript({
    file: "inject.js"
  });
});

// Focuses the tab on request of a content script
chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.task === "focusTab") {
    chrome.tabs.update(sender.tab.id, { highlighted: true });
    chrome.windows.update(sender.tab.windowId, { focused: true });
  }
});
