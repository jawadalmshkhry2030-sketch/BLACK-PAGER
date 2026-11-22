(() => {
  function updateNotificationUI() {
    const button = $("enableNotifications");
    const label = $("notificationLabel");
    if (!button || !label) return;

    const available = "Notification" in window;
    const active = available &&
      Notification.permission === "granted" &&
      notificationsEnabled;

    button.classList.toggle("active", active);
    label.textContent = active ? "الإشعارات مفعلة" : "الإشعارات متوقفة";
  }

  $("enableNotifications").onclick = async () => {
    if (!("Notification" in window)) {
      $("notice").textContent = "المتصفح لا يدعم الإشعارات";
      return;
    }

    if (Notification.permission === "denied") {
      $("notice").textContent = "الإشعارات محظورة من إعدادات المتصفح";
      return;
    }

    if (!notificationsEnabled) {
      notificationsEnabled = true;
    }

    const permission = await Notification.requestPermission();

    notificationsEnabled = permission === "granted";
    localStorage.setItem(
      "pagerNotifications",
      String(notificationsEnabled)
    );

    updateNotificationUI();
    $("notice").textContent = notificationsEnabled
      ? "تم تفعيل الإشعارات"
      : "لم يتم منح إذن الإشعارات";
  };

  updateNotificationUI();

  window.PagerNotifications = { updateNotificationUI };
})();
