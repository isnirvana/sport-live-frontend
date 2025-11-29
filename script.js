/* ============================
   script.js — Frontend
   Updated to work with deployed EC2 server
   ============================ */

/* ----- Elements ----- */
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");

const matchesEl = document.getElementById("matches");
const upcomingEl = document.getElementById("upcomingMatches");
const homeLivePreview = document.getElementById("homeLivePreview");
const homeSearch = document.getElementById("homeSearch");
const searchPageInput = document.getElementById("searchPageInput");
const searchResults = document.getElementById("searchResults");

const modal = document.getElementById("modal");
const modalCard = modal.querySelector(".modal-card");
const modalIframe = document.getElementById("modalIframe");
const modalTitle = document.getElementById("modalTitle");
const closeModalBtn = document.getElementById("closeModal");

/* ----- Backend URL ----- */
// const SERVER_URL = "http://13.62.99.17:5000"; // replace with your EC2 public IP
const SERVER_URL = "http://api.sportliveserver.abrdns.com"; // replace with your EC2 public IP

/* ----- Helpers ----- */
const safeFetchJson = async (url, opts = {}) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    if (!res.ok) {
      const txt = await res.text().catch(() => null);
      throw new Error(txt || `HTTP ${res.status}`);
    }
    return res.json().catch(() => {
      throw new Error("Invalid JSON");
    });
  } finally {
    clearTimeout(id);
  }
};

const debounce = (fn, wait = 180) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

/* ----- Modal behavior ----- */
function openModal() {
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => {
    modal.classList.add("modal-show");
    modalCard.classList.add("modal-card-show");
  }, 12);
}

function closeModal() {
  modal.classList.remove("modal-show");
  modalCard.classList.remove("modal-card-show");
  modalIframe.src = "";
  setTimeout(() => {
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }, 260);
}

closeModalBtn?.addEventListener("click", closeModal);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

/* ----- Page navigation ----- */
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((i) => i.classList.remove("active"));
    item.classList.add("active");

    const pageId = item.dataset.page;
    pages.forEach((p) => {
      p.id === pageId
        ? p.classList.remove("hidden")
        : p.classList.add("hidden");
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    navigator.vibrate?.(8);
  });
});

/* ----- Card helpers ----- */
function createMatchCard(match) {
  const isLive = String(match.note || "")
    .toUpperCase()
    .includes("LIVE");
  const card = document.createElement("div");
  card.className = "match-card";

  const logo = match.logo || match.home_logo || "";
  const title =
    match.title ||
    (match.home && match.away
      ? `${match.home} vs ${match.away}`
      : match.note || "Untitled");
  const note =
    match.note || (match.league ? `${match.league} • ${match.time || ""}` : "");
  const leagueLogo = match.leagueLogo || match.league_logo || "";

  card.innerHTML = `
    <div class="flex items-center gap-3">
      <img src="${logo}" class="team-logo" alt="logo" onerror="this.style.opacity=.5" />
      <div class="flex-1">
        <div class="match-title">${escapeHtml(title)} ${
    isLive ? '<span class="live-badge">LIVE</span>' : ""
  }</div>
        ${note ? `<div class="match-note">${escapeHtml(note)}</div>` : ""}
      </div>
      ${
        leagueLogo
          ? `<img src="${leagueLogo}" class="league-logo" alt="league" />`
          : ""
      }
    </div>
    <button class="watch-btn mt-3 w-full">▶ Watch</button>
  `;

  card.dataset.stream = match.stream || match.link || match.url || "";

  card.querySelector(".watch-btn").addEventListener("click", async (e) => {
    const btn = e.target;
    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = "Loading...";

    const streamUrl = card.dataset.stream;
    if (!streamUrl) {
      alert("No stream URL provided");
      btn.disabled = false;
      btn.innerText = originalText;
      return;
    }

    try {
      const encoded = encodeURIComponent(streamUrl);
      const res = await safeFetchJson(`${SERVER_URL}/stream?url=${encoded}`);
      const real = res.realLink || res.stream || res.url || res.play || null;
      if (!real) alert(res.error || "No playable stream returned by server.");
      else {
        modalIframe.src = real;
        modalTitle.innerText = title;
        openModal();
      }
    } catch (err) {
      console.error(err);
      alert("Error loading stream");
    } finally {
      btn.disabled = false;
      btn.innerText = originalText;
    }
  });

  return card;
}

function createSmallPreviewCard(match) {
  const card = createMatchCard(match);
  card.classList.add("p-3");
  return card;
}

/* ----- Escape HTML ----- */
function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

/* ----- Skeleton loader ----- */
function showSkeleton(target, count = 6) {
  target.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "skeleton";
    s.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-full bg-gray-700"></div>
        <div class="flex-1">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
      <div class="flex justify-center mt-4">
        <div class="skeleton-line" style="width:60%;height:32px;"></div>
      </div>
    `;
    target.appendChild(s);
  }
}

/* ----- Load matches from server ----- */
async function loadMatches() {
  showSkeleton(matchesEl);
  showSkeleton(upcomingEl);
  homeLivePreview && showSkeleton(homeLivePreview, 4);

  try {
    const data = await safeFetchJson(`${SERVER_URL}/scrape`);
    let live = [],
      upcoming = [];
    if (Array.isArray(data)) live = data;
    else if (
      Array.isArray(data.live_matches) ||
      Array.isArray(data.upcoming_matches)
    ) {
      live = data.live_matches || [];
      upcoming = data.upcoming_matches || [];
    } else if (Array.isArray(data.matches)) live = data.matches;
    else {
      const arrKeys = Object.keys(data).filter((k) => Array.isArray(data[k]));
      if (arrKeys.length === 1) live = data[arrKeys[0]];
      else {
        for (const k of arrKeys) {
          if (k.includes("live")) live = data[k];
          else upcoming = upcoming.concat(data[k]);
        }
      }
    }

    matchesEl.innerHTML = "";
    upcomingEl.innerHTML = "";
    homeLivePreview && (homeLivePreview.innerHTML = "");
    searchResults && (searchResults.innerHTML = "");

    live.forEach((m) => {
      const card = createMatchCard(m);
      matchesEl.appendChild(card);
      if (homeLivePreview)
        homeLivePreview.appendChild(createSmallPreviewCard(m));
    });

    upcoming.forEach((m) => {
      const card = createMatchCard(m);
      upcomingEl.appendChild(card);
    });

    const allCards = Array.from(
      matchesEl.querySelectorAll(".match-card")
    ).concat(Array.from(upcomingEl.querySelectorAll(".match-card")));
    if (searchResults) {
      searchResults.innerHTML = "";
      allCards.forEach((c) => searchResults.appendChild(c.cloneNode(true)));
    }
  } catch (err) {
    console.error(err);
    matchesEl.innerHTML =
      '<p class="text-red-500 text-center">Error loading matches</p>';
    upcomingEl.innerHTML = "";
    homeLivePreview && (homeLivePreview.innerHTML = "");
  }
}

/* ----- Search ----- */
const doFilter = (q, targetSelector) => {
  document.querySelectorAll(targetSelector).forEach((node) => {
    const text =
      node.querySelector(".match-title")?.innerText.toLowerCase() || "";
    node.style.display = q ? (text.includes(q) ? "" : "none") : "";
  });
};

homeSearch?.addEventListener(
  "input",
  debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    doFilter(q, "#homeLivePreview .match-card, #matches .match-card");
  }, 160)
);

searchPageInput?.addEventListener(
  "input",
  debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    doFilter(q, "#searchResults .match-card");
  }, 160)
);

/* ----- Init ----- */
loadMatches();
