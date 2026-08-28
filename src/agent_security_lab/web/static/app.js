const state = {
  targets: [],
  scenarios: [],
  currentScenario: null,
  sessionId: null,
  pollTimer: null,
  sending: false,
};

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function boot() {
  const meta = await api("/api/meta");
  $("llm-badge").textContent =
    meta.llm_mode === "mock" ? "MOCK LLM（离线脚本）" : `LLM: ${meta.llm_model}`;
  [state.targets, state.scenarios] = await Promise.all([
    api("/api/targets"),
    api("/api/scenarios"),
  ]);
  renderSidebar();
}

function renderSidebar() {
  const box = $("target-list");
  box.innerHTML = "";
  for (const t of state.targets) {
    const block = document.createElement("div");
    block.className = "target-block";
    block.innerHTML = `<div class="target-name">${escapeHtml(t.name)}
      <span class="target-focus">${escapeHtml(t.id)} · ${escapeHtml(t.tier_focus)}</span></div>`;
    const related = state.scenarios.filter((s) => s.target === t.id);
    for (const s of related) {
      const item = document.createElement("div");
      item.className = "scenario-item";
      item.innerHTML = `<span class="tier-tag">${escapeHtml(s.tier)}</span>${escapeHtml(s.title)}`;
      item.onclick = () => selectScenario(s, item);
      block.appendChild(item);
    }
    box.appendChild(block);
  }
}

function selectScenario(s, el) {
  document.querySelectorAll(".scenario-item").forEach((e) => e.classList.remove("active"));
  el.classList.add("active");
  state.currentScenario = s;
  $("welcome").classList.add("hidden");
  $("scenario-card").classList.remove("hidden");
  $("scenario-tier").textContent = s.tier;
  $("scenario-title").textContent = s.title;
  $("scenario-briefing").textContent = s.briefing;
  $("hint-count").textContent = s.hints.length;
  $("scenario-hints").innerHTML = s.hints.map((h) => `<li>${escapeHtml(h)}</li>`).join("");
  $("scenario-fix").textContent = s.fix_notes || "（暂无）";
  $("scenario-fix-box").open = false;
  $("check-result").innerHTML = "";
}

$("btn-start").onclick = async () => {
  if (!state.currentScenario) return;
  await closeSession();
  const { session_id } = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ target_id: state.currentScenario.target }),
  });
  state.sessionId = session_id;
  $("chat-card").classList.remove("hidden");
  $("trace-card").classList.remove("hidden");
  $("chat-log").innerHTML = "";
  $("trace-log").innerHTML = "";
  $("session-label").textContent = `session: ${session_id}`;
  $("btn-check").disabled = false;
  $("btn-close").disabled = false;
  $("check-result").innerHTML = "";
  addMsg("assistant", `[靶标已就位] ${state.currentScenario.title} —— 开始你的攻击。`);
  state.pollTimer = setInterval(refreshTrace, 2000);
  $("chat-input").focus();
};

$("btn-close").onclick = closeSession;

async function closeSession() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
  if (state.sessionId) {
    await api(`/api/sessions/${state.sessionId}`, { method: "DELETE" }).catch(() => {});
  }
  state.sessionId = null;
  $("btn-check").disabled = true;
  $("btn-close").disabled = true;
}

function addMsg(who, text) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.innerHTML = `<span class="who">${who === "user" ? "你" : "Agent"}</span>${escapeHtml(text)}`;
  $("chat-log").appendChild(div);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
}

async function send() {
  const input = $("chat-input");
  const message = input.value.trim();
  if (!message || !state.sessionId || state.sending) return;
  state.sending = true;
  input.value = "";
  addMsg("user", message);
  try {
    const { reply } = await api(`/api/sessions/${state.sessionId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    addMsg("assistant", reply);
  } catch (e) {
    addMsg("assistant", `[error] ${e.message}`);
  } finally {
    state.sending = false;
    refreshTrace();
  }
}

$("btn-send").onclick = send;
$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") send();
});

function renderTrace(events) {
  const box = $("trace-log");
  box.innerHTML = "";
  for (const ev of events) {
    const div = document.createElement("div");
    div.className = `trace-ev ${ev.kind}`;
    let body = "";
    if (ev.kind === "user_msg") body = ev.data.content;
    else if (ev.kind === "model_msg")
      body = (ev.data.content || "") +
        (ev.data.tool_calls?.length
          ? `\n→ 决定调用: ${ev.data.tool_calls.map((t) => t.name).join(", ")}`
          : "");
    else if (ev.kind === "tool_call")
      body = `${ev.data.name}(${JSON.stringify(ev.data.arguments)})`;
    else if (ev.kind === "tool_result") body = String(ev.data.result).slice(0, 300);
    else body = JSON.stringify(ev.data);
    div.innerHTML = `<span class="trace-kind">${ev.kind}</span>${escapeHtml(body)}`;
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

async function refreshTrace() {
  if (!state.sessionId) return;
  const events = await api(`/api/sessions/${state.sessionId}/trace`).catch(() => null);
  if (events) renderTrace(events);
}

$("btn-check").onclick = async () => {
  if (!state.sessionId || !state.currentScenario) return;
  const res = await api(`/api/sessions/${state.sessionId}/check`, {
    method: "POST",
    body: JSON.stringify({ scenario_id: state.currentScenario.id }),
  });
  const lines = res.results
    .map(
      (r) =>
        `<div class="check-line ${r.passed ? "pass" : "fail"}">${r.passed ? "✔" : "✘"} ${escapeHtml(r.detail)}</div>`
    )
    .join("");
  const banner = res.passed
    ? `<div class="check-banner" style="color:var(--green)">FLAG CAPTURED — 攻击链成立</div>`
    : `<div class="check-banner" style="color:var(--accent)">尚未达成 — 继续尝试</div>`;
  $("check-result").innerHTML = banner + lines;
};

boot();
