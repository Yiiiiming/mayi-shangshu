import { COUNTRIES } from "./countries.js";
import { CATEGORIES, parseScore } from "./model.js";

const ids = ["scopeControl", "countryFilter", "countryFilterField", "regionFilter", "regionFilterField", "categoryFilter", "categoryChips", "searchFilter", "sortFilter", "itemsGrid", "emptyState", "resultSummary", "addDialog", "rateDialog", "addItemForm", "rateItemForm", "openAddButton", "emptyAddButton", "myRatingsButton", "clearFiltersButton", "emptyClearButton", "itemName", "itemCategory", "addScopeControl", "itemCountry", "itemRegion", "addCountryField", "addRegionField", "itemDescription", "descriptionCount", "initialScoreRange", "initialScoreNumber", "rateItemTitle", "ratingRange", "ratingExact", "ratingNumberDisplay", "ratingWordDisplay", "removeRatingButton", "toast", "totalItems", "totalRatings", "myRatingCount", "rankingTitle", "resultsNote", "connectionStatus", "connectionNotice", "loadingState", "refreshButton", "exportDataButton", "addFormError", "rateFormError", "identityNotice", "renewIdentityButton"];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
let items = [];
let stats = { items: 0, ratings: 0, myRatings: 0 };
let onlyMine = false;
let hasLoaded = false;
let collectionLimited = false;
const MAX_LOADED_ITEMS = 10_000;
let activeRatingItemId = null;
let readSequence = 0;
let readController = null;
let writeInProgress = false;
let lastRefreshAt = 0;
let toastTimeout;
const API_BASE = "https://everything-100.heym0701.chatgpt.site";
const SESSION_KEY = "everything100.identity.github.v1";
const SESSION_LOCK = "everything100.identity.github.bootstrap.v1";
let session = null;
let sessionLoaded = false;
let sessionFlight = null;
let identityBlocked = false;
let identityReason = "";
let identityMemoryOnly = false;
let identityRenewing = false;
let identityMessage = "";
let personalScoresCurrent = true;

initialize();

function initialize() {
  populateCountries(elements.countryFilter, "All countries");
  populateCountries(elements.itemCountry, "Choose a country");
  for (const category of CATEGORIES) {
    elements.categoryFilter.add(new Option(category, category));
    elements.itemCategory.add(new Option(category, category));
  }
  for (const category of ["", ...CATEGORIES]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.category = category;
    button.textContent = category || "Everything";
    button.setAttribute("aria-pressed", String(category === ""));
    elements.categoryChips.append(button);
  }
  bindEvents();
  syncFilterVisibility();
  syncAddLocationVisibility();
  elements.openAddButton.disabled = true;
  elements.exportDataButton.disabled = true;
  refreshItems();
  window.setInterval(() => {
    if (document.visibilityState === "visible" && !writeInProgress) refreshItems({ quiet: true });
  }, 20_000);
}

