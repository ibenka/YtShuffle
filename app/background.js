"use strict";

// General helper functions not connected to any specific task
let helper = {
  parseTime: time => {
    time = parseInt(time);
    let minutes = Math.floor(time / 60);
    let seconds = time % 60;
    if (seconds < 10)
      seconds = "0" + seconds;
    return minutes + ":" + seconds;
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

  mailbox.receive("volumeChange", volume => {
    document.querySelector("#volumeSlider").value = volume / maxVolume * 100;
    // TODO
  });

  mailbox.receive("updateLikes", status => {
    document.querySelector("#likeButton").removeAttribute("data-toggled");
    document.querySelector("#dislikeButton").removeAttribute("data-toggled");

    if (status.liked)
      document.querySelector("#likeButton").dataset.toggled = "true";
    else if (status.disliked)
      document.querySelector("#dislikeButton").dataset.toggled = "true";
  });

  // When the user clicks on a button associated with a data-message,
  // the message specified in the attribute is send to the content script.
  let messageButtons = Array.from(document.querySelectorAll("[data-message]"));
  messageButtons.forEach(button => {
    button.addEventListener("click", () => mailbox.send(button.dataset.message));
  });

  // When the user clicks on the close button, the connection and app window will be closed.
  // The content script will take care of deleting itself.
  document.querySelector("#close-icon").addEventListener("click", () => {
    mailbox.port.disconnect();
    window.close();
  });

  // Sends a message to the content script, when the value of the volume slider is changed
  document.querySelector("#volumeSlider").addEventListener("input", function() {
    mailbox.send("changeVolume", this.value / 100);
  });

  // When the user clicks on the video progress bar, the invisible slider on top is triggered
  document.querySelector("#progressSlider").addEventListener("change", function() {
    mailbox.send("changeVideoTime", this.value);
  });
}

// When a new content script connects to the app, a new mailbox and window is created
// for this connection. After the window DOM has loaded, the communication between the
// content script and the window is started.
// It is possible to have multiple app windows and tabs communicating at the same time.
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
    outerBounds: {
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
