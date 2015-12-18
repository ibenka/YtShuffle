(function() {
  "use strict";

  // Initialize the connection to the app
  const appId = "gddfoliippeobljencfionnnkgbnafcc";
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

  // All Mutation Observer and Event Listener have to be disconnected if the connection to
  // the app is disconnected. To achieve this, they are added with a custom function
  // which will add them to a list so they can be removed on disconnect. As this script runs in
  // another context than the site itself, overriding the methods directly is no problem.

  let listenerTracker = [];
  let originalEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(eventName, callback) {
    listenerTracker.push({ target: this, eventName, callback });
    originalEventListener.call(this, eventName, callback);
  };

  let mutationTracker = [];
  let originalMutationObserver = MutationObserver.prototype.observe;
  MutationObserver.prototype.observe = function(target, options) {
    mutationTracker.push(this);
    originalMutationObserver.call(this, target, options);
  };

  let video = document.querySelector("video");

  let previousVideoSource;
  function updateVideo() {
    if (!video.src || video.src === previousVideoSource)
      return;
    previousVideoSource = video.src;

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
      dislUnclicked.addEventListener("click", () =>
          mailbox.send("updateLikes", { disliked: true }));

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
  // to images from s.ytimg.com as this is only a 1*1 pixel image loaded in-between. However,
  // if the app is started, the image is probably already loaded which has to be tested too.
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

  function updateVolume() {
    mailbox.send("updateVolume", {
      volume: parseInt(document.querySelector(".ytp-volume-panel").getAttribute("aria-valuenow")),
      muted: video.muted
    });
  };

  video.addEventListener("volumechange", updateVolume);

  // Adding listeners for app messages.
  // The video is updated according to these messages.

  mailbox.receive("appWindowLoaded", updateVolume);

  mailbox.receive("focusTab", () => {
    chrome.runtime.sendMessage({ task: "focusTab" }, function() {});
  });

  mailbox.receive("clickOnAuthor", () => {
    window.open(document.querySelector(".yt-user-info a").href);
  });

  mailbox.receive("playRandomVideo", () => {
    new MutationObserver(function() {
      let recommendedLink = document.querySelector("a[href='/feed/recommended']");
      if (recommendedLink) {
        recommendedLink.closest(".feed-item-dismissable")
            .querySelector(".shelf-content:first-child a").click();
        this.disconnect();
      }
    }).observe(document.querySelector("#content"), { childList: true, subtree: true });
    document.querySelector("#logo-container").click();
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

  mailbox.receive("changeVolume", volume => {
    // It is not possible to update the volume of the video directly as the youtube slider
    // won't update and the volume won't be saved and will be reset on the next video.
    // Instead, the slider itself has to be moved by fireing mouse events.
    let volumeSlider = document.querySelector(".ytp-volume-slider");
    let sliderPosition = volumeSlider.getBoundingClientRect();
    let width = parseInt(window.getComputedStyle(
        document.querySelector(".ytp-volume-slider-track"), ":after").width);

    let volumeEvent = type => new MouseEvent(type, {
      bubbles: true,
      clientX: volume * width + sliderPosition.left
    });

    volumeSlider.dispatchEvent(volumeEvent("mousedown"));
    volumeSlider.dispatchEvent(volumeEvent("mouseup"));
  });

  mailbox.receive("playlistRequest", () => {
    let playlistBox = document.querySelector("#yt-uix-videoactionmenu-menu");
    function sendPlaylists() {
      let listItems = Array.from(playlistBox.querySelectorAll("ul[role='menu'] li"));
      listItems = listItems.map(item => ({
        checked: item.querySelector("button").getAttribute("aria-checked"),
        name: item.querySelector(".playlist-name").textContent,
        access: item.querySelector(".yt-sprite").getAttribute("class")
            .replace("yt-sprite", "").replace("-icon","").trim(),
        id: item.getAttribute("data-full-list-id")
      }));

      mailbox.send("playlistItems", listItems);
    }

    // The playlists are loaded on the first click on the addto-button.
    // If they are not loaded yet, the button is clicked and a MutationObserver is attached.
    if (!playlistBox.querySelector("ul[role='menu']")) {
      new MutationObserver(function() {
        if (!playlistBox.querySelector("ul[role='menu']"))
          return;
        document.querySelector(".addto-button").click();
        sendPlaylists();
        this.disconnect();
      }).observe(playlistBox, { childList: true, subtree: true });
      document.querySelector(".addto-button").click();
    } else {
      sendPlaylists();
    }
  });

  mailbox.receive("togglePlaylist", id => {
    document.querySelector("#yt-uix-videoactionmenu-menu [data-full-list-id='" + id + "']").click();
  });

  mailbox.receive("updatePlaylistTextbox", text => {
    let input = document.querySelector(".addto-search-box");
    input.value = text;
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });

  mailbox.receive("addToNewPlaylist", privacy => {
    let initialScrollPosition = document.body.scrollTop;
    document.querySelector(".addto-button").click();
    document.querySelector(".create-playlist-item").click();

    let privacyButtons = document.querySelector(".addto-menu .privacy-button-container");
    privacyButtons.querySelector("[data-privacy-state='privacy-" + privacy + "']").click();
    document.querySelector(".create-playlist-buttons .create-button:not([disabled])").click();
    console.log("restoring " + initialScrollPosition);
    document.body.scrollTop = initialScrollPosition;
  });

  // When the app window is closed, this content script should be deleted, so it can be injected
  // again, if the user clicks the page action again.
  // This means that all event listener & mutation observers should be removed.
  port.onDisconnect.addListener(() => {
    listenerTracker.forEach(listener =>
        listener.target.removeEventListener(listener.eventName, listener.callback));
    mutationTracker.forEach(observer => observer.disconnect());
  });
})();
