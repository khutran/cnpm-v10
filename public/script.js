'use strict';

/* ==========================================================================
 * ONCafe Management — logic ứng dụng
 *
 * DÁN LINK MOCKAPI CỦA BẠN VÀO DEFAULT_API_URL (phải kết thúc bằng /drinks).
 * Giá trị này được dùng cho mọi người mở website, kể cả giảng viên chấm bài.
 * Ví dụ: 'https://abc123.mockapi.io/api/v1/drinks'
 * ========================================================================== */
const DEFAULT_API_URL = '';

const REQUEST_TIMEOUT_MS = 10000;
const LOCAL_DELAY_MS = 350;
const DEFAULT_CATEGORY = 'Cà phê truyền thống';

const STORAGE_KEYS = {
  apiUrl: 'oncafe.apiUrl',
  mode: 'oncafe.mode',
  view: 'oncafe.view',
  localDrinks: 'oncafe.local.drinks',
  localOrders: 'oncafe.local.orders',
};

const ORDER_STATUS = {
  pending: { label: 'Chờ pha chế', next: 'brewing', action: 'Bắt đầu pha' },
  brewing: { label: 'Đang pha chế', next: 'served', action: 'Đã phục vụ' },
  served: { label: 'Đã phục vụ', next: 'paid', action: 'Thanh toán' },
  paid: { label: 'Đã thanh toán', next: null, action: null },
  cancelled: { label: 'Đã hủy', next: null, action: null },
};

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f2e9df"/>' +
  '<g fill="none" stroke="#b45f1d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M34 50h44v22a16 16 0 0 1-16 16H50a16 16 0 0 1-16-16z"/><path d="M78 56h5a9 9 0 0 1 0 18h-5"/>' +
  '<path d="M46 32v8M56 32v8M66 32v8"/></g></svg>'
);

const unsplash = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=300&q=80`;
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

const seedDrinks = () => [
  ['Cà phê Đen Đá', 25000, 'Cà phê truyền thống', '1514432324607-a09d9b4aefdd', true],
  ['Cà phê Sữa Đá', 29000, 'Cà phê truyền thống', '1461023058943-07fcbe16d735', true],
  ['Bạc Xỉu', 32000, 'Cà phê truyền thống', '1517701604599-bb29b565090c', true],
  ['Espresso Double', 39000, 'Cà phê máy & Espresso', '1509042239860-f550ce710b93', true],
  ['Latte Nóng', 45000, 'Cà phê máy & Espresso', '1495474472287-4d71bcdd2085', true],
  ['Trà Đào Cam Sả', 42000, 'Trà & Trái cây', '1556679343-c7306c1976bc', true],
  ['Cappuccino Nóng', 48000, 'Cà phê máy & Espresso', '1541167760496-1628856ab772', false],
  ['Mocha Đá Xay', 55000, 'Đá xay & Freeze', '1577805947697-89e18249d767', true],
  ['Bánh Tiramisu', 49000, 'Bánh ngọt & Ăn kèm', '1578985545062-69928b1d9587', true],
  ['Cookie Socola', 22000, 'Bánh ngọt & Ăn kèm', '1558961363-fa8fdf82db35', true],
].map(([name, price, category, photo, status], index) => ({
  id: String(index + 1),
  name,
  price,
  category,
  image: unsplash(photo),
  status,
  createdAt: minutesAgo(600 - index * 30),
}));

const seedOrders = () => [
  ['Bàn 01', 'Cà phê Sữa Đá', 29000, 2, 'Ít đá', 'pending', 8],
  ['Bàn 04', 'Trà Đào Cam Sả', 42000, 1, '', 'brewing', 18],
  ['Mang đi (Take Away)', 'Latte Nóng', 45000, 3, 'Thêm đường', 'served', 35],
].map(([table, drinkName, unitPrice, quantity, note, status, age], index) => ({
  id: String(index + 1),
  table,
  drinkId: '',
  drinkName,
  unitPrice,
  quantity,
  note,
  total: unitPrice * quantity,
  status,
  createdAt: minutesAgo(age),
}));

/* ---------- Tiện ích chung ---------- */
const $ = (id) => document.getElementById(id);
const toggle = (element, visible) => element.classList.toggle('d-none', !visible);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const formatPrice = (value) => `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} đ`;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .trim();

const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const safeImage = (url) => (isHttpUrl(url) ? url : PLACEHOLDER_IMAGE);

const toTimestamp = (value) => {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const storage = {
  memory: new Map(),
  get(key) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? this.memory.get(key) ?? null : value;
    } catch {
      return this.memory.get(key) ?? null;
    }
  },
  set(key, value) {
    this.memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Trình duyệt chặn lưu trữ: dữ liệu vẫn còn trong bộ nhớ của phiên này. */
    }
  },
  remove(key) {
    this.memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Không có gì để xóa khi lưu trữ bị chặn. */
    }
  },
};

/* ---------- Tầng truy cập dữ liệu ---------- */
class ApiError extends Error {
  constructor(message, detail, status = 0) {
    super(message);
    this.detail = detail;
    this.status = status;
  }
}

const messageForStatus = (status) => {
  if (status === 404) return 'Không tìm thấy dữ liệu hoặc đường dẫn API không đúng (404).';
  if (status === 429) return 'Máy chủ API đang giới hạn số yêu cầu, vui lòng thử lại sau ít phút (429).';
  if (status >= 500) return `Máy chủ API đang gặp sự cố (${status}).`;
  return `Máy chủ API từ chối yêu cầu (${status}).`;
};

async function request(url, method = 'GET', body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const label = `${method} ${url}`;
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(messageForStatus(response.status), `${label} → HTTP ${response.status}`, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError(`API không phản hồi sau ${REQUEST_TIMEOUT_MS / 1000} giây.`, `${label} → Timeout`);
    }
    if (error instanceof SyntaxError) {
      throw new ApiError('API trả về dữ liệu không đúng định dạng JSON.', `${label} → ${error.message}`);
    }
    throw new ApiError('Không thể kết nối đến máy chủ API. Hãy kiểm tra mạng và đường dẫn API.', `${label} → ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

