(() => {
  function clock() {
    const now = new Date();
    const clockLabel = $("clock");
    const dateLabel = $("dateLabel");

    if (clockLabel) {
      clockLabel.textContent = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    if (dateLabel) {
      dateLabel.textContent = now.toLocaleDateString("en-GB");
    }
  }

  clock();
  setInterval(clock, 1000);
})();