function bindEvents() {
  elements.scopeControl.addEventListener("change", () => { syncFilterVisibility(); render(); });
  for (const input of [elements.countryFilter, elements.regionFilter, elements.categoryFilter, elements.searchFilter, elements.sortFilter]) input.addEventListener("input", render);
  elements.categoryChips.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    elements.categoryFilter.value = button.dataset.category;
    render();
  });
  elements.myRatingsButton.addEventListener("click", () => { onlyMine = !onlyMine; render(); document.getElementById("discover-title").scrollIntoView({ behavior: "smooth", block: "start" }); });
  for (const button of [elements.clearFiltersButton, elements.emptyClearButton]) button.addEventListener("click", () => { clearFilters(); render(); });
  elements.openAddButton.addEventListener("click", openAddDialog);
  elements.emptyAddButton.addEventListener("click", openAddDialog);
  elements.addScopeControl.addEventListener("change", syncAddLocationVisibility);
  elements.itemDescription.addEventListener("input", () => { elements.descriptionCount.textContent = elements.itemDescription.value.length; });
  bindScoreInputs(elements.initialScoreRange, elements.initialScoreNumber);
  bindScoreInputs(elements.ratingRange, elements.ratingExact, updateRatingPreview);
  elements.addItemForm.addEventListener("submit", handleAddItem);
  elements.rateItemForm.addEventListener("submit", handleSaveRating);
  elements.removeRatingButton.addEventListener("click", handleRemoveRating);
  elements.itemsGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rate-id]");
    if (button) openRateDialog(button.dataset.rateId);
  });
  elements.refreshButton.addEventListener("click", () => refreshItems());
  elements.exportDataButton.addEventListener("click", exportMyRatings);
  document.querySelectorAll("[data-renew-identity]").forEach((button) => button.addEventListener("click", renewIdentity));
  window.addEventListener("storage", (event) => {
    if (event.key !== SESSION_KEY && event.key !== null) return;
    if (sessionLoaded && session) blockIdentity("The browser identity was changed or cleared in another tab. Refresh the browser identity to continue. Your current form inputs are kept.");
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => {
    if (!writeInProgress) document.getElementById(button.dataset.closeDialog).close();
  }));
  for (const dialog of [elements.addDialog, elements.rateDialog]) {
    let startedOutside = false;
    const outside = (event) => { const rect = dialog.getBoundingClientRect(); return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom; };
    dialog.addEventListener("pointerdown", (event) => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener("click", (event) => { if (!writeInProgress && startedOutside && event.target === dialog && outside(event)) dialog.close(); startedOutside = false; });
    dialog.addEventListener("cancel", (event) => { if (writeInProgress) event.preventDefault(); });
  }
  const resume = () => { if (document.visibilityState === "visible" && !writeInProgress && Date.now() - lastRefreshAt > 5_000) refreshItems({ quiet: true }); };
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", () => refreshItems());
  window.addEventListener("offline", () => setConnection("error", "Offline · showing the last loaded scores", "You’re offline. Your last loaded collection is shown. Reconnect, then refresh before rating."));
}