const remoteCollection = (url) => ({
  async list() {
    const data = await request(url);
    if (!Array.isArray(data)) throw new ApiError('API không trả về danh sách hợp lệ.', `GET ${url} → không phải mảng JSON`);
    return data;
  },
  create: (item) => request(url, 'POST', item),
  update: (id, item) => request(`${url}/${encodeURIComponent(id)}`, 'PUT', item),
  remove: (id) => request(`${url}/${encodeURIComponent(id)}`, 'DELETE'),
});

const localCollection = (key, seed) => {
  const read = () => {
    try {
      const stored = JSON.parse(storage.get(key));
      if (Array.isArray(stored)) return stored;
    } catch {
      /* Dữ liệu lưu hỏng thì nạp lại dữ liệu mẫu bên dưới. */
    }
    const initial = seed();
    storage.set(key, JSON.stringify(initial));
    return initial;
  };
  const write = (items) => storage.set(key, JSON.stringify(items));
  const notFound = (id) => new ApiError('Không tìm thấy bản ghi cần xử lý.', `Local ${key}/${id} → không tồn tại`, 404);

  return {
    async list() {
      await sleep(LOCAL_DELAY_MS);
      return read();
    },
    async create(item) {
      await sleep(LOCAL_DELAY_MS);
      const items = read();
      const nextId = items.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1;
      const created = { ...item, id: String(nextId) };
      write([...items, created]);
      return created;
    },
    async update(id, item) {
      await sleep(LOCAL_DELAY_MS);
      const items = read();
      const index = items.findIndex((entry) => entry.id === id);
      if (index < 0) throw notFound(id);
      items[index] = { ...items[index], ...item, id };
      write(items);
      return items[index];
    },
    async remove(id) {
      await sleep(LOCAL_DELAY_MS);
      const items = read();
      if (!items.some((entry) => entry.id === id)) throw notFound(id);
      write(items.filter((entry) => entry.id !== id));
      return { id };
    },
    reset: () => storage.remove(key),
  };
};

const localDrinks = localCollection(STORAGE_KEYS.localDrinks, seedDrinks);
const localOrders = localCollection(STORAGE_KEYS.localOrders, seedOrders);

