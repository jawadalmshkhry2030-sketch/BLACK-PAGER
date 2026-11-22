(() => {
  const modal = document.getElementById("pagerModal");
  const phraseInput = document.getElementById("pagerPhrase");
  const numberField = document.getElementById("pagerNumberField");
  const notice = document.getElementById("pagerModalNotice");
  const publish = document.getElementById("pagerPublish");
  let selectedMode = "number";
  let selectedGroup = null;

  function chooseMode(mode) {
    selectedMode = mode;
    document.querySelectorAll(".pager-mode").forEach(button => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    numberField.style.display = mode === "number" ? "block" : "none";
    notice.textContent = "";
  }

  window.openPagerModal = function(group) {
    selectedGroup = group;
    phraseInput.value = "";
    notice.textContent = "";
    chooseMode("number");
    modal.style.display = "flex";
    phraseInput.focus();
  };

  function closeModal() {
    modal.style.display = "none";
    selectedGroup = null;
  }

  document.querySelectorAll(".pager-mode").forEach(button => {
    button.addEventListener("click", () => chooseMode(button.dataset.mode));
  });


  document.getElementById("pagerCancel").onclick = closeModal;

  modal.addEventListener("click", event => {
    if (event.target === modal) closeModal();
  });

  publish.onclick = async () => {
    if (!selectedGroup) return;

    const phrase = phraseInput.value.trim();
    if (!phrase) {
      notice.textContent = "اكتب عبارة البيجر أولاً";
      phraseInput.focus();
      return;
    }

    let finalPhrase = (selectedMode === "number" ? "[[N]]" : "") + phrase;

    if (finalPhrase.length > 200) {
      notice.textContent = "العبارة أطول من الحد المسموح";
      return;
    }

    publish.disabled = true;
    notice.textContent = "جاري النشر...";

    try {
      await api("/api/items", "POST", {
        phrase: finalPhrase,
        group_id: selectedGroup.id
      });

      await loadData();
      closeModal();
      $("notice").textContent = "تم نشر البيجر بنجاح";
    } catch (error) {
      notice.textContent = error.message;
    } finally {
      publish.disabled = false;
    }
  };
})();
