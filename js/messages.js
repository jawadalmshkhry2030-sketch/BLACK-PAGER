(() => {
  function receive(text) {
    if (!powered) return;

    $("message").textContent = text;
    $("state").textContent = "MESSAGE RECEIVED";
    $("notice").textContent = "وصلتك رسالة جديدة";

    setMessageIndicator(true);
    flashPagerScreen();

    if (text.startsWith("جمعت النووي خذ طيارة و تعال")) {
      PagerAudio.nuclearAlarm();
    } else {
      PagerAudio.beep();
    }

    if ("vibrate" in navigator) navigator.vibrate(150);

    if (
      notificationsEnabled &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification("BLACK PAGER", {
        body: text
      });
    }
  }

  socket.on("pager-message", receive);

  window.PagerMessages = { receive };
})();