const parseDrinksUrl = (value) => {
  try {
    const url = new URL(value.trim());
    const path = url.pathname.replace(/\/+$/, '');
    if (!['http:', 'https:'].includes(url.protocol) || !path.endsWith('/drinks')) return null;
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
};

const ordersUrlOf = (drinksUrl) => drinksUrl.replace(/\/drinks$/, '/orders');

/* ---------- Trạng thái ứng dụng ---------- */
const state = {
  mode: 'local',
  apiUrl: '',
  ordersBackend: 'api',
  drinks: [],
  orders: [],
  drinksStatus: 'loading',
  ordersStatus: 'loading',
  drinksError: null,
  ordersError: null,
  search: '',
  category: 'all',
  sort: 'newest',
  view: 'table',
  drinksRequest: 0,
  ordersRequest: 0,
  saving: false,
  deleting: false,
  deleteTarget: null,
  busyOrders: new Set(),
};

const drinksRepo = () => (state.mode === 'api' ? remoteCollection(state.apiUrl) : localDrinks);
const ordersRepo = () => (
  state.mode === 'api' && state.ordersBackend === 'api' ? remoteCollection(ordersUrlOf(state.apiUrl)) : localOrders
);

const normalizeDrink = (raw) => ({
  id: String(raw.id),
  name: String(raw.name ?? 'Chưa đặt tên'),
  price: Number(raw.price) || 0,
  category: raw.category ? String(raw.category) : DEFAULT_CATEGORY,
  image: raw.image ? String(raw.image) : '',
  status: raw.status === undefined || raw.status === null ? true : raw.status === true || raw.status === 'true',
  createdAt: raw.createdAt,
});

const normalizeOrder = (raw) => {
  const quantity = Number(raw.quantity) || 1;
  const unitPrice = Number(raw.unitPrice) || 0;
  return {
    id: String(raw.id),
    table: String(raw.table ?? '—'),
    drinkId: raw.drinkId ? String(raw.drinkId) : '',
    drinkName: String(raw.drinkName ?? 'Món không xác định'),
    unitPrice,
    quantity,
    note: raw.note ? String(raw.note) : '',
    total: Number(raw.total) || unitPrice * quantity,
    status: ORDER_STATUS[raw.status] ? raw.status : 'pending',
    createdAt: raw.createdAt,
  };
};

const drinkPayload = (drink) => ({
  name: drink.name,
  price: drink.price,
  category: drink.category,
  image: drink.image,
  status: drink.status,
  createdAt: drink.createdAt,
});

const orderPayload = ({ id, ...order }) => order;

/* ---------- Thông báo ---------- */
const TOAST_ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

function showToast(type, title, message = '') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span aria-hidden="true">${TOAST_ICONS[type]}</span>
    <div class="toast-body"><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</div>`;
  $('toastContainer').append(toast);
  setTimeout(() => toast.remove(), type === 'error' ? 6500 : 3800);
}

function showAlert(kind, icon, title, message) {
  const banner = $('alertBanner');
  banner.classList.remove('alert-danger', 'alert-success');
  if (kind) banner.classList.add(`alert-${kind}`);
  $('alertIcon').textContent = icon;
  $('alertTitle').textContent = title;
  $('alertMessage').textContent = message;
  toggle(banner, true);
}

const hideAlert = () => toggle($('alertBanner'), false);

function setApiPill(status, text) {
  const pill = $('apiStatusPill');
  pill.classList.remove('is-ok', 'is-error', 'is-local', 'is-checking');
  pill.classList.add(`is-${status}`);
  $('apiStatusText').textContent = text;
}

function updateConnectionNotice() {
  if (state.drinksStatus === 'loading') {
    setApiPill('checking', state.mode === 'api' ? 'Đang kiểm tra API...' : 'Đang tải dữ liệu...');
    return;
  }
  if (state.mode === 'local') {
    setApiPill('local', 'Dữ liệu nội bộ');
    showAlert('', '⚠️', 'Đang dùng Dữ liệu Nội bộ.', ' Dữ liệu chỉ lưu trên trình duyệt này. Vào "Cấu Hình API & Dữ Liệu" để kết nối MockAPI.');
    return;
  }
  if (state.drinksStatus === 'error') {
    setApiPill('error', 'Mất kết nối API');
    hideAlert();
    return;
  }
  setApiPill('ok', 'API đã kết nối');
  if (state.ordersBackend === 'local') {
    showAlert('', '⚠️', 'MockAPI chưa có resource orders.', ' Đơn hàng đang lưu tạm trên trình duyệt này. Hãy tạo resource orders để đồng bộ.');
  } else {
    hideAlert();
  }
}

/* ---------- Tải dữ liệu ---------- */
async function loadDrinks() {
  const requestId = ++state.drinksRequest;
  state.drinksStatus = 'loading';
  $('iconReload').classList.add('is-spinning');
  updateConnectionNotice();
  renderDrinks();
  try {
    const items = await drinksRepo().list();
    if (requestId !== state.drinksRequest) return;
    state.drinks = items.map(normalizeDrink);
    state.drinksStatus = 'ready';
    state.drinksError = null;
  } catch (error) {
    if (requestId !== state.drinksRequest) return;
    state.drinks = [];
    state.drinksStatus = 'error';
    state.drinksError = error;
    showToast('error', 'Lỗi tải danh sách món', error.message);
  }
  $('iconReload').classList.remove('is-spinning');
  updateConnectionNotice();
  renderDrinks();
  renderStats();
  renderOrderDrinkOptions();
}

async function loadOrders() {
  const requestId = ++state.ordersRequest;
  state.ordersStatus = 'loading';
  renderOrders();
  if (state.mode === 'api') state.ordersBackend = 'api';
  let items;
  let failure = null;
  try {
    items = await ordersRepo().list();
  } catch (error) {
    if (state.mode === 'api' && error.status === 404) {
      state.ordersBackend = 'local';
      try {
        items = await localOrders.list();
      } catch (localError) {
        failure = localError;
      }
    } else {
      failure = error;
    }
  }
  if (requestId !== state.ordersRequest) return;
  state.orders = failure ? [] : items.map(normalizeOrder);
  state.ordersStatus = failure ? 'error' : 'ready';
  state.ordersError = failure;
  updateConnectionNotice();
  renderOrders();
  renderStats();
}

const loadAll = () => Promise.all([loadDrinks(), loadOrders()]);

/* ---------- Hiển thị: món đồ uống ---------- */
function visibleDrinks() {
  const keyword = normalizeText(state.search);
  const matched = state.drinks.filter((drink) => (
    (state.category === 'all' || drink.category === state.category)
    && (!keyword || normalizeText(drink.name).includes(keyword))
  ));
  const comparators = {
    newest: (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt) || Number(b.id) - Number(a.id),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'name-asc': (a, b) => a.name.localeCompare(b.name, 'vi'),
    'name-desc': (a, b) => b.name.localeCompare(a.name, 'vi'),
  };
  return matched.sort(comparators[state.sort]);
}

const statusBadge = (active) => (active
  ? '<span class="badge badge-on">Đang bán</span>'
  : '<span class="badge badge-off">Tạm hết</span>');

const EDIT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const DELETE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>';

function drinkRow(drink, index) {
  const id = escapeHtml(drink.id);
  const name = escapeHtml(drink.name);
  return `<tr>
    <td>${index + 1}</td>
    <td><img class="drink-thumb" src="${escapeHtml(safeImage(drink.image))}" alt="${name}" loading="lazy"></td>
    <td><span class="drink-name">${name}</span></td>
    <td><span class="category-tag">${escapeHtml(drink.category)}</span></td>
    <td class="price-cell">${formatPrice(drink.price)}</td>
    <td class="center-cell">${statusBadge(drink.status)}</td>
    <td><div class="row-actions">
      <button class="icon-btn" data-action="edit" data-id="${id}" title="Sửa món" aria-label="Sửa ${name}">${EDIT_ICON}</button>
      <button class="icon-btn is-danger" data-action="delete" data-id="${id}" title="Xóa món" aria-label="Xóa ${name}">${DELETE_ICON}</button>
    </div></td>
  </tr>`;
}

function drinkCard(drink) {
  const id = escapeHtml(drink.id);
  const name = escapeHtml(drink.name);
  return `<article class="drink-card">
    <div class="drink-card-media">
      <img src="${escapeHtml(safeImage(drink.image))}" alt="${name}" loading="lazy">
      ${statusBadge(drink.status)}
    </div>
    <div class="drink-card-body">
      <span class="category-tag">${escapeHtml(drink.category)}</span>
      <span class="drink-name">${name}</span>
      <span class="drink-card-price">${formatPrice(drink.price)}</span>
    </div>
    <div class="drink-card-footer">
      <button class="btn btn-outline btn-sm" data-action="edit" data-id="${id}">${EDIT_ICON}<span>Sửa</span></button>
      <button class="btn btn-outline btn-sm" data-action="delete" data-id="${id}">${DELETE_ICON}<span>Xóa</span></button>
    </div>
  </article>`;
}

function renderDrinks() {
  const status = state.drinksStatus;
  const items = status === 'ready' ? visibleDrinks() : [];
  const hasItems = items.length > 0;

  toggle($('loadingState'), status === 'loading');
  toggle($('errorState'), status === 'error');
  toggle($('emptyState'), status === 'ready' && !hasItems);
  toggle($('drinksTableContainer'), hasItems && state.view === 'table');
  toggle($('drinksGridContainer'), hasItems && state.view === 'grid');

  if (status === 'error') {
    $('errorMessageText').textContent = state.drinksError.message;
    $('errorDetailsBox').querySelector('code').textContent = state.drinksError.detail;
    toggle($('btnUseMockFallback'), state.mode === 'api');
  }

  $('drinksTableBody').innerHTML = state.view === 'table' ? items.map(drinkRow).join('') : '';
  $('drinksGridContainer').innerHTML = state.view === 'grid' ? items.map(drinkCard).join('') : '';
  $('tableSummaryText').textContent = `Hiển thị ${items.length} / ${state.drinks.length} món`;
  $('tabDrinkCount').textContent = state.drinks.length;
}

function renderStats() {
  const drinks = state.drinks;
  const prices = drinks.map((drink) => drink.price);
  const onSale = drinks.filter((drink) => drink.status).length;
  const today = new Date().toDateString();
  const todayOrders = state.orders.filter((order) => (
    order.status !== 'cancelled' && new Date(toTimestamp(order.createdAt)).toDateString() === today
  ));
  const waiting = state.orders.filter((order) => ['pending', 'brewing'].includes(order.status)).length;

  $('statTotalDrinks').textContent = drinks.length;
  $('statDrinkHint').textContent = `${onSale} món đang bán`;
  $('statTotalCategories').textContent = new Set(drinks.map((drink) => drink.category)).size;
  $('statAvgPrice').textContent = formatPrice(prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0);
  $('statPriceHint').textContent = prices.length
    ? `Từ ${formatPrice(Math.min(...prices))} đến ${formatPrice(Math.max(...prices))}`
    : 'Chưa có dữ liệu giá';
  $('statTotalOrders').textContent = todayOrders.length;
  $('statPendingOrders').textContent = `${waiting} đơn đang chờ`;
  syncCategoryOptions();
}

function syncCategoryOptions() {
  ['categoryFilter', 'drinkCategory'].forEach((selectId) => {
    const select = $(selectId);
    const known = new Set([...select.options].map((option) => option.value));
    state.drinks.forEach(({ category }) => {
      if (!known.has(category)) {
        known.add(category);
        select.add(new Option(category, category));
      }
    });
  });
}

/* ---------- Hiển thị: đơn hàng ---------- */
function renderOrderDrinkOptions() {
  const select = $('orderDrinkSelect');
  const previous = select.value;
  const available = state.drinks.filter((drink) => drink.status);
  select.innerHTML = available.length
    ? available.map((drink) => `<option value="${escapeHtml(drink.id)}">${escapeHtml(drink.name)} — ${formatPrice(drink.price)}</option>`).join('')
    : '<option value="">Chưa có món đang bán</option>';
  if (available.some((drink) => drink.id === previous)) select.value = previous;
}

const orderCode = (id) => `#${id.padStart(3, '0')}`;

const orderTime = (value) => {
  const timestamp = toTimestamp(value);
  return timestamp
    ? new Date(timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '';
};

function orderActions(order) {
  const id = escapeHtml(order.id);
  const config = ORDER_STATUS[order.status];
  const disabled = state.busyOrders.has(order.id) ? 'disabled' : '';
  const buttons = [];
  if (config.next) {
    buttons.push(`<button class="btn btn-primary btn-sm" data-order-action="advance" data-id="${id}" ${disabled}>${config.action}</button>`);
  }
  if (order.status === 'pending' || order.status === 'brewing') {
    buttons.push(`<button class="btn btn-outline btn-sm" data-order-action="cancel" data-id="${id}" ${disabled}>Hủy</button>`);
  }
  if (!config.next) {
    buttons.push(`<button class="btn btn-outline btn-sm" data-order-action="delete" data-id="${id}" ${disabled}>Xóa</button>`);
  }
  return buttons.join('');
}

function renderOrders() {
  const body = $('ordersTableBody');
  $('tabOrderCount').textContent = state.orders.length;

  if (state.ordersStatus === 'loading') {
    body.innerHTML = '<tr><td class="table-message" colspan="6">Loading... Đang tải danh sách đơn hàng</td></tr>';
    return;
  }
  if (state.ordersStatus === 'error') {
    body.innerHTML = `<tr><td class="table-message" colspan="6">
      <div class="text-danger">${escapeHtml(state.ordersError.message)}</div>
      <button class="btn btn-outline btn-sm" data-order-action="retry">Thử tải lại</button>
    </td></tr>`;
    return;
  }
  if (!state.orders.length) {
    body.innerHTML = '<tr><td class="table-message" colspan="6">Chưa có đơn hàng nào. Hãy tạo đơn ở biểu mẫu bên cạnh.</td></tr>';
    return;
  }

  body.innerHTML = [...state.orders]
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt) || Number(b.id) - Number(a.id))
    .map((order) => `<tr>
      <td><span class="order-code">${escapeHtml(orderCode(order.id))}</span><span class="order-time">${escapeHtml(orderTime(order.createdAt))}</span></td>
      <td>${escapeHtml(order.table)}</td>
      <td><strong>${escapeHtml(order.drinkName)}</strong> × ${order.quantity}${order.note ? `<span class="order-note">${escapeHtml(order.note)}</span>` : ''}</td>
      <td class="price-cell">${formatPrice(order.total)}</td>
      <td class="center-cell"><span class="badge os-${order.status}">${ORDER_STATUS[order.status].label}</span></td>
      <td><div class="order-actions">${orderActions(order)}</div></td>
    </tr>`).join('');
}

