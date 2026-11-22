(() => {
  function changeWave(direction) {
    currentWave = (
      (currentWave - 1 + direction + totalWaves) % totalWaves
    ) + 1;

    $("waveLabel").textContent =
      "WAVE " + String(currentWave).padStart(2, "0");

    $("notice").textContent = "جاري تغيير الموجة...";
    socket.emit("join-wave", currentWave);
  }

  $("waveNext").onclick = () => changeWave(1);
  $("wavePrev").onclick = () => changeWave(-1);

  socket.on("connect", () => {
    socket.emit("join-wave", currentWave);
  });

  socket.on("wave-joined", (wave) => {
    $("notice").textContent =
      "تم الاتصال بالموجة WAVE " + String(wave).padStart(2, "0");
  });
})();
