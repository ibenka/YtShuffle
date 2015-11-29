"use strict";

// Initialize the connection to the app
const appId = "gndbpnglegobododpdekpjmjnilplplg";
let port = chrome.runtime.connect(appId);
let mailbox = {
  send: (task, data) => {
    port.postMessage({
      task, data
    });
  },
  receive: (task, callback) => {
    port.onMessage.addListener(message => {
      if (task === message.task)
        callback(message.data);
    });
  }
};

let video = document.querySelector("video");

function updateVideo() {
  if (!video.src)
    return;

  // When the video src changes, the new video data from ytplayer.config.args is send to the app.
  // As this content script can't access the variables directly, a script tag has to be injected
  // which posts a message with the data which can then be read by this content script.

  window.addEventListener("message", function(message) {
    if (!message.data.YtShuffle_UpdateData)
      return;
    mailbox.send("updateVideo", message.data.YtShuffle_UpdateData);
    window.removeEventListener("message", this);
  });

  let script = document.createElement("script");
  script.textContent = "window.postMessage({ YtShuffle_UpdateData: ytplayer.config.args }, '*')";
  document.head.appendChild(script);

  // The like / dislike buttons are changed for each new video so the event listener has to
  // be added to the new button on each change. Also, the video may already be
  // liked or disliked, so this information is sent on video change too.

  function updateLikeStatus() {
    let likeClicked = document.querySelector(".like-button-renderer-like-button-clicked");
    let likeUnclicked = document.querySelector(".like-button-renderer-like-button-unclicked");
    let dislClicked = document.querySelector(".like-button-renderer-dislike-button-clicked");
    let dislUnclicked = document.querySelector(".like-button-renderer-dislike-button-unclicked");

    likeClicked.addEventListener("click", () => mailbox.send("updateLikes", {}));
    likeUnclicked.addEventListener("click", () => mailbox.send("updateLikes", { liked: true }));
    dislClicked.addEventListener("click", () => mailbox.send("updateLikes", {}));
    dislUnclicked.addEventListener("click", () => mailbox.send("updateLikes", { disliked: true }));

    if (window.getComputedStyle(likeClicked).display !== "none")
      mailbox.send("updateLikes", { liked: true });
    else if (window.getComputedStyle(dislClicked).display !== "none")
      mailbox.send("updateLikes", { disliked: true });
    else
      mailbox.send("updateLikes", {});
  }

  if (document.querySelector(".like-button-renderer-like-button-clicked"))
    updateLikeStatus();
  else
    new MutationObserver(() => {
      if (document.querySelector(".like-button-renderer-like-button-clicked"))
        updateLikeStatus();
    }).observe(document.querySelector("#content"), { childList: true, subtree: true });
}

new MutationObserver(updateVideo).observe(video, { attributes: true });
mailbox.receive("appWindowLoaded", updateVideo);

// The author image loads after the video is updated so there has to be a seperated listener.
// When the src of the author image is changed, the change is send to the app with an exception
// to images from s.ytimg.com as this is only a 1*1 pixel image loaded in-between.
// However, if the app is started, the image is probably already loaded which has to be tested too.
let lastAuthorImg;
function getAuthorImg() {
  let img = document.querySelector("#watch-header .yt-thumb-clip img");
  if (!img || img === lastAuthorImg || !img.src || img.src.startsWith("https://s.ytimg.com"))
    return;
  mailbox.send("updateAuthorImage", img.src);
  lastAuthorImg = img;
}

new MutationObserver(getAuthorImg).observe(document.querySelector("#content"),
    { attributes: true, subtree: true });
mailbox.receive("appWindowLoaded", getAuthorImg);

// Adding the listeners for different video update events.
// These updates are send to the app.

video.addEventListener("timeupdate", () => {
  mailbox.send("updateTime", video.currentTime);
});

video.addEventListener("progress", () => {
  let ranges = video.buffered;
  let time = video.currentTime;
  for (let i = 0; i < ranges.length; i++)
    if (ranges.start(i) <= time && time <= ranges.end(i))
      return mailbox.send("updateBuffer", ranges.end(i));
});

video.addEventListener("durationchange", () => {
  mailbox.send("updateTotalTime", video.duration);
});

// Adding listeners for app messages.
// The video is updated according to these messages.

mailbox.receive("focusTab", () => {
  chrome.runtime.sendMessage({ task: "focusTab" }, function() {});
});

mailbox.receive("clickOnAuthor", () => {
  window.open(document.querySelector(".yt-user-info a").href);
});

mailbox.receive("playRandomVideo", () => {
  // TODO
});

mailbox.receive("playPreviousVideo", () => {
  let button = document.querySelector(".ytp-prev-button");
	if (!button || button.style.display === "none")
    video.currentTime = 0;
	else
    button.click();
});

mailbox.receive("toggleVideo", () => {
  video.paused ? video.play() : video.pause();
});

mailbox.receive("playNextVideo", () => {
  document.querySelector(".ytp-next-button").click();
});

mailbox.receive("toggleVideoMute", () => {
  document.querySelector(".ytp-mute-button").click();
});

mailbox.receive("toggleLike", () => {
  let likeBtnClicked = document.querySelector(".like-button-renderer-like-button-clicked");
  let likeBtnUnclicked = document.querySelector(".like-button-renderer-like-button-unclicked");

  if (window.getComputedStyle(likeBtnClicked).getPropertyValue("display") === "none")
    likeBtnUnclicked.click();
  else
    likeBtnClicked.click();
});

mailbox.receive("toggleDislike", () => {
  let dislBtnClicked = document.querySelector(".like-button-renderer-dislike-button-clicked");
	let dislBtnUnclicked = document.querySelector(".like-button-renderer-dislike-button-unclicked");

	if (window.getComputedStyle(dislBtnClicked).getPropertyValue("display") === "none")
		dislBtnUnclicked.click();
	else
		dislBtnClicked.click();
});

mailbox.receive("changeVideoTime", time => {
  video.currentTime = time;
});