/* ---------- Tab & cấu hình ---------- */
function activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
}

function setView(view) {
  state.view = view;
  storage.set(STORAGE_KEYS.view, view);
  $('btnViewTable').classList.toggle('active', view === 'table');
  $('btnViewGrid').classList.toggle('active', view === 'grid');
  renderDrinks();
}

function connectApi(url) {
  state.mode = 'api';
  state.apiUrl = url;
  state.ordersBackend = 'api';
  storage.set(STORAGE_KEYS.apiUrl, url);
  storage.set(STORAGE_KEYS.mode, 'api');
  $('apiUrlInput').value = url;
  activateTab('tab-drinks');
  return loadAll();
}

function useLocalData() {
  state.mode = 'local';
  storage.set(STORAGE_KEYS.mode, 'local');
  activateTab('tab-drinks');
  return loadAll();
}

function readApiInput() {
  const url = parseDrinksUrl($('apiUrlInput').value);
  if (!url) {
    showToast('warning', 'Đường dẫn chưa hợp lệ', 'Hãy nhập URL đầy đủ, kết thúc bằng /drinks.');
    $('apiUrlInput').focus();
  }
  return url;
}

async function testConnection(button) {
  const url = readApiInput();
  if (!url) return;
  button.disabled = true;
  const startedAt = performance.now();
  try {
    const items = await remoteCollection(url).list();
    showToast('success', 'Kết nối thành công', `Nhận ${items.length} món sau ${Math.round(performance.now() - startedAt)} ms.`);
  } catch (error) {
    showToast('error', 'Kết nối thất bại', error.message);
  } finally {
    button.disabled = false;
  }
}

