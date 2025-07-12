const storageKey = "savedSites";
const visitedKey = "visitedPosts";
let websites = JSON.parse(localStorage.getItem(storageKey)) || [];
let postCache = {};
let currentSite = "";
let flatpickrInstance = null;

function randomColor() {
  const arr = ['#ffe0b2', '#d1c4e9', '#b2dfdb', '#ffcdd2', '#c8e6c9', '#f0f4c3'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function getVisited() {
  return JSON.parse(localStorage.getItem(visitedKey) || "[]");
}

function markVisited(id) {
  const vs = getVisited();
  if (!vs.find(v => v.id === id)) vs.push({ id, time: Date.now() });
  localStorage.setItem(visitedKey, JSON.stringify(vs));
  loadPosts();
}

function cleanupVisited() {
  const now = Date.now();
  const vs = getVisited().filter(v => now - v.time < 24 * 60 * 60 * 1000);
  localStorage.setItem(visitedKey, JSON.stringify(vs));
}

function addWebsite() {
  const url = document.getElementById("site-url").value.trim();
  if (url && !websites.includes(url)) {
    websites.push(url);
    localStorage.setItem(storageKey, JSON.stringify(websites));
    document.getElementById("site-url").value = '';
    populateSites();
  }
}

function deleteWebsite(url) {
  websites = websites.filter(w => w !== url);
  localStorage.setItem(storageKey, JSON.stringify(websites));
  if (currentSite === url) currentSite = websites[0] || '';
  populateSites();
  if (currentSite) loadPosts(currentSite);
}

function toggleSitePopup() {
  document.getElementById("site-popup").classList.toggle("show");
  document.getElementById("date-popup").classList.remove("show");
}

function toggleDatePopup() {
  const popup = document.getElementById("date-popup");
  popup.classList.toggle("show");
  document.getElementById("site-popup").classList.remove("show");
  if (popup.classList.contains("show") && flatpickrInstance) {
    flatpickrInstance.open();
  } else if (flatpickrInstance) {
    flatpickrInstance.close();
  }
}

function populateSites() {
  const popup = document.getElementById("site-popup");
  popup.innerHTML = '';

  websites.forEach(url => {
    const item = document.createElement("div");
    item.className = "site-popup-item" + (url === currentSite ? " active" : "");
    item.innerHTML = `
      <span onclick="selectSite('${url}')">${url}</span>
      <button onclick="deleteWebsite('${url}')">\u2715</button>
    `;
    popup.appendChild(item);
  });

  setupCalendar();

  if (websites.length && !currentSite) {
    currentSite = websites[0];
    setTimeout(() => loadPosts(currentSite), 300);
  }
}

function selectSite(url) {
  currentSite = url;
  toggleSitePopup();
  if (flatpickrInstance) {
    loadPosts(url);
  } else {
    setTimeout(() => loadPosts(url), 300);
  }
}

function setupCalendar() {
  setTimeout(() => {
    document.getElementById("date-popup").innerHTML = `<input type="text" id="date-picker" />`;

    flatpickrInstance = flatpickr("#date-picker", {
      defaultDate: new Date(),
      onChange: function () {
        if (currentSite) loadPosts(currentSite);
      }
    });

    document.getElementById("date-popup-btn").onclick = toggleDatePopup;
  }, 100);
}

async function fetchPosts(siteUrl) {
  try {
    const res = await fetch(siteUrl.replace(/\/$/, "") + "/wp-json/wp/v2/posts?per_page=50&_embed&_ts=" + Date.now());
    if (res.ok) {
      const js = await res.json();
      return js.map(p => {
        const cat = (p._embedded?.['wp:term']?.[0]?.[0]?.name) || "WordPress";
        return {
          id: `${siteUrl}-wp-${p.id}`,
          title: p.title.rendered,
          category: cat,
          updated: new Date(p.date).toISOString(),
          link: p.link
        };
      });
    }
  } catch {}

  try {
    const rss = siteUrl.replace(/\/$/, "") + "/feed/";
    const res = await fetch("https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rss));
    const js = await res.json();
    if (js.items) {
      return js.items.map(it => ({
        id: `${siteUrl}-rss-${it.guid}`,
        title: it.title,
        category: it.categories[0] || "RSS",
        updated: new Date(it.pubDate).toISOString(),
        link: it.link
      }));
    }
  } catch {}

  return [];
}

async function loadPosts(siteUrl = currentSite || websites[0]) {
  cleanupVisited();
  currentSite = siteUrl;
  const pick = document.getElementById("date-picker")?.value;
  const now = new Date();
  if (!siteUrl) return;

  const isRealtime = !pick;
  const cacheExpired = !postCache[siteUrl] || (Date.now() - postCache[siteUrl].time > 2 * 60 * 1000);

  if (cacheExpired) {
    const posts = await fetchPosts(siteUrl);
    postCache[siteUrl] = { posts, time: Date.now() };
  }

  const all = postCache[siteUrl].posts || [];
  let filtered;

  if (isRealtime) {
    filtered = all.filter(p => new Date(p.updated) <= now);
  } else {
    const selDate = new Date(pick);
    const start = new Date(selDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selDate);
    end.setHours(23, 59, 59, 999);

    filtered = all.filter(p => {
      const updatedTime = new Date(p.updated);
      return updatedTime >= start && updatedTime <= end;
    });
  }

  renderPosts(filtered);
  highlightSelectedSite();
}

function renderPosts(posts) {
  const cont = document.getElementById("post-table-container");
  cont.innerHTML = '';
  const vs = getVisited().map(v => v.id);
  posts.sort((a, b) => new Date(b.updated) - new Date(a.updated));

  posts.forEach((p, i) => {
    const vis = vs.includes(p.id);
    const d = document.createElement('div');
    d.className = "post-strip" + (vis ? " visited" : "");
    d.style.backgroundColor = vis ? "#d4edda" : randomColor();
    d.innerHTML = `
      <div class="post-header">
        <div class="serial-box">${i + 1}</div>
        <div class="post-title">${p.title}</div>
      </div>
      <div class="post-details">
        <div class="details-group">
          <div class="detail-item"><strong>Category:</strong> <span class="category-badge">${p.category}</span></div>
          <div class="detail-item"><strong>Updated:</strong> ${new Date(p.updated).toLocaleString()}</div>
        </div>
        <div class="post-actions">
          <button class="btn open-btn" onclick="window.open('${p.link}','_blank')">Open</button>
          <button class="btn visit-btn" onclick="markVisited('${p.id}')">Visited</button>
        </div>
      </div>`;
    cont.appendChild(d);
  });

  if (posts.length === 0) {
    cont.innerHTML = "<p>No posts found for this date or site.</p>";
  }
}

function highlightSelectedSite() {
  document.querySelectorAll(".site-popup-item").forEach(el => {
    if (el.textContent.includes(currentSite)) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}

function clearCache() {
  postCache = {};
  localStorage.removeItem("postCacheTime");
  if (currentSite) loadPosts(currentSite);
}

function autoClearCacheAtMidnight() {
  const lastCleared = localStorage.getItem("postCacheTime");
  const today = new Date().toISOString().split("T")[0];
  if (lastCleared !== today) {
    postCache = {};
    localStorage.setItem("postCacheTime", today);
  }
}

window.onload = () => {
  autoClearCacheAtMidnight();
  populateSites();
};
