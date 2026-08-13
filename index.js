// Message Limit Counter — предупреждает о приближении к лимиту сообщений
// провайдера и автоматически сбрасывает счётчик после периода бездействия.

const MODULE_NAME = 'message_limit_counter';

const defaultSettings = {
    enabled: true,
    limit: 40,           // после скольки сообщений провайдер банит
    warnAt: 35,           // при каком значении показывать предупреждение
    resetAfterSec: 120,   // через сколько секунд простоя сбрасывать счётчик
};

let counter = 0;
let lastActivity = Date.now();
let tickHandle = null;

function getSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = context.extensionSettings[MODULE_NAME];
    for (const key in defaultSettings) {
        if (settings[key] === undefined) settings[key] = defaultSettings[key];
    }
    return settings;
}

function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

function updateBadge() {
    const settings = getSettings();
    const badge = document.getElementById('mlc-badge');
    if (!badge) return;

    if (!settings.enabled) {
        badge.style.display = 'none';
        return;
    }
    badge.style.display = 'block';

    const secondsLeft = Math.max(0, settings.resetAfterSec - Math.floor((Date.now() - lastActivity) / 1000));
    badge.textContent = counter > 0
        ? `${counter} / ${settings.limit}  ⏳${secondsLeft}s`
        : `${counter} / ${settings.limit}`;

    badge.classList.remove('mlc-ok', 'mlc-warn', 'mlc-danger');
    if (counter >= settings.limit) {
        badge.classList.add('mlc-danger');
    } else if (counter >= settings.warnAt) {
        badge.classList.add('mlc-warn');
    } else {
        badge.classList.add('mlc-ok');
    }
}

function notify(type, message, title) {
    const { toastr } = SillyTavern.getContext();
    if (toastr && typeof toastr[type] === 'function') {
        toastr[type](message, title);
    }
}

function tick() {
    const settings = getSettings();
    if (!settings.enabled) return;

    const idleMs = Date.now() - lastActivity;
    if (counter > 0 && idleMs >= settings.resetAfterSec * 1000) {
        counter = 0;
        updateBadge();
        notify('success', 'Вы сделали паузу — счётчик сообщений обнулён.', 'Лимит сброшен');
    } else {
        updateBadge();
    }
}

function onNewMessage() {
    const settings = getSettings();
    if (!settings.enabled) return;

    counter++;
    lastActivity = Date.now();
    updateBadge();

    if (counter === settings.warnAt) {
        notify(
            'warning',
            `Отправлено ${counter} сообщений подряд. Лимит провайдера — ${settings.limit}, после него возможен бан на 2 часа. Сделайте паузу ~${settings.resetAfterSec} сек, чтобы счётчик сбросился.`,
            'Приближается лимит',
        );
    }

    if (counter === settings.limit) {
        notify(
            'error',
            `Достигнут лимит в ${settings.limit} сообщений! Остановитесь — иначе следующий запрос может привести к временному бану.`,
            'Лимит достигнут',
        );
    }
}

function createBadge() {
    if (document.getElementById('mlc-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'mlc-badge';
    badge.title = 'Счётчик сообщений с последнего простоя. Пауза сбрасывает его.';
    document.body.appendChild(badge);
    updateBadge();
}

function createSettingsUI() {
    if (document.getElementById('mlc-settings')) return;
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container) return;

    const settings = getSettings();
    const html = `
    <div id="mlc-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Счётчик лимита сообщений</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="mlc-enabled" ${settings.enabled ? 'checked' : ''}>
                    Включено
                </label>
                <label>Лимит сообщений провайдера
                    <input type="number" id="mlc-limit" min="1" value="${settings.limit}">
                </label>
                <label>Предупреждать при значении
                    <input type="number" id="mlc-warn" min="1" value="${settings.warnAt}">
                </label>
                <label>Сброс после простоя, сек
                    <input type="number" id="mlc-reset" min="5" value="${settings.resetAfterSec}">
                </label>
                <div class="mlc-hint">
                    Счётчик растёт на каждое ваше сообщение и каждый ответ ИИ.
                    Если ничего не отправлять указанное число секунд, счётчик обнулится сам.
                </div>
            </div>
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);

    document.getElementById('mlc-enabled').addEventListener('change', (e) => {
        settings.enabled = e.target.checked;
        saveSettings();
        updateBadge();
    });
    document.getElementById('mlc-limit').addEventListener('change', (e) => {
        settings.limit = Math.max(1, Number(e.target.value) || defaultSettings.limit);
        saveSettings();
        updateBadge();
    });
    document.getElementById('mlc-warn').addEventListener('change', (e) => {
        settings.warnAt = Math.max(1, Number(e.target.value) || defaultSettings.warnAt);
        saveSettings();
        updateBadge();
    });
    document.getElementById('mlc-reset').addEventListener('change', (e) => {
        settings.resetAfterSec = Math.max(5, Number(e.target.value) || defaultSettings.resetAfterSec);
        saveSettings();
    });
}

jQuery(async () => {
    const context = SillyTavern.getContext();
    getSettings();

    createBadge();
    createSettingsUI();

    tickHandle = setInterval(tick, 1000);

    context.eventSource.on(context.eventTypes.MESSAGE_SENT, onNewMessage);
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, onNewMessage);
});