async function replaceAll(repo, items) {
  const existing = await repo.list();
  for (const item of existing) await repo.remove(String(item.id));
  for (const { id, ...item } of items) await repo.create(item);
}

async function restoreSampleDrinks(button) {
  const target = state.mode === 'api' ? 'TẤT CẢ món hiện có trên MockAPI' : 'các thay đổi trong Dữ liệu Nội bộ';
  if (!window.confirm(`Khôi phục dữ liệu mẫu sẽ xóa ${target}. Tiếp tục?`)) return;
  button.disabled = true;
  try {
    if (state.mode === 'api') await replaceAll(drinksRepo(), seedDrinks());
    else localDrinks.reset();
    showToast('success', 'Đã khôi phục thực đơn mẫu');
  } catch (error) {
    showToast('error', 'Khôi phục thất bại', error.message);
  } finally {
    button.disabled = false;
    activateTab('tab-drinks');
    loadDrinks();
  }
}

async function restoreSampleOrders(button) {
  if (!window.confirm('Đặt lại đơn mẫu sẽ xóa toàn bộ đơn hàng hiện có. Tiếp tục?')) return;
  button.disabled = true;
  try {
    const repo = ordersRepo();
    if (repo === localOrders) localOrders.reset();
    else await replaceAll(repo, seedOrders());
    showToast('success', 'Đã đặt lại đơn hàng mẫu');
  } catch (error) {
    showToast('error', 'Đặt lại đơn thất bại', error.message);
  } finally {
    button.disabled = false;
    loadOrders();
  }
}

