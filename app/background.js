"use strict";

// General helper functions not connected to any specific task
let helper = {
  parseTime: time => {
    time = parseInt(time);
    let hours = Math.floor(time / 3600);
    let minutes = Math.floor(time % 3600 / 60);
    let seconds = time % 60;
    return (hours ? hours + ":" : "")
        + (hours && minutes < 10 ? "0" + minutes : minutes) + ":"
        + (seconds < 10 ? "0" + seconds : seconds);
  },
  getImage: (url, callback) => {
    let xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "blob";
    xhr.onload = function() {
      callback(window.URL.createObjectURL(this.response));
    };
    xhr.send();
  }
};

// Starts the communication between the content script behind the mailbox and the appwindow.
function startCommunication(mailbox, appWindow, window, document) {
  let totalTime;
  function updateTotalTime(time) {
    totalTime = parseInt(time);
    document.querySelector("#totalTime").textContent = helper.parseTime(totalTime);
    document.querySelector("#progressSlider").max = totalTime;
  }

  // Updates the document according to the data send from the content script

  mailbox.receive("updateVideo", message => {
    document.querySelector("#author").textContent = message.author;
    document.querySelector("#videotitle").textContent = message.title;
    updateTotalTime(message.length_seconds);
    helper.getImage(message.iurlmq_webp || message.iurlmq, blob => {
      document.querySelector("#background").style["background-image"] = "url('" + blob + "')";
    });
  });

  mailbox.receive("updateAuthorImage", url => {
    helper.getImage(url, blob => (document.querySelector("#authorImg").src = blob));
  });

  mailbox.receive("updateTime", time => {
    document.querySelector("#progressPlayed").style.width = (time / totalTime * 100) + "%";
    document.querySelector("#actualTime").textContent = helper.parseTime(time);
  });

  mailbox.receive("updateBuffer", bufferEnd => {
    document.querySelector("#progressLoaded").style.width = (bufferEnd / totalTime * 100) + "%";
  });

  mailbox.receive("updateTotalTime", time => updateTotalTime(time));

  mailbox.receive("updateVolume", status => {
    // Only update the time if the volume slider isn't hovered because it will jump back
    // and forth while the user drags it otherwise.
    let volumeSlider = document.querySelector("#volumeSlider");
    if (volumeSlider.parentElement.querySelector(":hover") !== volumeSlider)
      volumeSlider.value = status.muted ? 0 : status.volume;

    Array.from(document.querySelectorAll("#volumeIcons img")).forEach(e =>
        e.style.display = "none");
    if (status.volume === 0 || status.muted)
      document.querySelector("#volumeOff").style.display = "block";
    else if (status.volume > 0 && status.volume <= 50)
      document.querySelector("#volumeMedium").style.display = "block";
    else
      document.querySelector("#volumeHigh").style.display = "block";
  });

  mailbox.receive("updateLikes", status => {
    document.querySelector("#likeButton").removeAttribute("data-toggled");
    document.querySelector("#dislikeButton").removeAttribute("data-toggled");

    if (status.liked)
      document.querySelector("#likeButton").dataset.toggled = "true";
    else if (status.disliked)
      document.querySelector("#dislikeButton").dataset.toggled = "true";
  });

  mailbox.receive("playlistItems", playlistItems => {
    let playlistList = document.querySelector("#playlistItems");
    playlistList.innerHTML = "";
    playlistItems.forEach(playlist => {
      let listItem = document.createElement("label");

      let checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = playlist.checked === "checked";
      listItem.appendChild(checkbox);

      let namebox = document.createElement("div");
      namebox.textContent = playlist.name;
      listItem.appendChild(namebox);

      let accessIcon = document.createElement("img");
      accessIcon.src = ({
        private: "icons/private.png",
        unlisted: "icons/unlisted.png",
        public: "icons/public.png"
      })[playlist.access];
      listItem.appendChild(accessIcon);

      listItem.addEventListener("click", () => mailbox.send("togglePlaylist", playlist.id));
      playlistList.appendChild(listItem);
    });
  });

  // Sends messages to the content script according to the user action

  Array.from(document.querySelectorAll("[data-message]")).forEach(button => {
    button.addEventListener("click", () => mailbox.send(button.dataset.message));
  });

  document.querySelector("#close-icon").addEventListener("click", () => {
    mailbox.port.disconnect();
    window.close();
  });

  document.querySelector("#volumeSlider").addEventListener("input", function() {
    mailbox.send("changeVolume", this.value / 100);
  });

  document.querySelector("#progressSlider").addEventListener("change", function() {
    mailbox.send("changeVideoTime", this.value);
  });

  document.querySelector("#addToPlaylist").addEventListener("click", () => {
    mailbox.send("playlistRequest");
  });

  document.querySelector("#playlistTopbar input").addEventListener("input", function() {
    mailbox.send("updatePlaylistTextbox", this.value);
  });

  Array.from(document.querySelectorAll("#playlistPrivacyOverlay button")).forEach(button => {
    button.addEventListener("click", function() {
      mailbox.send("updatePlaylistTextbox", document.querySelector("#playlistTopbar input").value);
      mailbox.send("addToNewPlaylist", this.dataset.privacy);
    });
  });
}

// When a new content script connects to the app, a new mailbox and window is created
// for this connection. After the window DOM has loaded, the communication between the
// content script and the window is started. It is possible to have multiple app windows
// and tabs communicating at the same time.
// It is also possible to have one tab communicate with multiple app windows,
// however this function should probably be removed.
const extensionId = "bneihopkpfcmdbhoocebjaicaefalmoh";
chrome.runtime.onConnectExternal.addListener(port => {
  if (port.sender.id !== extensionId)
    return;

  let mailbox = {
    port,
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

  chrome.app.window.create("window.html", {
    resizable: false,
    frame: { type: "none" },
    innerBounds: {
      width: 320,
      height: 180,
      left: screen.availWidth - 330,
      top: screen.availHeight - 190
    }
  }, window => {
    port.onDisconnect.addListener(() => {
      window.close();
    });

    window.setAlwaysOnTop(true);
    window.contentWindow.document.addEventListener("DOMContentLoaded", () => {
      mailbox.send("appWindowLoaded");
      startCommunication(mailbox, window, window.contentWindow, window.contentWindow.document);
    });
  });
});
