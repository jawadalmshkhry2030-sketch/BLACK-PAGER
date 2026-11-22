(() => {
  function updatePowerUI() {
    const powerButton = $("power");
    const powerLabel = $("powerLabel");

    powerButton.classList.toggle("active", powered);
    powerLabel.textContent = powered ? "POWER ON" : "POWER OFF";
    $("state").textContent = powered ? "STANDBY" : "DEVICE OFF";
    $("pagerScreen").classList.toggle("off", !powered);

    if (!powered) {
      $("message").textContent = "";
      setMessageIndicator(false);
      $("alertIndicator").textContent = "MSG STBY";
      $("pagerScreen").classList.remove("flash");
    }
  }

  $("power").onclick = () => {
    powered = !powered;
    updatePowerUI();
  };

  $("clear").onclick = () => {
    $("message").textContent = "";
    setMessageIndicator(false);
    $("notice").textContent = "تم مسح الرسالة";
  };

  updatePowerUI();
})();