/* ---------- Modal thêm / sửa món ---------- */
let lastFocused = null;

function openModal(modal, focusTarget) {
  lastFocused = document.activeElement;
  toggle(modal, true);
  document.body.style.overflow = 'hidden';
  focusTarget?.focus();
}

function closeModal(modal) {
  toggle(modal, false);
  document.body.style.overflow = '';
  lastFocused?.focus?.();
}

function setPreview(url) {
  $('drinkImagePreview').src = safeImage(url);
}

function clearDrinkErrors() {
  ['drinkName', 'drinkPrice', 'drinkImage'].forEach((id) => $(id).classList.remove('is-invalid'));
}

function openDrinkModal(drink = null) {
  clearDrinkErrors();
  $('drinkForm').reset();
  $('drinkId').value = drink?.id ?? '';
  $('modalTitle').textContent = drink ? 'Cập Nhật Món Đồ Uống' : 'Thêm Món Đồ Uống Mới';
  $('modalSubtitle').textContent = drink ? `Chỉnh sửa thông tin của "${drink.name}"` : 'Nhập thông tin sản phẩm để lưu vào cơ sở dữ liệu';
  $('modalActionIcon').textContent = drink ? '✏️' : '☕';
  $('btnSubmitDrinkText').textContent = drink ? 'Cập Nhật Món' : 'Lưu Món Đồ Uống';
  if (drink) {
    $('drinkName').value = drink.name;
    $('drinkCategory').value = drink.category;
    $('drinkPrice').value = drink.price;
    $('drinkImage').value = drink.image;
    $('drinkStatus').checked = drink.status;
  }
  setPreview($('drinkImage').value);
  openModal($('drinkModal'), $('drinkName'));
}

function closeDrinkModal() {
  if (!state.saving) closeModal($('drinkModal'));
}

function markInvalid(fieldId, feedbackId, message) {
  $(fieldId).classList.add('is-invalid');
  $(feedbackId).textContent = message;
}

function readDrinkForm() {
  clearDrinkErrors();
  const id = $('drinkId').value;
  const name = $('drinkName').value.trim();
  const price = Number($('drinkPrice').value);
  const image = $('drinkImage').value.trim();
  let valid = true;

  if (name.length < 3 || name.length > 80) {
    markInvalid('drinkName', 'drinkNameFeedback', 'Tên món phải có từ 3 đến 80 ký tự.');
    valid = false;
  } else if (state.drinks.some((drink) => drink.id !== id && normalizeText(drink.name) === normalizeText(name))) {
    markInvalid('drinkName', 'drinkNameFeedback', 'Tên món này đã có trong thực đơn.');
    valid = false;
  }
  if (!Number.isInteger(price) || price < 1000 || price > 10000000) {
    markInvalid('drinkPrice', 'drinkPriceFeedback', 'Giá phải là số nguyên từ 1.000 đến 10.000.000 VNĐ.');
    valid = false;
  }
  if (image && !isHttpUrl(image)) {
    markInvalid('drinkImage', 'drinkImageFeedback', 'Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://.');
    valid = false;
  }
  if (!valid) {
    document.querySelector('#drinkForm .is-invalid')?.focus();
    return null;
  }
  return { name, price, image, category: $('drinkCategory').value, status: $('drinkStatus').checked };
}

function setSaving(saving) {
  state.saving = saving;
  $('btnSubmitDrink').disabled = saving;
  $('btnCancelDrinkModal').disabled = saving;
  toggle($('modalSaveSpinner'), saving);
}

