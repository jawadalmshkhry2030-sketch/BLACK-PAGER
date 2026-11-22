(() => {
  function updateVolume() {
    $("volumeLabel").textContent =
      "الصوت " + Math.round(pagerVolume * 100) + "%";

    localStorage.setItem("pagerVolume", String(pagerVolume));
  }

  $("volumeUp").onclick = () => {
    pagerVolume = Math.min(1, Math.round((pagerVolume + 0.1) * 10) / 10);
    updateVolume();
  };

  $("volumeDown").onclick = () => {
    pagerVolume = Math.max(0, Math.round((pagerVolume - 0.1) * 10) / 10);
    updateVolume();
  };

  $("volumeToggle").onclick = () => {
    $("volumePanel").classList.toggle("show");
  };

  updateVolume();
})();
