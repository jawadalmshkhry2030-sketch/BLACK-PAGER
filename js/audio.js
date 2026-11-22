(() => {
  let pagerAudioContext = null;

  function getAudioContext() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;

    if (!pagerAudioContext) {
      pagerAudioContext = new C();
    }

    if (pagerAudioContext.state === "suspended") {
      pagerAudioContext.resume().catch(() => {});
    }

    return pagerAudioContext;
  }

  function beep() {
    const c = getAudioContext();
    if (!c) return;

    const start = c.currentTime + 0.02;

    [0, 0.22].forEach(offset => {
      const o = c.createOscillator();
      const g = c.createGain();

      o.type = "square";
      o.frequency.value = 880;

      g.gain.setValueAtTime(
        Math.max(0.001, pagerVolume * 0.25),
        start + offset
      );
      g.gain.exponentialRampToValueAtTime(
        0.001,
        start + offset + 0.12
      );

      o.connect(g);
      g.connect(c.destination);

      o.start(start + offset);
      o.stop(start + offset + 0.13);
    });
  }

  function nuclearAlarm() {
    const alarm = new Audio("/sounds/nuclear-alarm.mp3");
    alarm.volume = pagerVolume;
    alarm.play().catch(error => {
      console.warn("تعذر تشغيل صوت الإنذار:", error);
    });
  }

  window.PagerAudio = { beep, nuclearAlarm };
})();
