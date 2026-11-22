(() => {
  function renderIndex() {
    const index = $("index");
    index.replaceChildren();

    data.forEach(group => {
      const section = document.createElement("div");
      section.className = "index-group";

      const title = document.createElement("div");
      title.className = "index-title";
      title.textContent = group.title;
      section.appendChild(title);

      group.items.forEach((item, i) => {
        const line = document.createElement("div");
        line.className = "index-item";

        const label = document.createElement("span");
        label.textContent = "بيجر " + (i + 1) + ": ";

        const meaning = document.createElement("span");
        meaning.className = "meaning";
        meaning.textContent = visibleMeaningIds.has(item.id)
          ? (item.phrase.startsWith("[[N]]")
              ? item.phrase.slice(5)
              : item.phrase)
          : "***";

        const toggle = document.createElement("button");
        toggle.className = "meaning-toggle";
        toggle.textContent = visibleMeaningIds.has(item.id)
          ? "إخفاء"
          : "إظهار";

        toggle.onclick = () => {
          if (visibleMeaningIds.has(item.id)) {
            visibleMeaningIds.delete(item.id);
          } else {
            visibleMeaningIds.add(item.id);
          }
          renderIndex();
        };

        line.append(label, meaning, toggle);
        section.appendChild(line);
      });

      index.appendChild(section);
    });
  }

  $("showAll").onclick = () => {
    data.forEach(group => {
      group.items.forEach(item => visibleMeaningIds.add(item.id));
    });
    renderIndex();
  };

  $("hideAll").onclick = () => {
    visibleMeaningIds.clear();
    renderIndex();
  };

  $("indexBtn").onclick = () => {
    if (!$("indexArea").hidden) {
      $("indexArea").hidden = true;
      $("index").replaceChildren();
      $("pass").value = "";
      visibleMeaningIds.clear();
      $("indexBtn").textContent = "فتح الفهرس";
      return;
    }

    if ($("pass").value !== "125874960") {
      $("notice").textContent = "كلمة المرور غير صحيحة";
      return;
    }

    $("indexArea").hidden = false;
    visibleMeaningIds.clear();
    renderIndex();
    $("indexBtn").textContent = "إغلاق الفهرس";
  };

  window.PagerIndex = { renderIndex };
})();