async function submitDrink(event) {
  event.preventDefault();
  if (state.saving) return;
  const values = readDrinkForm();
  if (!values) return;

  const id = $('drinkId').value;
  const current = state.drinks.find((drink) => drink.id === id);
  setSaving(true);
  try {
    if (id) {
      const updated = normalizeDrink(await drinksRepo().update(id, drinkPayload({ ...current, ...values })));
      state.drinks = state.drinks.map((drink) => (drink.id === id ? updated : drink));
      showToast('success', 'Đã cập nhật món', updated.name);
    } else {
      const created = normalizeDrink(await drinksRepo().create(drinkPayload({ ...values, createdAt: new Date().toISOString() })));
      state.drinks = [...state.drinks, created];
      showToast('success', 'Đã thêm món mới', created.name);
    }
    setSaving(false);
    closeDrinkModal();
    renderDrinks();
    renderStats();
    renderOrderDrinkOptions();
  } catch (error) {
    setSaving(false);
    showToast('error', id ? 'Cập nhật thất bại' : 'Thêm món thất bại', error.message);
    if (error.status === 404) {
      closeDrinkModal();
      loadDrinks();
    }
  }
}

/* ---------- Xóa món ---------- */
function openDeleteModal(drink) {
  state.deleteTarget = drink;
  $('deleteDrinkName').textContent = drink.name;
  openModal($('deleteConfirmModal'), $('btnCancelDelete'));
}

function closeDeleteModal() {
  if (!state.deleting) closeModal($('deleteConfirmModal'));
}

function setDeleting(deleting) {
  state.deleting = deleting;
  $('btnConfirmDelete').disabled = deleting;
  $('btnCancelDelete').disabled = deleting;
  toggle($('deleteSpinner'), deleting);
}

async function confirmDelete() {
  const target = state.deleteTarget;
  if (!target || state.deleting) return;
  setDeleting(true);
  try {
    await drinksRepo().remove(target.id);
    state.drinks = state.drinks.filter((drink) => drink.id !== target.id);
    showToast('success', 'Đã xóa món', target.name);
    renderDrinks();
    renderStats();
    renderOrderDrinkOptions();
  } catch (error) {
    showToast('error', 'Xóa món thất bại', error.message);
    if (error.status === 404) loadDrinks();
  } finally {
    setDeleting(false);
    closeDeleteModal();
  }
}

/* ---------- Đơn hàng ---------- */
async function submitOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;

  const drink = state.drinks.find((item) => item.id === $('orderDrinkSelect').value && item.status);
  const quantity = Number($('orderQuantity').value);
  if (!drink) {
    showToast('warning', 'Chưa chọn được món', 'Thực đơn chưa có món đang bán.');
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    showToast('warning', 'Số lượng không hợp lệ', 'Số lượng phải từ 1 đến 50.');
    return;
  }

  button.disabled = true;
  try {
    const created = await ordersRepo().create({
      table: $('orderTableNumber').value,
      drinkId: drink.id,
      drinkName: drink.name,
      unitPrice: drink.price,
      quantity,
      note: $('orderNote').value.trim(),
      total: drink.price * quantity,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    const order = normalizeOrder(created);
    state.orders = [...state.orders, order];
    showToast('success', 'Đã tạo đơn hàng', `${order.drinkName} × ${order.quantity} — ${formatPrice(order.total)}`);
    $('orderQuantity').value = 1;
    $('orderNote').value = '';
    renderOrders();
    renderStats();
  } catch (error) {
    showToast('error', 'Tạo đơn thất bại', error.message);
  } finally {
    button.disabled = false;
  }
}

async function changeOrder(order, work) {
  state.busyOrders.add(order.id);
  renderOrders();
  try {
    await work();
  } catch (error) {
    showToast('error', 'Cập nhật đơn thất bại', error.message);
    if (error.status === 404) loadOrders();
  } finally {
    state.busyOrders.delete(order.id);
    renderOrders();
    renderStats();
  }
}

async function setOrderStatus(order, status) {
  await changeOrder(order, async () => {
    const updated = normalizeOrder(await ordersRepo().update(order.id, orderPayload({ ...order, status })));
    state.orders = state.orders.map((item) => (item.id === order.id ? updated : item));
    showToast('success', `Đơn ${orderCode(order.id)}`, ORDER_STATUS[status].label);
  });
}

function handleOrderAction(event) {
  const button = event.target.closest('[data-order-action]');
  if (!button) return;
  const action = button.dataset.orderAction;
  if (action === 'retry') {
    loadOrders();
    return;
  }
  const order = state.orders.find((item) => item.id === button.dataset.id);
  if (!order || state.busyOrders.has(order.id)) return;

  if (action === 'advance') {
    setOrderStatus(order, ORDER_STATUS[order.status].next);
  } else if (action === 'cancel' && window.confirm(`Hủy đơn ${orderCode(order.id)}?`)) {
    setOrderStatus(order, 'cancelled');
  } else if (action === 'delete' && window.confirm(`Xóa đơn ${orderCode(order.id)} khỏi danh sách?`)) {
    changeOrder(order, async () => {
      await ordersRepo().remove(order.id);
      state.orders = state.orders.filter((item) => item.id !== order.id);
      showToast('success', `Đã xóa đơn ${orderCode(order.id)}`);
    });
  }
}

function handleDrinkAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const drink = state.drinks.find((item) => item.id === button.dataset.id);
  if (!drink) return;
  if (button.dataset.action === 'edit') openDrinkModal(drink);
  else openDeleteModal(drink);
}

