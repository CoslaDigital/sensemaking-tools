(function bootstrapReport() {
  const payload = window.REPORT_PAYLOAD || {};
  const topics = payload.topics || [];
  const counts = payload.counts || {};

  const topicNav = document.getElementById("topic-nav");
  const topicsRoot = document.getElementById("topics-root");
  const alignmentCards = document.getElementById("alignment-cards");
  const alignmentDescription = document.getElementById("alignment-description");
  const topicsIdentifiedBadge = document.getElementById("topics-identified-badge");
  const tooltip = document.getElementById("tooltip");
  const conversationOverviewChart = document.getElementById("conversation-overview-chart");

  const shareDialog = document.getElementById("share-dialog");
  const shareUrlInput = document.getElementById("share-url");
  const shareTitle = document.getElementById("share-title");
  const shareText = document.getElementById("share-text");
  const shareCopy = document.getElementById("share-copy");

  const drawerDialog = document.getElementById("statements-dialog");
  const drawerTitle = document.getElementById("drawer-title");
  const drawerBody = document.getElementById("drawer-body");

  function number(value) {
    return Number(value || 0).toLocaleString();
  }

  function getTooltipContainer() {
    return drawerDialog.open ? drawerDialog : document.body;
  }

  function ensureTooltipParent() {
    const container = getTooltipContainer();
    if (tooltip.parentElement !== container) {
      container.appendChild(tooltip);
    }
  }

  function showTooltip(event, html) {
    ensureTooltipParent();
    tooltip.innerHTML = html;
    tooltip.classList.remove("hidden");
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
  }

  function hideTooltip() {
    tooltip.classList.add("hidden");
  }

  function resetTooltipParent() {
    hideTooltip();
    if (tooltip.parentElement !== document.body) {
      document.body.appendChild(tooltip);
    }
  }

  function summaryText() {
    return `This report summarizes the results of public input, encompassing ${number(
      counts.totalStatements,
    )} statements and ${number(
      counts.totalVotes,
    )} votes. From the statements submitted, ${number(
      counts.topicNumber,
    )} high level topics were identified, as well as ${number(
      counts.subtopicNumber,
    )} subtopics. All voters were anonymous.`;
  }

  function overviewDefinitionsHtml() {
    return `The report below summarizes points of <span class="tooltip-trigger" data-tooltip="70% or more of participants voted the same way (e.g. 70% agree, or 70% disagree)">high alignment</span>, <span class="tooltip-trigger" data-tooltip="Votes were about split between participants (e.g. 40% agree, 60% disagree, or vice versa)">low alignment</span>, and <span class="tooltip-trigger" data-tooltip="More than 30% of participants voted “Unsure/pass”">uncertainty</span> among participants.`;
  }

  function showShareDialog(sectionId) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const url = sectionId ? `${baseUrl}#${encodeURIComponent(sectionId)}` : baseUrl;
    shareTitle.textContent = sectionId ? `Share ${sectionId}` : "Share report";
    shareText.textContent = "Copy link to share this report section.";
    shareUrlInput.value = url;
    shareDialog.showModal();
  }

  function cardTooltip(statement) {
    const winner =
      statement.passPercent >= statement.agreePercent &&
      statement.passPercent >= statement.disagreePercent
        ? {
            text: `${statement.passPercent}% voted "Unsure/Pass"`,
            className: "pill blank",
          }
        : statement.agreePercent >= statement.disagreePercent
          ? {
              text: `${statement.agreePercent}% voted agree`,
              className: "pill pos",
            }
          : {
              text: `${statement.disagreePercent}% voted disagree`,
              className: "pill neg",
            };

    return `
      <div class="popup-card">
        <div class="popup-top">
          <div class="pills">
            <span class="${winner.className}">${winner.text}</span>
          </div>
          <p class="tooltip-statement">${statement.text || ""}</p>
          ${statement.topics ? `<div class="topic-breakdown">Topic(s): ${statement.topics}</div>` : ""}
        </div>
        <div class="popup-bottom">
          <div class="subheading">${number(statement.voteTotal)} total votes</div>
          <div class="vote-breakdown">
            <div class="vote-type"><span class="vote-dot agree"></span>Agree</div>
            <div>${number(statement.agreeTotal)}</div>
            <div class="vote-type"><span class="vote-dot disagree"></span>Disagree</div>
            <div>${number(statement.disagreeTotal)}</div>
            <div class="vote-type"><span class="vote-dot pass"></span>"Unsure/Pass"</div>
            <div>${number(statement.passTotal)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function statementPillsHtml(statement, type = "") {
    if (type === "high-alignment") {
      const isOverallAgree = statement.agreePercent >= statement.disagreePercent;
      return isOverallAgree
        ? `<span class="pill pos">${statement.agreePercent}% voted agree</span>`
        : `<span class="pill neg">${statement.disagreePercent}% voted disagree</span>`;
    }
    if (type === "low-alignment") {
      return `
        <span class="pill neutral">${statement.agreePercent}% voted agree</span>
        <span class="pill neutral">${statement.disagreePercent}% voted disagree</span>
      `;
    }
    if (type === "high-uncertainty") {
      return `<span class="pill blank">${statement.passPercent}% voted "unsure/pass"</span>`;
    }
    if (type === "uncategorized") {
      return `
        <span class="pill blank">${statement.agreePercent}% voted agree</span>
        <span class="pill blank">${statement.disagreePercent}% voted disagree</span>
      `;
    }
    return `
      <span class="pill">${statement.agreePercent}% agree</span>
      <span class="pill">${statement.disagreePercent}% disagree</span>
      <span class="pill">${statement.passPercent}% unsure/pass</span>
    `;
  }

  function createStatementCard(statement, type = "", options = {}) {
    const truncate = options.truncate !== false;
    const card = document.createElement("article");
    card.className = "statement-card inline-card";
    card.innerHTML = `
      <div class="pills">${statementPillsHtml(statement, type)}</div>
      <p${truncate ? ' class="truncated"' : ""}>${statement.text || ""}</p>
    `;
    card.addEventListener("mousemove", (event) => {
      showTooltip(event, cardTooltip(statement));
    });
    card.addEventListener("mouseleave", hideTooltip);
    return card;
  }

  function alignmentDescriptionHtml(kind) {
    const alignmentString =
      kind === "high"
        ? "highest alignment"
        : kind === "low"
          ? "lowest alignment"
          : "highest uncertainty";
    return `Across <strong>all topics and subtopics</strong>, participants found the ${alignmentString} on the following statements.`;
  }

  function renderAlignment(kind) {
    alignmentDescription.innerHTML = alignmentDescriptionHtml(kind);
    alignmentCards.innerHTML = "";
    const source =
      kind === "high"
        ? payload.alignmentCardsHigh || []
        : kind === "low"
          ? payload.alignmentCardsLow || []
          : payload.alignmentCardsUncertain || [];
    source.forEach((statement) => alignmentCards.appendChild(createStatementCard(statement)));
  }

  function renderStatementGroup(container, statements, type) {
    const group = document.createElement("div");
    group.className = "statement-card-group";
    statements.forEach((statement) => group.appendChild(createStatementCard(statement, type)));
    container.appendChild(group);
  }

  function renderEmptySubtopicSection(container, message) {
    const empty = document.createElement("div");
    empty.className = "subtopic-section-description";
    empty.innerHTML = `
      <span class="info-icon" aria-hidden="true">i</span>
      <p>${message}</p>
    `;
    container.appendChild(empty);
  }

  function renderSubtopicSections(topic, subtopic) {
    const wrapper = document.createElement("div");
    wrapper.className = "subtopic-sections-group";

    const overview = document.createElement("section");
    overview.className = "subtopic-section";
    overview.innerHTML = `
      <div class="subtopic-breakdown">
        <div class="subtopic-breakdown-item">
          <div class="pill">${number(subtopic.commentCount)}</div>
          <div class="subtopic-breakdown-item-text">Total statements</div>
        </div>
        <div class="subtopic-breakdown-item">
          <div class="pill">${number(subtopic.voteCount)}</div>
          <div class="subtopic-breakdown-item-text">Total votes</div>
        </div>
        <div class="breakdown-divider"></div>
        <div class="subtopic-breakdown-description">This subtopic had <strong>${subtopic.relativeAlignment || "--"}</strong> and <strong>${subtopic.relativeEngagement || "--"}</strong> compared to the other subtopics.</div>
      </div>
      <h4>Prominent themes emerged from all statements submitted:</h4>
      <div class="subtopic-themes-group">${subtopic.themesHtml || ""}</div>
    `;
    wrapper.appendChild(overview);

    const highSection = document.createElement("section");
    highSection.className = "subtopic-section";
    highSection.innerHTML = `
      <h4>Participants found the highest alignment on the following statements:</h4>
      <div class="subtopic-section-summary"><p>70% or more of participants agreed or disagreed with these statements.</p></div>
    `;
    if ((subtopic.topHighAlignment || []).length) {
      renderStatementGroup(highSection, subtopic.topHighAlignment, "high-alignment");
    } else {
      renderEmptySubtopicSection(
        highSection,
        'There were no statements in this subtopic that fit within the threshold of "high alignment."',
      );
    }
    wrapper.appendChild(highSection);

    const lowSection = document.createElement("section");
    lowSection.className = "subtopic-section";
    lowSection.innerHTML = `
      <h4>Participants found the lowest alignment on the following statements:</h4>
      <div class="subtopic-section-summary"><p>Opinions were split. 40–60% of voters either agreed or disagreed with these statements.</p></div>
    `;
    if ((subtopic.topLowAlignment || []).length) {
      renderStatementGroup(lowSection, subtopic.topLowAlignment, "low-alignment");
    } else {
      renderEmptySubtopicSection(
        lowSection,
        'There were no statements in this subtopic that fit within the threshold of "low alignment."',
      );
    }
    wrapper.appendChild(lowSection);

    const uncertainSection = document.createElement("section");
    uncertainSection.className = "subtopic-section";
    uncertainSection.innerHTML = `
      <h4>There were high levels of uncertainty on the following statements:</h4>
      <div class="subtopic-section-summary"><p>Statements in this category were among the 25% most passed on in the conversation as a whole or were passed on by at least 20% of participants.</p></div>
    `;
    if ((subtopic.topHighUncertainty || []).length) {
      renderStatementGroup(uncertainSection, subtopic.topHighUncertainty, "high-uncertainty");
    } else {
      renderEmptySubtopicSection(
        uncertainSection,
        'There were no statements in this subtopic that fit within the threshold of "uncertainty."',
      );
    }
    wrapper.appendChild(uncertainSection);

    const viewAllSection = document.createElement("section");
    viewAllSection.className = "subtopic-section centered";
    viewAllSection.innerHTML = `
      <button type="button" class="button icon-button-main" data-drawer="${subtopic.id}">
        View all statements in ${subtopic.name}
      </button>
    `;
    wrapper.appendChild(viewAllSection);

    return wrapper;
  }

  function openSubtopicPanel(subtopicId) {
    const panel = document.getElementById(subtopicId);
    if (!panel) return;
    panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderNav() {
    topicNav.innerHTML = "";
    topics.forEach((topic) => {
      const details = document.createElement("details");
      details.className = "nav-topic";
      details.innerHTML = `
        <summary>
          <div class="nav-item">
            <div class="pill">${number(topic.commentCount)}</div>
            <span class="nav-title" data-scroll="${topic.name}">${topic.name}</span>
          </div>
        </summary>
      `;
      topic.subtopicStats.forEach((subtopic) => {
        const subitem = document.createElement("div");
        subitem.className = "nav-subitem";
        subitem.innerHTML = `
          <div class="pill">${number(subtopic.commentCount)}</div>
          <button type="button" class="nav-subtitle" data-open-subtopic="${subtopic.id}">
            ${subtopic.name}
          </button>
        `;
        details.appendChild(subitem);
      });
      topicNav.appendChild(details);
    });
  }

  const DRAWER_GROUPS = [
    {
      key: "high",
      title: "High alignment statements",
      description:
        "70% or more of participants agreed or disagreed with these statements.",
      type: "high-alignment",
    },
    {
      key: "low",
      title: "Low alignment statements",
      description:
        "Opinions were split. 40–60% of voters either agreed or disagreed with these statements.",
      type: "low-alignment",
    },
    {
      key: "uncertain",
      title: "High uncertainty statements",
      description:
        "Statements in this category were among the 25% most passed on in the conversation as a whole or were passed on by at least 20% of participants.",
      type: "high-uncertainty",
    },
    {
      key: "uncategorized",
      title: "Uncategorized statements",
      description:
        "These statements do not meet criteria for high alignment, low alignment, or high uncertainty.",
      type: "uncategorized",
    },
  ];

  function classifyDrawerStatements(subtopic) {
    const groups = { high: [], low: [], uncertain: [], uncategorized: [] };
    (subtopic.comments || []).forEach((statement) => {
      if (statement.isHighAlignment) {
        groups.high.push(statement);
      } else if (statement.isLowAlignment) {
        groups.low.push(statement);
      } else if (statement.isHighUncertainty) {
        groups.uncertain.push(statement);
      } else {
        groups.uncategorized.push(statement);
      }
    });
    groups.high.sort((a, b) => b.highAlignmentScore - a.highAlignmentScore);
    groups.low.sort((a, b) => b.lowAlignmentScore - a.lowAlignmentScore);
    groups.uncertain.sort((a, b) => b.highUncertaintyScore - a.highUncertaintyScore);
    groups.uncategorized.sort((a, b) => b.agreePercent - a.agreePercent);
    return groups;
  }

  function renderDrawerGroup(container, config, statements) {
    const group = document.createElement("div");
    group.className = "drawer-statement-group";
    group.innerHTML = `
      <h5>${config.title} (${statements.length})</h5>
      <p>${config.description}</p>
    `;
    if (statements.length) {
      const list = document.createElement("div");
      list.className = "drawer-statement-list";
      statements.forEach((statement) => {
        list.appendChild(createStatementCard(statement, config.type, { truncate: false }));
      });
      group.appendChild(list);
    } else {
      const empty = document.createElement("div");
      empty.className = "drawer-empty";
      empty.textContent = "--";
      group.appendChild(empty);
    }
    container.appendChild(group);
  }

  function renderDrawer(subtopic) {
    drawerTitle.textContent = `${subtopic.name} (${number(subtopic.commentCount)})`;
    drawerBody.innerHTML = "";
    const grouped = classifyDrawerStatements(subtopic);
    DRAWER_GROUPS.forEach((config) => {
      renderDrawerGroup(drawerBody, config, grouped[config.key]);
    });
    drawerDialog.showModal();
  }

  function renderTopics() {
    topics.forEach((topic) => {
      const section = document.createElement("section");
      section.className = "card";
      section.id = topic.name;
      const topicChartId = `chart-${topic.name}`;

      section.innerHTML = `
        <div class="card-header">
          <h2>${topic.name}</h2>
          <button type="button" data-share="${topic.name}" class="button subtle">Share</button>
        </div>
        <div class="topic-breakdown-wrapper">
          <div class="topic-breakdown">
            <div class="topic-breakdown-item">
              <div class="pill">${number(topic.subtopicStats.length)}</div>
              <div class="topic-breakdown-item-text">Subtopics</div>
            </div>
            <div class="topic-breakdown-item">
              <div class="pill">${number(topic.commentCount)}</div>
              <div class="topic-breakdown-item-text">Total statements</div>
            </div>
            <div class="topic-breakdown-item">
              <div class="pill">${number(topic.voteCount)}</div>
              <div class="topic-breakdown-item-text">Total votes</div>
            </div>
          </div>
        </div>
        <div class="card-section">
          <div class="toggle-group-wrapper">
            <div class="toggle-row">
              <button
                type="button"
                class="button toggle topic-view-toggle selected"
                data-topic-chart="${topicChartId}"
                data-view="solid"
              >Groupings</button>
              <button
                type="button"
                class="button toggle topic-view-toggle"
                data-topic-chart="${topicChartId}"
                data-view="waffle"
              >Statements</button>
            </div>
          </div>
          <div class="topic-visualization">
            <sensemaker-chart
              id="${topicChartId}"
              chart-type="topic-alignment"
              view="solid"
              topic-filter="${topic.name}"
              colors='["#3A708A", "#589AB7", "#8bc3da", "#757575"]'
            ></sensemaker-chart>
          </div>
        </div>
        <div class="card-section accordion-general"></div>
      `;

      const topicChart = section.querySelector(`#${topicChartId}`);
      if (topicChart) {
        topicChart.data = payload.comments || [];
        topicChart.summaryData = payload.summary || {};
      }

      const accordion = section.querySelector(".accordion-general");
      topic.subtopicStats.forEach((subtopic) => {
        const details = document.createElement("details");
        details.className = "subtopic-panel";
        details.id = subtopic.id;
        const summary = document.createElement("summary");
        summary.innerHTML = `<h3>${subtopic.name}</h3>`;
        details.appendChild(summary);
        details.appendChild(renderSubtopicSections(topic, subtopic));
        details.addEventListener("toggle", () => {
          if (details.open) details.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        accordion.appendChild(details);
      });
      topicsRoot.appendChild(section);
    });
  }

  function wireEvents() {
    document.querySelectorAll("[data-scroll]").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = document.getElementById(element.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    document.querySelectorAll(".nav-title[data-scroll]").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = document.getElementById(element.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    document.querySelectorAll("[data-open-subtopic]").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        openSubtopicPanel(element.dataset.openSubtopic);
      });
    });

    document.querySelectorAll("[data-share]").forEach((element) => {
      element.addEventListener("click", () => showShareDialog(element.dataset.share));
    });

    document.querySelectorAll(".alignment-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        document
          .querySelectorAll(".alignment-toggle")
          .forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        renderAlignment(button.dataset.alignment);
      });
    });

    document.querySelectorAll(".topic-view-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const chartId = button.dataset.topicChart;
        const nextView = button.dataset.view || "solid";
        const topicToggles = document.querySelectorAll(
          `.topic-view-toggle[data-topic-chart="${chartId}"]`,
        );
        topicToggles.forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        const chart = document.getElementById(chartId);
        if (chart) {
          chart.setAttribute("view", nextView);
          // Nudge re-render for environments where attribute-only updates are flaky.
          chart.data = payload.comments || [];
          chart.summaryData = payload.summary || {};
        }
      });
    });

    document.querySelectorAll("[data-drawer]").forEach((button) => {
      button.addEventListener("click", () => {
        const subtopicId = button.dataset.drawer;
        const subtopic = topics
          .flatMap((topic) => topic.subtopicStats || [])
          .find((entry) => entry.id === subtopicId);
        if (subtopic) renderDrawer(subtopic);
      });
    });

    shareCopy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(shareUrlInput.value);
    });
    document.getElementById("share-close").addEventListener("click", () => shareDialog.close());
    document.getElementById("drawer-close").addEventListener("click", () => drawerDialog.close());
    drawerDialog.addEventListener("close", resetTooltipParent);

    document.querySelectorAll(".tooltip-trigger").forEach((element) => {
      element.addEventListener("mousemove", (event) => {
        showTooltip(event, element.dataset.tooltip || "");
      });
      element.addEventListener("mouseleave", hideTooltip);
    });
  }

  document.getElementById("overview-summary").textContent = summaryText();
  document.getElementById("overview-definitions").innerHTML = overviewDefinitionsHtml();
  document.getElementById("metric-statements").textContent = number(counts.totalStatements);
  document.getElementById("metric-votes").textContent = number(counts.totalVotes);
  document.getElementById("metric-topics").textContent = number(counts.topicNumber);
  topicsIdentifiedBadge.textContent = `${number(counts.topicNumber)} topics identified`;

  if (conversationOverviewChart) {
    conversationOverviewChart.data = payload.comments || [];
    conversationOverviewChart.summaryData = payload.summary || {};
  }

  renderNav();
  renderTopics();
  renderAlignment("high");
  wireEvents();
})();
