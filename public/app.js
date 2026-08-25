document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // State
  let currentJobId = null;
  let activeEventSource = null;
  let projectsCache = [];
  let currentEditingScript = null;
  let currentEditingProjectId = null;

  // DOM Elements
  const navButtons = document.querySelectorAll(".nav-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const inputTabBtns = document.querySelectorAll(".input-tab-btn");
  const inputGroupUrl = document.getElementById("input-group-url");
  const inputGroupText = document.getElementById("input-group-text");
  const inputUrl = document.getElementById("inputUrl");
  const inputText = document.getElementById("inputText");
  const btnCreateVideo = document.getElementById("btnCreateVideo");
  
  const terminalLog = document.getElementById("terminalLog");
  const jobStatusBadge = document.getElementById("jobStatusBadge");
  const stepper = document.getElementById("stepper");

  const resultCard = document.getElementById("resultCard");
  const resultVideoPlayer = document.getElementById("resultVideoPlayer");
  const resultTitle = document.getElementById("resultTitle");
  const resultMeta = document.getElementById("resultMeta");
  const btnDownloadVideo = document.getElementById("btnDownloadVideo");
  const btnDownloadAudio = document.getElementById("btnDownloadAudio");
  const btnDownloadScript = document.getElementById("btnDownloadScript");
  const btnEditCurrentScript = document.getElementById("btnEditCurrentScript");

  const galleryGrid = document.getElementById("galleryGrid");
  const btnRefreshGallery = document.getElementById("btnRefreshGallery");

  const editorProjectSelect = document.getElementById("editorProjectSelect");
  const editorContent = document.getElementById("editorContent");
  const editorEmptyState = document.getElementById("editorEmptyState");
  const sceneListContainer = document.getElementById("sceneListContainer");
  const editMetaTitle = document.getElementById("editMetaTitle");
  const editMetaDomain = document.getElementById("editMetaDomain");
  const btnSaveAndRerender = document.getElementById("btnSaveAndRerender");

  const videoModal = document.getElementById("videoModal");
  const modalVideoPlayer = document.getElementById("modalVideoPlayer");
  const btnCloseModal = document.getElementById("btnCloseModal");

  let inputMode = "url";

  // Navigation Tabs Switch
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      navButtons.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((pane) => pane.classList.add("hidden"));

      btn.classList.add("active");
      const targetPane = document.getElementById(`tab-${targetTab}`);
      if (targetPane) targetPane.classList.remove("hidden");

      if (targetTab === "gallery") loadGallery();
      if (targetTab === "editor") loadEditorProjects();
      if (targetTab === "settings") loadConfig();
    });
  });

  // Input Mode Switch (URL vs Text)
  inputTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      inputTabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      inputMode = btn.getAttribute("data-mode");

      if (inputMode === "url") {
        inputGroupUrl.classList.remove("hidden");
        inputGroupText.classList.add("hidden");
      } else {
        inputGroupUrl.classList.add("hidden");
        inputGroupText.classList.remove("hidden");
      }
    });
  });

  // Log to terminal helper
  function appendLog(message, type = "info") {
    const line = document.createElement("div");
    line.className = `log-line ${type}`;
    line.textContent = message;
    terminalLog.appendChild(line);
    terminalLog.scrollTop = terminalLog.scrollHeight;
  }

  function clearTerminal() {
    terminalLog.innerHTML = "";
  }

  function updateStepper(stepNum) {
    const stepItems = stepper.querySelectorAll(".step-item");
    stepItems.forEach((item) => {
      const n = parseInt(item.getAttribute("data-step"), 10);
      if (n < stepNum) {
        item.className = "step-item done";
      } else if (n === stepNum) {
        item.className = "step-item active";
      } else {
        item.className = "step-item";
      }
    });
  }

  function setJobStatus(statusText, stateClass) {
    jobStatusBadge.textContent = statusText;
    jobStatusBadge.className = `badge-status ${stateClass}`;
  }

  // Handle Create Video Form Submit
  btnCreateVideo.addEventListener("click", async () => {
    let payloadInput = "";
    if (inputMode === "url") {
      payloadInput = inputUrl.value.trim();
      if (!payloadInput) {
        alert("Vui lòng nhập đường link bài báo!");
        return;
      }
    } else {
      payloadInput = inputText.value.trim();
      if (!payloadInput) {
        alert("Vui lòng nhập hoặc dán nội dung bài viết!");
        return;
      }
    }

    btnCreateVideo.disabled = true;
    clearTerminal();
    resultCard.classList.add("hidden");
    setJobStatus("Đang chạy...", "running");
    updateStepper(1);

    appendLog("[System] Khởi chạy video generator...", "step");

    try {
      const resp = await fetch("/api/create-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: payloadInput }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Tạo video thất bại");
      }

      currentJobId = data.jobId;
      appendLog(`[System] Đã tạo Job ID: ${currentJobId}. Bắt đầu nhận log...`, "info");
      listenJobSSE(currentJobId);
    } catch (err) {
      appendLog(`[Lỗi] ${err.message}`, "error");
      setJobStatus("Thất bại", "failed");
      btnCreateVideo.disabled = false;
    }
  });

  // Listen SSE log stream
  function listenJobSSE(jobId) {
    if (activeEventSource) {
      activeEventSource.close();
    }

    activeEventSource = new EventSource(`/api/jobs/${jobId}/events`);

    activeEventSource.addEventListener("log", (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "step") {
        updateStepper(data.stepNumber);
        appendLog(`[Bước ${data.stepNumber}/${data.totalSteps}] ${data.message}`, "step");
      } else {
        appendLog(`[${data.timestamp.split(" ")[1] || ""}] ${data.message}`, data.type);
      }
    });

    activeEventSource.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data);
      appendLog("🎉 [Hoàn thành] Video đã được dựng thành công!", "step");
      updateStepper(8);
      setJobStatus("Hoàn thành", "completed");
      btnCreateVideo.disabled = false;
      activeEventSource.close();

      showVideoResult(data.videoUrl, data.audioUrl, data.scriptTxtUrl, data.outputDir);
    });

    activeEventSource.addEventListener("error", (e) => {
      try {
        const data = JSON.parse(e.data);
        appendLog(`❌ [Lỗi Server] ${data.error}`, "error");
      } catch {}
      setJobStatus("Thất bại", "failed");
      btnCreateVideo.disabled = false;
      if (activeEventSource) activeEventSource.close();
    });
  }

  function showVideoResult(videoUrl, audioUrl, scriptTxtUrl, outputDir) {
    resultCard.classList.remove("hidden");
    resultVideoPlayer.src = videoUrl;
    resultTitle.textContent = `Video output: ${outputDir}`;
    btnDownloadVideo.href = videoUrl;
    btnDownloadAudio.href = audioUrl;
    btnDownloadScript.href = scriptTxtUrl;
    currentEditingProjectId = outputDir;

    resultCard.scrollIntoView({ behavior: "smooth" });
  }

  btnEditCurrentScript.addEventListener("click", () => {
    if (currentEditingProjectId) {
      const editorTabBtn = document.querySelector('.nav-btn[data-tab="editor"]');
      editorTabBtn.click();
      setTimeout(() => {
        editorProjectSelect.value = currentEditingProjectId;
        editorProjectSelect.dispatchEvent(new Event("change"));
      }, 200);
    }
  });

  // GALLERY TAB LOGIC
  btnRefreshGallery.addEventListener("click", loadGallery);

  async function loadGallery() {
    try {
      galleryGrid.innerHTML = '<p class="hint">Đang tải thư viện...</p>';
      const resp = await fetch("/api/projects");
      const data = await resp.json();
      projectsCache = data.projects || [];

      if (projectsCache.length === 0) {
        galleryGrid.innerHTML = '<div class="empty-state"><i data-lucide="film"></i><p>Chưa có video nào. Hãy sang Tab "Tạo Video" để bắt đầu!</p></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      galleryGrid.innerHTML = "";
      projectsCache.forEach((proj) => {
        const card = document.createElement("div");
        card.className = "project-card";
        card.innerHTML = `
          <div class="card-thumb">
            ${
              proj.videoUrl
                ? `<video src="${proj.videoUrl}#t=0.5" preload="metadata"></video>`
                : proj.bgImageUrl
                ? `<img src="${proj.bgImageUrl}" alt="thumb" />`
                : `<div class="empty-thumb">9:16 News</div>`
            }
          </div>
          <h4>${escapeHtml(proj.title)}</h4>
          <div class="project-card-footer">
            <span>${proj.sceneCount} cảnh | ${proj.domain}</span>
            <span>${new Date(proj.createdAt).toLocaleDateString("vi-VN")}</span>
          </div>
          <button class="btn btn-secondary btn-block btn-preview" data-id="${proj.id}">
            <i data-lucide="play"></i> Xem Video
          </button>
        `;

        card.querySelector(".btn-preview").addEventListener("click", () => {
          openVideoModal(proj.videoUrl);
        });

        galleryGrid.appendChild(card);
      });

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      galleryGrid.innerHTML = `<p class="hint log-line error">Lỗi tải thư viện: ${err.message}</p>`;
    }
  }

  function openVideoModal(videoUrl) {
    if (!videoUrl) return alert("Video chưa sẵn sàng!");
    modalVideoPlayer.src = videoUrl;
    videoModal.classList.remove("hidden");
  }

  btnCloseModal.addEventListener("click", () => {
    modalVideoPlayer.pause();
    videoModal.classList.add("hidden");
  });

  // SCRIPT EDITOR TAB LOGIC
  async function loadEditorProjects() {
    try {
      const resp = await fetch("/api/projects");
      const data = await resp.json();
      editorProjectSelect.innerHTML = '<option value="">-- Chọn Video Để Sửa --</option>';

      (data.projects || []).forEach((proj) => {
        const opt = document.createElement("option");
        opt.value = proj.id;
        opt.textContent = `${proj.title} (${proj.id})`;
        editorProjectSelect.appendChild(opt);
      });
    } catch {}
  }

  editorProjectSelect.addEventListener("change", async () => {
    const projId = editorProjectSelect.value;
    if (!projId) {
      editorContent.classList.add("hidden");
      editorEmptyState.classList.remove("hidden");
      return;
    }

    try {
      const resp = await fetch(`/api/projects/${projId}`);
      const data = await resp.json();
      currentEditingScript = data.script;
      currentEditingProjectId = projId;

      editMetaTitle.value = currentEditingScript.metadata?.title || "";
      editMetaDomain.value = currentEditingScript.metadata?.source?.domain || "";

      renderSceneEditorCards(currentEditingScript.scenes || []);

      editorEmptyState.classList.add("hidden");
      editorContent.classList.remove("hidden");
    } catch (err) {
      alert(`Lỗi tải kịch bản: ${err.message}`);
    }
  });

  function renderSceneEditorCards(scenes) {
    sceneListContainer.innerHTML = "";

    scenes.forEach((scene, index) => {
      const card = document.createElement("div");
      card.className = "scene-card";
      card.innerHTML = `
        <div class="scene-header">
          <span class="scene-tag">Scene #${index + 1} (${scene.type})</span>
          <span class="hint">ID: ${scene.id}</span>
        </div>
        <div class="form-group">
          <label>Lời thoại đọc (voiceText - sẽ được đọc bởi TTS tiếng Việt):</label>
          <textarea class="form-input scene-voice-text" rows="3">${escapeHtml(scene.voiceText)}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Template đồ họa:</label>
            <select class="form-select scene-template">
              <option value="hook" ${scene.templateData?.template === "hook" ? "selected" : ""}>hook (Tiêu đề lớn)</option>
              <option value="stat-hero" ${scene.templateData?.template === "stat-hero" ? "selected" : ""}>stat-hero (Số liệu)</option>
              <option value="comparison" ${scene.templateData?.template === "comparison" ? "selected" : ""}>comparison (So sánh)</option>
              <option value="feature-list" ${scene.templateData?.template === "feature-list" ? "selected" : ""}>feature-list (Danh sách)</option>
              <option value="callout" ${scene.templateData?.template === "callout" ? "selected" : ""}>callout (Chú ý)</option>
              <option value="outro" ${scene.templateData?.template === "outro" ? "selected" : ""}>outro (Kết kênh)</option>
            </select>
          </div>
        </div>
      `;

      sceneListContainer.appendChild(card);
    });
  }

  btnSaveAndRerender.addEventListener("click", async () => {
    if (!currentEditingScript || !currentEditingProjectId) return;

    // Update state from form inputs
    currentEditingScript.metadata.title = editMetaTitle.value.trim();
    const voiceInputs = sceneListContainer.querySelectorAll(".scene-voice-text");
    const templateSelects = sceneListContainer.querySelectorAll(".scene-template");

    currentEditingScript.scenes.forEach((scene, idx) => {
      scene.voiceText = voiceInputs[idx].value.trim();
      if (scene.templateData) {
        scene.templateData.template = templateSelects[idx].value;
      }
    });

    btnSaveAndRerender.disabled = true;
    try {
      const saveResp = await fetch(`/api/projects/${currentEditingProjectId}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentEditingScript),
      });

      const saveResult = await saveResp.json();
      if (!saveResp.ok) throw new Error(saveResult.error);

      // Trigger re-render
      const renderResp = await fetch(`/api/projects/${currentEditingProjectId}/rerender`, {
        method: "POST",
      });
      const renderData = await renderResp.json();

      // Switch to create tab to view live console progress
      const createTabBtn = document.querySelector('.nav-btn[data-tab="create"]');
      createTabBtn.click();
      clearTerminal();
      setJobStatus("Đang re-render...", "running");
      appendLog(`[System] Khởi chạy Re-render cho ${currentEditingProjectId}...`, "step");
      listenJobSSE(renderData.jobId);
    } catch (err) {
      alert(`Lỗi lưu & render lại: ${err.message}`);
    } finally {
      btnSaveAndRerender.disabled = false;
    }
  });

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
});