/* ---------- Gắn sự kiện & khởi động ---------- */
function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  /* Sự kiện lỗi của ảnh không nổi bọt nên phải bắt ở pha capture. */
  document.addEventListener('error', ({ target }) => {
    if (target.tagName === 'IMG' && target.src !== PLACEHOLDER_IMAGE) target.src = PLACEHOLDER_IMAGE;
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('drinkModal').classList.contains('d-none')) closeDrinkModal();
    if (!$('deleteConfirmModal').classList.contains('d-none')) closeDeleteModal();
  });

  $('searchInput').addEventListener('input', (event) => {
    state.search = event.target.value;
    toggle($('btnClearSearch'), state.search.length > 0);
    renderDrinks();
  });
  $('btnClearSearch').addEventListener('click', () => {
    state.search = '';
    $('searchInput').value = '';
    toggle($('btnClearSearch'), false);
    renderDrinks();
    $('searchInput').focus();
  });
  $('categoryFilter').addEventListener('change', (event) => {
    state.category = event.target.value;
    renderDrinks();
  });
  $('sortBy').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderDrinks();
  });

  $('btnViewTable').addEventListener('click', () => setView('table'));
  $('btnViewGrid').addEventListener('click', () => setView('grid'));
  $('btnReloadDrinks').addEventListener('click', loadDrinks);
  $('btnRetryFetch').addEventListener('click', loadAll);
  $('btnUseMockFallback').addEventListener('click', useLocalData);
  $('btnOpenAddModal').addEventListener('click', () => openDrinkModal());
  $('btnEmptyAdd').addEventListener('click', () => openDrinkModal());
  $('drinksTableBody').addEventListener('click', handleDrinkAction);
  $('drinksGridContainer').addEventListener('click', handleDrinkAction);

  $('drinkForm').addEventListener('submit', submitDrink);
  $('btnCloseDrinkModal').addEventListener('click', closeDrinkModal);
  $('btnCancelDrinkModal').addEventListener('click', closeDrinkModal);
  $('drinkImage').addEventListener('input', (event) => setPreview(event.target.value.trim()));
  document.querySelectorAll('.chip[data-img]').forEach((chip) => {
    chip.addEventListener('click', () => {
      $('drinkImage').value = chip.dataset.img;
      setPreview(chip.dataset.img);
    });
  });

  $('btnCloseDeleteModal').addEventListener('click', closeDeleteModal);
  $('btnCancelDelete').addEventListener('click', closeDeleteModal);
  $('btnConfirmDelete').addEventListener('click', confirmDelete);

  ['drinkModal', 'deleteConfirmModal'].forEach((id) => {
    $(id).addEventListener('mousedown', (event) => {
      if (event.target !== event.currentTarget) return;
      if (id === 'drinkModal') closeDrinkModal();
      else closeDeleteModal();
    });
  });

  $('createOrderForm').addEventListener('submit', submitOrder);
  $('ordersTableBody').addEventListener('click', handleOrderAction);
  $('btnResetOrders').addEventListener('click', (event) => restoreSampleOrders(event.currentTarget));

  $('btnOpenApiConfig').addEventListener('click', () => activateTab('tab-settings'));
  $('btnCloseAlert').addEventListener('click', hideAlert);
  $('btnSaveApiUrl').addEventListener('click', () => {
    const url = readApiInput();
    if (url) connectApi(url);
  });
  $('apiUrlInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('btnSaveApiUrl').click();
  });
  $('btnTestApiConnection').addEventListener('click', (event) => testConnection(event.currentTarget));
  $('btnResetDefaultApi').addEventListener('click', () => {
    if (DEFAULT_API_URL) connectApi(DEFAULT_API_URL);
    else showToast('warning', 'Chưa có API mặc định', 'Hãy khai báo DEFAULT_API_URL trong script.js.');
  });
  $('btnResetToMockData').addEventListener('click', (event) => restoreSampleDrinks(event.currentTarget));
}

function startClock() {
  const tick = () => {
    $('liveClock').textContent = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

function init() {
  const storedUrl = storage.get(STORAGE_KEYS.apiUrl);
  const defaultUrl = DEFAULT_API_URL ? parseDrinksUrl(DEFAULT_API_URL) : null;
  state.apiUrl = storedUrl || defaultUrl || '';
  const storedMode = storage.get(STORAGE_KEYS.mode);
  state.mode = state.apiUrl && storedMode !== 'local' ? 'api' : 'local';
  $('apiUrlInput').value = state.apiUrl;

  bindEvents();
  startClock();
  setView(storage.get(STORAGE_KEYS.view) === 'grid' ? 'grid' : 'table');
  loadAll();
}

init();