async function transport(path, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = window.setTimeout(abort, 15_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options, signal: controller.signal, credentials: "omit", cache: "no-store",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { throw new Error("The community service returned an unreadable response. Please try again."); }
    if (!response.ok) {
      const detail = typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message;
      const error = new Error(detail || `The request could not be completed (${response.status}). Please try again.`);
      error.status = response.status;
      error.code = payload.error?.code;
      throw error;
    }
    return payload;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error.name === "AbortError") throw new Error("The request timed out. Refresh to check the latest scores before trying again.");
    if (error instanceof TypeError) throw new Error("Could not reach the community. Check your connection and try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

function validSession(value) {
  return value && typeof value.token === "string" && /^[a-f0-9]{64}$/i.test(value.token) && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt));
}
function identityError() { const error = new Error(identityReason || "Start a new browser identity before continuing. Your previous public scores are not transferred."); error.code = "IDENTITY_REQUIRED"; return error; }
function updateIdentityNotice() {
  const temporary = identityMemoryOnly ? "This browser could not save your identity. It lasts only for this page session; after leaving, you may no longer be able to edit these ratings. Scores themselves are saved publicly online." : "";
  const message = [identityBlocked ? identityReason : identityMessage, temporary].filter(Boolean).join(" ");
  elements.identityNotice.hidden = !message;
  if (elements.identityNotice.textContent !== message) elements.identityNotice.textContent = message;
  document.querySelectorAll("[data-renew-identity]").forEach((button) => {
    button.hidden = !identityBlocked;
    button.disabled = identityRenewing;
    button.textContent = identityRenewing ? "Starting identity…" : "Start new browser identity";
  });
}
function blockIdentity(reason) {
  identityBlocked = true;
  identityReason = reason;
  updateIdentityNotice();
}
function readStoredSession() {
  let raw;
  try { raw = localStorage.getItem(SESSION_KEY); }
  catch { identityMemoryOnly = true; updateIdentityNotice(); return null; }
  if (raw === null) return null;
  let value;
  try { value = JSON.parse(raw); } catch { value = null; }
  if (!validSession(value)) {
    blockIdentity("Your saved browser identity could not be read. Start a new identity to continue. Earlier scores remain public and will not transfer to the new identity.");
    throw identityError();
  }
  return value;
}
function checkSessionExpiry(value) {
  if (Date.parse(value.expiresAt) <= Date.now()) {
    blockIdentity("Your browser identity has expired. Start a new identity to continue. Earlier scores remain public and cannot be edited from the new identity.");
    throw identityError();
  }
  return value;
}
function saveSession(value) {
  session = value;
  sessionLoaded = true;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved !== JSON.stringify(value)) throw new Error("Identity was not saved");
    identityMemoryOnly = false;
  } catch { identityMemoryOnly = true; }
  updateIdentityNotice();
}
async function createSession({ explicit = false } = {}) {
  const run = async () => {
    // Recheck under the cross-tab lock: another tab may have just created an identity.
    let stored = null;
    if (!identityMemoryOnly) {
      try { stored = readStoredSession(); } catch (error) { if (!explicit) throw error; }
    }
    if (stored && Date.parse(stored.expiresAt) > Date.now() && (!explicit || stored.token !== session?.token)) {
      session = stored;
      sessionLoaded = true;
      return stored;
    }
    if (stored && !explicit) return checkSessionExpiry(stored);
    const created = await transport("/api/session", { method: "POST", body: "{}" });
    if (!validSession(created) || Date.parse(created.expiresAt) <= Date.now()) throw new Error("The service could not create a usable browser identity. Please refresh to try again.");
    saveSession({ token: created.token, expiresAt: created.expiresAt });
    return session;
  };
  return globalThis.navigator?.locks?.request ? navigator.locks.request(SESSION_LOCK, run) : run();
}
async function ensureSession() {
  if (identityBlocked) throw identityError();
  if (sessionFlight) return sessionFlight;
  if (!sessionLoaded) {
    sessionLoaded = true;
    session = readStoredSession();
  } else if (session && !identityMemoryOnly) {
    const stored = readStoredSession();
    if (!stored || stored.token !== session.token) {
      blockIdentity("Your saved browser identity changed. Start or adopt the updated identity to continue. Your current form inputs are kept; ratings are never resent automatically.");
      throw identityError();
    }
  }
  if (session) return checkSessionExpiry(session);
  sessionFlight = createSession().finally(() => { sessionFlight = null; });
  return sessionFlight;
}
async function request(path, options = {}) {
  const identity = await ensureSession();
  if (options.signal?.aborted) throw new DOMException("Request canceled", "AbortError");
  try {
    return await transport(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${identity.token}` } });
  } catch (error) {
    if (error.status === 401) {
      blockIdentity("Your browser identity is no longer valid. Start a new identity to continue. Previous ratings remain public and will not transfer. No failed rating is resent automatically.");
      throw identityError();
    }
    throw error;
  }
}
async function renewIdentity() {
  if (identityRenewing || writeInProgress) return;
  identityRenewing = true;
  ++readSequence;
  readController?.abort();
  updateIdentityNotice();
  try {
    // This is an explicit identity change, never an automatic retry of an earlier vote.
    sessionFlight = createSession({ explicit: true }).finally(() => { sessionFlight = null; });
    await sessionFlight;
    identityBlocked = false;
    identityReason = "";
    personalScoresCurrent = false;
    items = items.map((item) => ({ ...item, myScore: null }));
    stats = { ...stats, myRatings: 0 };
    render();
    identityMessage = "A browser identity is ready. Earlier scores stay public but do not transfer to a newly created identity. Review your saved form and submit it yourself if you still want to rate.";
    const refreshed = await refreshItems({ force: true });
    if (elements.rateDialog.open) {
      const item = items.find((candidate) => candidate.id === activeRatingItemId);
      elements.removeRatingButton.hidden = !refreshed || item?.myScore === null || !item;
      showFormError(elements.rateFormError, "Your identity is ready. Your input was kept; no rating was submitted. Review it before saving.");
    }
    if (elements.addDialog.open) showFormError(elements.addFormError, "Your identity is ready. Your input was kept; no item was submitted. Review it before adding.");
  } catch (error) {
    identityReason = `The browser identity could not be renewed. ${error.message} Your inputs are kept.`;
    identityBlocked = true;
  } finally { identityRenewing = false; updateIdentityNotice(); }
}

async function refreshItems({ quiet = false, force = false } = {}) {
  if (writeInProgress && !force) return false;
  if (quiet && identityBlocked) return false;
  if (quiet && readController) return false;
  const sequence = ++readSequence;
  readController?.abort();
  const controller = new AbortController();
  readController = controller;
  elements.itemsGrid.setAttribute("aria-busy", "true");
  elements.refreshButton.disabled = true;
  if (!quiet || !hasLoaded) setConnection("loading", hasLoaded ? "Refreshing community scores…" : "Connecting to the community…");
  try {
    const loaded = new Map();
    let cursor = null;
    let nextStats;
    let limited = false;
    const seenCursors = new Set();
    for (let page = 0; page < 10; page += 1) {
      const path = cursor === null ? "/api/items" : `/api/items?cursor=${encodeURIComponent(cursor)}`;
      const payload = await request(path, { signal: controller.signal });
      if (sequence !== readSequence) return false;
      if (!Array.isArray(payload.items) || !validStats(payload.stats) || !payload.items.every(validPublicItem)) throw new Error("The collection could not be read. Please refresh to try again.");
      for (const item of payload.items) if (loaded.size < MAX_LOADED_ITEMS) loaded.set(item.id, item);
      nextStats = payload.stats;
      limited = Boolean(payload.hasMore);
      if (!payload.hasMore) break;
      if (loaded.size >= MAX_LOADED_ITEMS || page === 9) break;
      const nextCursor = typeof payload.nextCursor === "string" && /^\d+$/.test(payload.nextCursor) ? Number(payload.nextCursor) : payload.nextCursor;
      if (!Number.isSafeInteger(nextCursor) || nextCursor < 0 || seenCursors.has(nextCursor)) throw new Error("The next collection page could not be read. Please refresh to try again.");
      cursor = nextCursor;
      seenCursors.add(cursor);
    }
    items = [...loaded.values()];
    stats = nextStats;
    collectionLimited = limited;
    hasLoaded = true;
    personalScoresCurrent = true;
    lastRefreshAt = Date.now();
    elements.openAddButton.disabled = false;
    elements.exportDataButton.disabled = false;
    elements.loadingState.hidden = true;
    setConnection("ready", "Connected · community scores update automatically", collectionLimited ? `Showing the first ${items.length.toLocaleString()} items of the community. Search, filters, sorting, and downloads apply to these loaded items. The totals above cover the full community.` : "");
    render();
    return true;
  } catch (error) {
    if (sequence !== readSequence || controller.signal.aborted) return false;
    elements.loadingState.hidden = true;
    setConnection("error", identityBlocked ? "Browser identity needs attention" : hasLoaded ? "Connection interrupted · last loaded scores" : "Unable to load the community", `${error.message} ${hasLoaded ? "Your last loaded collection is still shown." : identityBlocked ? "Use Start new browser identity to continue." : "Use Refresh to reconnect."}`);
    return false;
  } finally {
    if (sequence === readSequence) {
      elements.itemsGrid.setAttribute("aria-busy", "false");
      elements.refreshButton.disabled = false;
      readController = null;
    }
  }
}

function validStats(value) { return value && [value.items, value.ratings, value.myRatings].every((number) => Number.isSafeInteger(number) && number >= 0); }

function validPublicItem(item) {
  return item && typeof item.id === "string" && typeof item.name === "string" && typeof item.description === "string" &&
    CATEGORIES.includes(item.category) && ["global", "country", "region"].includes(item.scope) &&
    typeof item.countryCode === "string" && typeof item.region === "string" && typeof item.createdAt === "string" &&
    Number.isInteger(item.ratingCount) && item.ratingCount >= 0 &&
    (item.average === null || (typeof item.average === "number" && Number.isFinite(item.average) && item.average >= 0 && item.average <= 100)) &&
    (item.myScore === null || (typeof item.myScore === "number" && parseScore(item.myScore) !== null));
}

function setConnection(state, message, detail = "") {
  elements.connectionStatus.dataset.state = state;
  if (elements.connectionStatus.textContent !== message) elements.connectionStatus.textContent = message;
  elements.connectionNotice.hidden = !detail;
  elements.connectionNotice.textContent = detail;
}

function populateCountries(select, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  for (const country of COUNTRIES) select.add(new Option(country.name, country.code));
}
function selectedScope(control) { return control.querySelector('input[type="radio"]:checked')?.value ?? "all"; }
function syncFilterVisibility() {
  const scope = selectedScope(elements.scopeControl);
  const needsCountry = scope === "country" || scope === "region";
  elements.countryFilterField.hidden = !needsCountry;
  elements.regionFilterField.hidden = scope !== "region";
  if (!needsCountry) elements.countryFilter.value = "";
  if (scope !== "region") elements.regionFilter.value = "";
}
function syncAddLocationVisibility() {
  const scope = selectedScope(elements.addScopeControl);
  const needsCountry = scope !== "global";
  elements.addCountryField.hidden = !needsCountry;
  elements.addRegionField.hidden = scope !== "region";
  elements.itemCountry.required = needsCountry;
  elements.itemRegion.required = scope === "region";
  if (!needsCountry) elements.itemCountry.value = "";
  if (scope !== "region") elements.itemRegion.value = "";
}
function clearFilters() {
  elements.scopeControl.querySelector('input[value="all"]').checked = true;
  for (const input of [elements.countryFilter, elements.regionFilter, elements.categoryFilter, elements.searchFilter]) input.value = "";
  onlyMine = false;
  syncFilterVisibility();
}
function compareItems(a, b) {
  const mode = elements.sortFilter.value;
  if (mode === "newest") return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.name.localeCompare(b.name);
  if (mode === "name") return a.name.localeCompare(b.name);
  if (mode === "votes" && a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount;
  if (a.average === null && b.average !== null) return 1;
  if (b.average === null && a.average !== null) return -1;
  return (b.average ?? 0) - (a.average ?? 0) || b.ratingCount - a.ratingCount || a.name.localeCompare(b.name);
}
function filteredItems() {
  const scope = selectedScope(elements.scopeControl);
  const region = elements.regionFilter.value.trim().toLocaleLowerCase();
  const search = elements.searchFilter.value.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (scope !== "all" && item.scope !== scope) return false;
    if (elements.countryFilter.value && item.countryCode !== elements.countryFilter.value) return false;
    if (region && !item.region.toLocaleLowerCase().includes(region)) return false;
    if (elements.categoryFilter.value && item.category !== elements.categoryFilter.value) return false;
    if (onlyMine && item.myScore === null) return false;
    return !search || `${item.name} ${item.description} ${item.category} ${item.region} ${countryName(item.countryCode)}`.toLocaleLowerCase().includes(search);
  }).sort(compareItems);
}
function render() {
  const visible = filteredItems();
  // Do not move keyboard focus when the background refresh replaces the cards.
  const focusedRateId = document.activeElement?.dataset?.rateId;
  elements.itemsGrid.replaceChildren(...visible.map((item, index) => createCard(item, index + 1)));
  if (focusedRateId) [...elements.itemsGrid.querySelectorAll("[data-rate-id]")].find((button) => button.dataset.rateId === focusedRateId)?.focus({ preventScroll: true });
  elements.emptyState.hidden = !hasLoaded || visible.length > 0;
  elements.resultSummary.textContent = hasLoaded ? `${visible.length} of ${items.length}${collectionLimited ? " loaded" : ""} items` : "";
  elements.totalItems.textContent = hasLoaded ? stats.items : "—";
  elements.totalRatings.textContent = hasLoaded ? stats.ratings : "—";
  elements.myRatingCount.textContent = hasLoaded && personalScoresCurrent ? stats.myRatings : "—";
  elements.myRatingsButton.setAttribute("aria-pressed", String(onlyMine));
  elements.categoryChips.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.category === elements.categoryFilter.value)));
  const titles = { rank: "Highest rated", votes: "Most rated", newest: "Recently added", name: "Browse A–Z" };
  elements.rankingTitle.textContent = onlyMine ? "Your rated items" : titles[elements.sortFilter.value];
  elements.resultsNote.textContent = collectionLimited ? "Search and sorting apply to the loaded collection." : onlyMine ? "Your public ratings from this browser." : "Shared community ratings. Every perspective counts.";
}
function createCard(item, rank) {
  const card = document.createElement("article");
  const mine = item.myScore !== null;
  card.className = `item-card${mine ? " is-rated" : ""}`;
  card.dataset.category = item.category;
  card.innerHTML = '<div class="item-topline"><span class="item-rank"></span><div class="score-group"><div class="score-badge"></div><span class="score-label"></span></div></div><h3></h3><div class="item-meta"><span class="meta-chip category-chip"></span><span class="meta-chip location-chip"></span></div><p class="item-description"></p><div class="item-footer"><div class="vote-count"><span class="rating-count"></span><span class="my-score"></span></div><button class="button button-dark rate-button" type="button"></button></div>';
  card.querySelector(".item-rank").textContent = `#${rank}`;
  const badge = card.querySelector(".score-badge");
  badge.textContent = item.average === null ? "—" : item.average.toFixed(1).replace(/\.0$/, "");
  badge.classList.toggle("score-empty", item.average === null);
  badge.setAttribute("aria-label", item.average === null ? "Not rated yet" : `Average score ${item.average.toFixed(1)} out of 100`);
  card.querySelector(".score-label").textContent = item.average === null ? "Be the first" : "out of 100";
  card.querySelector("h3").textContent = item.name;
  card.querySelector(".category-chip").textContent = item.category;
  card.querySelector(".location-chip").textContent = locationLabel(item);
  card.querySelector(".item-description").textContent = item.description || "A new perspective waiting for its first score.";
  card.querySelector(".rating-count").textContent = `${item.ratingCount} ${item.ratingCount === 1 ? "rating" : "ratings"}`;
  card.querySelector(".my-score").textContent = mine ? ` · Yours: ${item.myScore}` : "";
  const button = card.querySelector("button");
  button.dataset.rateId = item.id;
  button.textContent = mine ? "Edit score" : "Rate it";
  button.setAttribute("aria-label", `${mine ? "Edit your score for" : "Rate"} ${item.name}`);
  return card;
}

function showFormError(element, message = "") { element.textContent = message; element.hidden = !message; }
function openAddDialog() {
  if (writeInProgress || identityRenewing) return;
  elements.addItemForm.reset();
  elements.descriptionCount.textContent = "0";
  elements.initialScoreNumber.setCustomValidity("");
  showFormError(elements.addFormError);
  syncAddLocationVisibility();
  elements.addDialog.showModal();
  elements.itemName.focus();
}
function openRateDialog(id) {
  if (writeInProgress || identityRenewing) return;
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;
  activeRatingItemId = id;
  const initial = item.myScore ?? Math.round(item.average ?? 80);
  elements.rateItemTitle.textContent = item.name;
  elements.ratingRange.value = String(initial);
  elements.ratingExact.value = String(initial);
  elements.ratingExact.setCustomValidity("");
  elements.removeRatingButton.hidden = item.myScore === null;
  showFormError(elements.rateFormError);
  updateRatingPreview(initial);
  elements.rateDialog.showModal();
}

async function writeChange({ path, method, body, form, dialog, errorElement, onSuccess, message }) {
  if (writeInProgress || identityRenewing) return;
  writeInProgress = true;
  ++readSequence;
  readController?.abort();
  showFormError(errorElement);
  const controls = [...form.querySelectorAll("button,input,select,textarea")];
  const prior = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  form.setAttribute("aria-busy", "true");
  elements.refreshButton.disabled = true;
  setConnection("loading", "Saving your contribution…");
  try {
    await request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    dialog.close();
    const refreshed = await refreshItems({ force: true });
    onSuccess?.();
    render();
    showToast(message + (refreshed ? "" : " Saved successfully; use Refresh to reload the collection."), refreshed ? 3600 : 6500);
  } catch (error) {
    // Preserve all inputs on failure; never claim that an unconfirmed write succeeded.
    showFormError(errorElement, `${error.message} ${identityBlocked ? "Your inputs are kept. Use Start new browser identity below, then review and submit your rating yourself." : "Your inputs are kept. If the request was interrupted, refresh the collection before retrying."}`);
    setConnection("error", identityBlocked ? "Browser identity needs attention" : "Change not confirmed · collection kept", identityBlocked ? "Your input was kept. Start a new browser identity explicitly, then review and submit your rating yourself." : "The change could not be confirmed. Your last loaded collection is still shown. Refresh to check the latest scores before retrying.");
  } finally {
    controls.forEach((control, index) => { control.disabled = prior[index]; });
    form.setAttribute("aria-busy", "false");
    writeInProgress = false;
    elements.refreshButton.disabled = false;
    elements.itemsGrid.setAttribute("aria-busy", "false");
    updateIdentityNotice();
  }
}
async function handleAddItem(event) {
  event.preventDefault();
  const score = requireScore(elements.initialScoreNumber);
  if (score === null) return;
  const scope = selectedScope(elements.addScopeControl);
  const body = { name: elements.itemName.value.trim(), description: elements.itemDescription.value.trim(), category: elements.itemCategory.value, scope, countryCode: scope === "global" ? "" : elements.itemCountry.value, region: scope === "region" ? elements.itemRegion.value.trim() : "", score };
  if (!body.name || (scope !== "global" && !body.countryCode) || (scope === "region" && !body.region)) { showFormError(elements.addFormError, "Enter a name and the required location fields."); return; }
  await writeChange({ path: "/api/items", method: "POST", body, form: elements.addItemForm, dialog: elements.addDialog, errorElement: elements.addFormError, onSuccess: () => { clearFilters(); elements.searchFilter.value = body.name; }, message: `${body.name} was added to the shared collection.` });
}
async function handleSaveRating(event) {
  event.preventDefault();
  const score = requireScore(elements.ratingExact);
  if (score === null || !activeRatingItemId) return;
  await writeChange({ path: `/api/items/${encodeURIComponent(activeRatingItemId)}/rating`, method: "PUT", body: { score }, form: elements.rateItemForm, dialog: elements.rateDialog, errorElement: elements.rateFormError, message: `Your score of ${score} is now part of the community rating.` });
}
async function handleRemoveRating() {
  if (!activeRatingItemId) return;
  await writeChange({ path: `/api/items/${encodeURIComponent(activeRatingItemId)}/rating`, method: "DELETE", form: elements.rateItemForm, dialog: elements.rateDialog, errorElement: elements.rateFormError, message: "Your rating was removed from the shared collection." });
}
function bindScoreInputs(range, number, onChange) {
  range.addEventListener("input", () => { number.value = range.value; number.setCustomValidity(""); onChange?.(Number(range.value)); });
  number.addEventListener("input", () => { number.setCustomValidity(""); const score = parseScore(number.value); if (score !== null) range.value = String(score); onChange?.(score); });
}
function requireScore(input) { const score = parseScore(input.value); input.setCustomValidity(score === null ? "Enter a whole number from 0 to 100." : ""); if (score === null) input.reportValidity(); return score; }
function updateRatingPreview(score) { elements.ratingNumberDisplay.textContent = score === null ? "—" : score; elements.ratingWordDisplay.textContent = score === null ? "Enter 0–100" : describeScore(score); }
function describeScore(score) { for (const [min, label] of [[95,"Exceptional"],[85,"Excellent"],[75,"Very good"],[65,"Good"],[50,"Average"],[35,"Weak"],[20,"Poor"]]) if (score >= min) return label; return "Not for me"; }
function countryName(code) { return COUNTRIES.find((country) => country.code === code)?.name ?? code; }
function locationLabel(item) { return item.scope === "global" ? "Global" : item.scope === "region" ? `${item.region}, ${countryName(item.countryCode)}` : countryName(item.countryCode); }
function exportMyRatings() {
  const data = { version: 1, exportedAt: new Date().toISOString(), source: window.location.origin, partial: collectionLimited, loadedItems: items.length, totalCommunityItems: stats.items, note: "Public ratings made by this browser within the last loaded collection. This file does not contain an identity credential.", ratings: items.filter((item) => item.myScore !== null).map(({ id, name, category, scope, countryCode, region, myScore }) => ({ id, name, category, scope, countryCode, region, score: myScore })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `everything-100-my-ratings-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Your last loaded ratings were downloaded.");
}
function showToast(message, duration = 3600) { window.clearTimeout(toastTimeout); elements.toast.textContent = message; elements.toast.classList.add("show"); toastTimeout = window.setTimeout(() => elements.toast.classList.remove("show"), duration); }
