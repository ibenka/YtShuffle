// This script contains code which is only responsible for styling the DOM
// and does not communicate with the content script.

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#progressSlider").addEventListener("mousemove", function(event) {
    let percentage = (event.clientX - this.getBoundingClientRect().left) / this.offsetWidth;
    let time = parseInt(percentage * this.max);
    let minutes = Math.floor(time / 60);
    let seconds = time % 60;
    if (seconds < 10)
      seconds = "0" + seconds;
    let formattedTime = minutes + ":" + seconds;

    let popup = document.querySelector("#timePopup");
    popup.textContent = formattedTime;
    popup.style.left = event.clientX + "px";
    popup.style.top = event.clientY + "px";
  });
});
