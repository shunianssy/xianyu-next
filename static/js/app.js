
// 全局变量
const apiBase = location.origin;
let keywordsData = {};
let currentCookieId = '';
let editCookieId = '';
let authToken = localStorage.getItem('auth_token');
let dashboardData = {
    accounts: [],
    totalKeywords: 0
};

// 账号关键词缓存
let accountKeywordCache = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30秒缓存
let cookieConnectionStatusCache = {};
let cookieConnectionCheckTimer = null;
const COOKIE_CONNECTION_CHECK_INTERVAL = 600000; // 10分钟
const COOKIE_CONNECTION_REQUEST_TIMEOUT = 15000; // 15秒请求超时

// 菜单切换功能
function showSection(sectionName) {
    console.log('切换到页面:', sectionName); // 调试信息

    // 隐藏所有内容区域
    document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
    });

    // 移除所有菜单项的active状态
    document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    });

    // 显示选中的内容区域
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
    targetSection.classList.add('active');
    console.log('页面已激活:', sectionName + '-section'); // 调试信息
    } else {
    console.error('找不到页面元素:', sectionName + '-section'); // 调试信息
    }

    // 设置对应菜单项为active（修复event.target问题）
    const menuLinks = document.querySelectorAll('.nav-link');
    menuLinks.forEach(link => {
    if (link.onclick && link.onclick.toString().includes(`showSection('${sectionName}')`)) {
        link.classList.add('active');
    }
    });

    // 根据不同section加载对应数据
    switch(sectionName) {
    case 'dashboard':
        loadDashboard();
        break;
    case 'accounts':
        loadCookies();
        break;
    case 'items':
        loadItems();
        break;
    case 'auto-reply':
        refreshAccountList();
        break;
    case 'cards':
        loadCards();
        break;
    case 'auto-delivery':
        loadDeliveryRules();
        break;
    case 'notification-channels':
        loadNotificationChannels();
        break;
    case 'message-notifications':
        loadMessageNotifications();
        break;
    case 'logs':
        // 如果没有日志数据，则加载
        setTimeout(() => {
        if (!window.allLogs || window.allLogs.length === 0) {
            refreshLogs();
        }
        }, 100);
        break;
    }

    // 如果切换到非日志页面，停止自动刷新
    if (sectionName !== 'logs' && window.autoRefreshInterval) {
    clearInterval(window.autoRefreshInterval);
    window.autoRefreshInterval = null;
    const button = document.querySelector('#autoRefreshText');
    const icon = button?.previousElementSibling;
    if (button) {
        button.textContent = '开启自动刷新';
        if (icon) icon.className = 'bi bi-play-circle me-1';
    }
    }

    if (sectionName !== 'accounts') {
        stopCookieConnectionChecks();
    }
}

// 移动端侧边栏切换
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('show');
}

// 加载仪表盘数据
async function loadDashboard() {
    try {
    toggleLoading(true);

    // 获取账号列表
    const cookiesResponse = await fetch(`${apiBase}/cookies/details`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (cookiesResponse.ok) {
        const cookiesData = await cookiesResponse.json();

        // 为每个账号获取关键词信息
        const accountsWithKeywords = await Promise.all(
        cookiesData.map(async (account) => {
            try {
            const keywordsResponse = await fetch(`${apiBase}/keywords/${account.id}`, {
                headers: {
                'Authorization': `Bearer ${authToken}`
                }
            });

            if (keywordsResponse.ok) {
                const keywordsData = await keywordsResponse.json();
                return {
                ...account,
                keywords: keywordsData,
                keywordCount: keywordsData.length
                };
            } else {
                return {
                ...account,
                keywords: [],
                keywordCount: 0
                };
            }
            } catch (error) {
            console.error(`获取账号 ${account.id} 关键词失败:`, error);
            return {
                ...account,
                keywords: [],
                keywordCount: 0
            };
            }
        })
        );

        dashboardData.accounts = accountsWithKeywords;

        // 计算统计数据
        let totalKeywords = 0;
        let activeAccounts = 0;
        let enabledAccounts = 0;

        accountsWithKeywords.forEach(account => {
        const keywordCount = account.keywordCount || 0;
        const isEnabled = account.enabled === undefined ? true : account.enabled;

        if (isEnabled) {
            enabledAccounts++;
            totalKeywords += keywordCount;
            if (keywordCount > 0) {
            activeAccounts++;
            }
        }
        });

        dashboardData.totalKeywords = totalKeywords;

        // 更新仪表盘显示
        updateDashboardStats(accountsWithKeywords.length, totalKeywords, enabledAccounts);
        updateDashboardAccountsList(accountsWithKeywords);
    }
    } catch (error) {
    console.error('加载仪表盘数据失败:', error);
    showToast('加载仪表盘数据失败', 'danger');
    } finally {
    toggleLoading(false);
    }
}

// 更新仪表盘统计数据
function updateDashboardStats(totalAccounts, totalKeywords, enabledAccounts) {
    document.getElementById('totalAccounts').textContent = totalAccounts;
    document.getElementById('totalKeywords').textContent = totalKeywords;
    document.getElementById('activeAccounts').textContent = enabledAccounts;
}

// 更新仪表盘账号列表
function updateDashboardAccountsList(accounts) {
    const tbody = document.getElementById('dashboardAccountsList');
    tbody.innerHTML = '';

    if (accounts.length === 0) {
    tbody.innerHTML = `
        <tr>
        <td colspan="4" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            暂无账号数据
        </td>
        </tr>
    `;
    return;
    }

    accounts.forEach(account => {
    const keywordCount = account.keywordCount || 0;
    const isEnabled = account.enabled === undefined ? true : account.enabled;

    let status = '';
    if (!isEnabled) {
        status = '<span class="badge bg-danger">已禁用</span>';
    } else if (keywordCount > 0) {
        status = '<span class="badge bg-success">活跃</span>';
    } else {
        status = '<span class="badge bg-secondary">未配置</span>';
    }

    const row = document.createElement('tr');
    row.className = isEnabled ? '' : 'table-secondary';
    row.innerHTML = `
        <td>
        <strong class="text-primary ${!isEnabled ? 'text-muted' : ''}">${account.id}</strong>
        ${!isEnabled ? '<i class="bi bi-pause-circle-fill text-danger ms-1" title="已禁用"></i>' : ''}
        </td>
        <td>
        <span class="badge ${isEnabled ? 'bg-primary' : 'bg-secondary'}">${keywordCount} 个关键词</span>
        </td>
        <td>${status}</td>
        <td>
        <small class="text-muted">${new Date().toLocaleString()}</small>
        </td>
    `;
    tbody.appendChild(row);
    });
}

// 获取账号关键词数量（带缓存）- 包含普通关键词和商品关键词
async function getAccountKeywordCount(accountId) {
    const now = Date.now();

    // 检查缓存
    if (accountKeywordCache[accountId] && (now - cacheTimestamp) < CACHE_DURATION) {
    return accountKeywordCache[accountId];
    }

    try {
    const response = await fetch(`${apiBase}/keywords/${accountId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const keywordsData = await response.json();
        // 现在API返回的是包含普通关键词和商品关键词的完整列表
        const count = keywordsData.length;

        // 更新缓存
        accountKeywordCache[accountId] = count;
        cacheTimestamp = now;

        return count;
    } else {
        return 0;
    }
    } catch (error) {
    console.error(`获取账号 ${accountId} 关键词失败:`, error);
    return 0;
    }
}

// 清除关键词缓存
function clearKeywordCache() {
    accountKeywordCache = {};
    cacheTimestamp = 0;
}

// 刷新账号列表（用于自动回复页面）
async function refreshAccountList() {
    try {
    toggleLoading(true);

    // 获取账号列表
    const response = await fetch(`${apiBase}/cookies/details`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const accounts = await response.json();
        const select = document.getElementById('accountSelect');
        select.innerHTML = '<option value="">🔍 请选择一个账号开始配置...</option>';

        // 为每个账号获取关键词数量
        const accountsWithKeywords = await Promise.all(
        accounts.map(async (account) => {
            try {
            const keywordsResponse = await fetch(`${apiBase}/keywords/${account.id}`, {
                headers: {
                'Authorization': `Bearer ${authToken}`
                }
            });

            if (keywordsResponse.ok) {
                const keywordsData = await keywordsResponse.json();
                return {
                ...account,
                keywords: keywordsData,
                keywordCount: keywordsData.length
                };
            } else {
                return {
                ...account,
                keywordCount: 0
                };
            }
            } catch (error) {
            console.error(`获取账号 ${account.id} 关键词失败:`, error);
            return {
                ...account,
                keywordCount: 0
            };
            }
        })
        );

        // 渲染账号选项（显示所有账号，但标识禁用状态）
        if (accountsWithKeywords.length === 0) {
        select.innerHTML = '<option value="">❌ 暂无账号，请先添加账号</option>';
        return;
        }

        // 分组显示：先显示启用的账号，再显示禁用的账号
        const enabledAccounts = accountsWithKeywords.filter(account => {
        const enabled = account.enabled === undefined ? true : account.enabled;
        console.log(`账号 ${account.id} 过滤状态: enabled=${account.enabled}, 判断为启用=${enabled}`); // 调试信息
        return enabled;
        });
        const disabledAccounts = accountsWithKeywords.filter(account => {
        const enabled = account.enabled === undefined ? true : account.enabled;
        return !enabled;
        });

        // 渲染启用的账号
        enabledAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;

        // 根据关键词数量显示不同的图标和样式
        let icon = '📝';
        let status = '';
        if (account.keywordCount === 0) {
            icon = '⚪';
            status = ' (未配置)';
        } else if (account.keywordCount >= 5) {
            icon = '🟢';
            status = ` (${account.keywordCount} 个关键词)`;
        } else {
            icon = '🟡';
            status = ` (${account.keywordCount} 个关键词)`;
        }

        option.textContent = `${icon} ${account.id}${status}`;
        select.appendChild(option);
        });

        // 如果有禁用的账号，添加分隔线和禁用账号
        if (disabledAccounts.length > 0) {
        // 添加分隔线
        const separatorOption = document.createElement('option');
        separatorOption.disabled = true;
        separatorOption.textContent = `--- 禁用账号 (${disabledAccounts.length} 个) ---`;
        select.appendChild(separatorOption);

        // 渲染禁用的账号
        disabledAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;

            // 禁用账号使用特殊图标和样式
            let icon = '🔴';
            let status = '';
            if (account.keywordCount === 0) {
            status = ' (未配置) [已禁用]';
            } else {
            status = ` (${account.keywordCount} 个关键词) [已禁用]`;
            }

            option.textContent = `${icon} ${account.id}${status}`;
            option.style.color = '#6b7280';
            option.style.fontStyle = 'italic';
            select.appendChild(option);
        });
        }

        console.log('账号列表刷新完成，关键词统计:', accountsWithKeywords.map(a => ({id: a.id, keywords: a.keywordCount})));
    } else {
        showToast('获取账号列表失败', 'danger');
    }
    } catch (error) {
    console.error('刷新账号列表失败:', error);
    showToast('刷新账号列表失败', 'danger');
    } finally {
    toggleLoading(false);
    }
}

// 加载账号关键词
async function loadAccountKeywords() {
    const accountId = document.getElementById('accountSelect').value;
    const keywordManagement = document.getElementById('keywordManagement');

    if (!accountId) {
    keywordManagement.style.display = 'none';
    return;
    }

    try {
    toggleLoading(true);
    currentCookieId = accountId;

    // 获取账号详情以检查状态
    const accountResponse = await fetch(`${apiBase}/cookies/details`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    let accountStatus = true; // 默认启用
    if (accountResponse.ok) {
        const accounts = await accountResponse.json();
        const currentAccount = accounts.find(acc => acc.id === accountId);
        accountStatus = currentAccount ? (currentAccount.enabled === undefined ? true : currentAccount.enabled) : true;
        console.log(`加载关键词时账号 ${accountId} 状态: enabled=${currentAccount?.enabled}, accountStatus=${accountStatus}`); // 调试信息
    }

    const response = await fetch(`${apiBase}/keywords-with-item-id/${accountId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        console.log('从服务器获取的关键词数据:', data); // 调试信息

        // 后端返回的是 [{keyword, reply, item_id, type, image_url}, ...] 格式，直接使用
        const formattedData = data;

        console.log('格式化后的关键词数据:', formattedData); // 调试信息
        keywordsData[accountId] = formattedData;
        renderKeywordsList(formattedData);

        // 加载商品列表
        await loadItemsList(accountId);

        // 更新账号徽章显示
        updateAccountBadge(accountId, accountStatus);

        keywordManagement.style.display = 'block';
    } else {
        showToast('加载关键词失败', 'danger');
    }
    } catch (error) {
    console.error('加载关键词失败:', error);
    showToast('加载关键词失败', 'danger');
    } finally {
    toggleLoading(false);
    }
}

// 更新账号徽章显示
function updateAccountBadge(accountId, isEnabled) {
    const badge = document.getElementById('currentAccountBadge');
    if (!badge) return;

    const statusIcon = isEnabled ? '🟢' : '🔴';
    const statusText = isEnabled ? '启用' : '禁用';
    const statusClass = isEnabled ? 'bg-success' : 'bg-warning';

    badge.innerHTML = `
    <span class="badge ${statusClass} me-2">
        ${statusIcon} ${accountId}
    </span>
    <small class="text-muted">
        状态: ${statusText}
        ${!isEnabled ? ' (配置的关键词不会参与自动回复)' : ''}
    </small>
    `;
}

// 显示添加关键词表单
function showAddKeywordForm() {
    const form = document.getElementById('addKeywordForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';

    if (form.style.display === 'block') {
    document.getElementById('newKeyword').focus();
    }
}

// 加载商品列表
async function loadItemsList(accountId) {
    try {
    const response = await fetch(`${apiBase}/items/${accountId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        const items = data.items || [];

        // 更新商品选择下拉框
        const selectElement = document.getElementById('newItemIdSelect');
        if (selectElement) {
        // 清空现有选项（保留第一个默认选项）
        selectElement.innerHTML = '<option value="">选择商品或留空表示通用关键词</option>';

        // 添加商品选项
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.item_id;
            option.textContent = `${item.item_id} - ${item.item_title}`;
            selectElement.appendChild(option);
        });
        }

        console.log(`加载了 ${items.length} 个商品到选择列表`);
    } else {
        console.warn('加载商品列表失败:', response.status);
    }
    } catch (error) {
    console.error('加载商品列表时发生错误:', error);
    }
}



// 添加或更新关键词
async function addKeyword() {
    const keyword = document.getElementById('newKeyword').value.trim();
    const reply = document.getElementById('newReply').value.trim();
    const itemId = document.getElementById('newItemIdSelect').value.trim();

    if (!keyword || !reply) {
    showToast('请填写关键词和回复内容', 'warning');
    return;
    }

    if (!currentCookieId) {
    showToast('请先选择账号', 'warning');
    return;
    }

    // 检查是否为编辑模式
    const isEditMode = typeof window.editingIndex !== 'undefined';
    const actionText = isEditMode ? '更新' : '添加';

    try {
    toggleLoading(true);

    // 获取当前关键词列表
    let currentKeywords = [...(keywordsData[currentCookieId] || [])];

    // 如果是编辑模式，先移除原关键词
    if (isEditMode) {
        currentKeywords.splice(window.editingIndex, 1);
    }

    // 准备要保存的关键词列表
    let keywordsToSave = [...currentKeywords];

    // 如果是编辑模式，先移除原关键词
    if (isEditMode && typeof window.editingIndex !== 'undefined') {
        keywordsToSave.splice(window.editingIndex, 1);
    }

    // 检查关键词是否已存在（考虑商品ID）
    const existingKeyword = keywordsToSave.find(item =>
        item.keyword === keyword &&
        (item.item_id || '') === (itemId || '')
    );
    if (existingKeyword) {
        const itemIdText = itemId ? `（商品ID: ${itemId}）` : '（通用关键词）';
        showToast(`关键词 "${keyword}" ${itemIdText} 已存在，请使用其他关键词或商品ID`, 'warning');
        toggleLoading(false);
        return;
    }

    // 添加新关键词或更新的关键词
    const newKeyword = {
        keyword: keyword,
        reply: reply,
        item_id: itemId || ''
    };
    keywordsToSave.push(newKeyword);

    const response = await fetch(`${apiBase}/keywords-with-item-id/${currentCookieId}`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
        keywords: keywordsToSave
        })
    });

    if (response.ok) {
        showToast(`✨ 关键词 "${keyword}" ${actionText}成功！`, 'success');

        // 清空输入框并重置样式
        const keywordInput = document.getElementById('newKeyword');
        const replyInput = document.getElementById('newReply');
        const selectElement = document.getElementById('newItemIdSelect');
        const addBtn = document.querySelector('.add-btn');

        keywordInput.value = '';
        replyInput.value = '';
        if (selectElement) {
        selectElement.value = '';
        }
        keywordInput.style.borderColor = '#e5e7eb';
        replyInput.style.borderColor = '#e5e7eb';
        addBtn.style.opacity = '0.7';
        addBtn.style.transform = 'scale(0.95)';

        // 如果是编辑模式，重置编辑状态
        if (isEditMode) {
        delete window.editingIndex;
        delete window.originalKeyword;

        // 恢复添加按钮
        addBtn.innerHTML = '<i class="bi bi-plus-lg"></i>添加';
        addBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

        // 移除取消按钮
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) {
            cancelBtn.remove();
        }
        }

        // 聚焦到关键词输入框，方便连续添加
        setTimeout(() => {
        keywordInput.focus();
        }, 100);

        loadAccountKeywords(); // 重新加载关键词列表
        clearKeywordCache(); // 清除缓存
    } else {
        const errorText = await response.text();
        console.error('关键词添加失败:', errorText);
        showToast('关键词添加失败', 'danger');
    }
    } catch (error) {
    console.error('添加关键词失败:', error);
    showToast('添加关键词失败', 'danger');
    } finally {
    toggleLoading(false);
    }
}

// 渲染现代化关键词列表
function renderKeywordsList(keywords) {
    console.log('渲染关键词列表:', keywords); // 调试信息
    const container = document.getElementById('keywordsList');

    if (!container) {
    console.error('找不到关键词列表容器元素');
    return;
    }

    container.innerHTML = '';

    if (!keywords || keywords.length === 0) {
    console.log('关键词列表为空，显示空状态');
    container.innerHTML = `
        <div class="empty-state">
        <i class="bi bi-chat-dots"></i>
        <h3>还没有关键词</h3>
        <p>添加第一个关键词，让您的闲鱼店铺自动回复客户消息</p>
        <button class="quick-add-btn" onclick="focusKeywordInput()">
            <i class="bi bi-plus-lg me-2"></i>立即添加
        </button>
        </div>
    `;
    return;
    }

    console.log(`开始渲染 ${keywords.length} 个关键词`);

    keywords.forEach((item, index) => {
    console.log(`渲染关键词 ${index + 1}:`, item); // 调试信息

    const keywordItem = document.createElement('div');
    keywordItem.className = 'keyword-item';

    // 判断关键词类型
    const keywordType = item.type || 'text'; // 默认为文本类型
    const isImageType = keywordType === 'image';

    // 类型标识
    const typeBadge = isImageType ?
        '<span class="keyword-type-badge keyword-type-image"><i class="bi bi-image"></i> 图片</span>' :
        '<span class="keyword-type-badge keyword-type-text"><i class="bi bi-chat-text"></i> 文本</span>';

    // 商品ID显示
    const itemIdDisplay = item.item_id ?
        `<small class="text-muted d-block"><i class="bi bi-box"></i> 商品ID: ${item.item_id}</small>` :
        '<small class="text-muted d-block"><i class="bi bi-globe"></i> 通用关键词</small>';

    // 内容显示
    let contentDisplay = '';
    if (isImageType) {
        // 图片类型显示图片预览
        const imageUrl = item.reply || item.image_url || '';
        contentDisplay = imageUrl ?
            `<div class="d-flex align-items-center gap-3">
                <img src="${imageUrl}" alt="关键词图片" class="keyword-image-preview" onclick="showImageModal('${imageUrl}')">
                <div class="flex-grow-1">
                    <p class="reply-text mb-0">用户发送关键词时将回复此图片</p>
                    <small class="text-muted">点击图片查看大图</small>
                </div>
            </div>` :
            '<p class="reply-text text-muted">图片加载失败</p>';
    } else {
        // 文本类型显示文本内容
        contentDisplay = `<p class="reply-text">${item.reply || ''}</p>`;
    }

    keywordItem.innerHTML = `
        <div class="keyword-item-header">
        <div class="keyword-tag">
            <i class="bi bi-tag-fill"></i>
            ${item.keyword}
            ${typeBadge}
            ${itemIdDisplay}
        </div>
        <div class="keyword-actions">
            <button class="action-btn edit-btn ${isImageType ? 'edit-btn-disabled' : ''}" onclick="${isImageType ? 'editImageKeyword' : 'editKeyword'}(${index})" title="${isImageType ? '图片关键词不支持编辑' : '编辑'}">
            <i class="bi bi-pencil"></i>
            </button>
            <button class="action-btn delete-btn" onclick="deleteKeyword('${currentCookieId}', ${index})" title="删除">
            <i class="bi bi-trash"></i>
            </button>
        </div>
        </div>
        <div class="keyword-content">
        ${contentDisplay}
        </div>
    `;
    container.appendChild(keywordItem);
    });

    console.log('关键词列表渲染完成');
}

// 聚焦到关键词输入框
function focusKeywordInput() {
    document.getElementById('newKeyword').focus();
}

// 编辑关键词 - 改进版本
function editKeyword(index) {
    const keywords = keywordsData[currentCookieId] || [];
    const keyword = keywords[index];

    if (!keyword) {
    showToast('关键词不存在', 'warning');
    return;
    }

    // 将关键词信息填入输入框
    document.getElementById('newKeyword').value = keyword.keyword;
    document.getElementById('newReply').value = keyword.reply;

    // 设置商品ID选择框
    const selectElement = document.getElementById('newItemIdSelect');
    if (selectElement) {
    selectElement.value = keyword.item_id || '';
    }

    // 设置编辑模式标识
    window.editingIndex = index;
    window.originalKeyword = keyword.keyword;
    window.originalItemId = keyword.item_id || '';

    // 更新按钮文本和样式
    const addBtn = document.querySelector('.add-btn');
    addBtn.innerHTML = '<i class="bi bi-check-lg"></i>更新';
    addBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';

    // 显示取消按钮
    showCancelEditButton();

    // 聚焦到关键词输入框并选中文本
    setTimeout(() => {
    const keywordInput = document.getElementById('newKeyword');
    keywordInput.focus();
    keywordInput.select();
    }, 100);

    showToast('📝 编辑模式：修改后点击"更新"按钮保存', 'info');
}

// 显示取消编辑按钮
function showCancelEditButton() {
    // 检查是否已存在取消按钮
    if (document.getElementById('cancelEditBtn')) {
    return;
    }

    const addBtn = document.querySelector('.add-btn');
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelEditBtn';
    cancelBtn.className = 'btn btn-outline-secondary';
    cancelBtn.style.marginLeft = '0.5rem';
    cancelBtn.innerHTML = '<i class="bi bi-x-lg"></i>取消';
    cancelBtn.onclick = cancelEdit;

    addBtn.parentNode.appendChild(cancelBtn);
}

// 取消编辑
function cancelEdit() {
    // 清空输入框
    document.getElementById('newKeyword').value = '';
    document.getElementById('newReply').value = '';

    // 清空商品ID选择框
    const selectElement = document.getElementById('newItemIdSelect');
    if (selectElement) {
    selectElement.value = '';
    }

    // 重置编辑状态
    delete window.editingIndex;
    delete window.originalKeyword;
    delete window.originalItemId;

    // 恢复添加按钮
    const addBtn = document.querySelector('.add-btn');
    addBtn.innerHTML = '<i class="bi bi-plus-lg"></i>添加';
    addBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

    // 移除取消按钮
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
    cancelBtn.remove();
    }

    showToast('已取消编辑', 'info');
}

// 删除关键词
async function deleteKeyword(cookieId, index) {
    if (!confirm('确定要删除这个关键词吗？')) {
    return;
    }

    try {
    toggleLoading(true);

    // 使用新的删除API
    const response = await fetch(`${apiBase}/keywords/${cookieId}/${index}`, {
        method: 'DELETE',
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        showToast('关键词删除成功', 'success');
        // 重新加载关键词列表
        loadAccountKeywords();
        clearKeywordCache(); // 清除缓存
    } else {
        const errorText = await response.text();
        console.error('关键词删除失败:', errorText);
        showToast('关键词删除失败', 'danger');
    }
    } catch (error) {
    console.error('删除关键词失败:', error);
    showToast('删除关键词删除失败', 'danger');
    } finally {
    toggleLoading(false);
    }
}

// 显示/隐藏加载动画
function toggleLoading(show) {
    document.getElementById('loading').classList.toggle('d-none', !show);
}

// 显示提示消息
function showToast(message, type = 'success') {
    const toastContainer = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    toast.innerHTML = `
    <div class="d-flex">
        <div class="toast-body">
        ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    `;

    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();

    // 自动移除
    toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
    });
}

// 错误处理
async function handleApiError(err) {
    console.error(err);
    showToast(err.message || '操作失败', 'danger');
    toggleLoading(false);
}

// API请求包装
async function fetchJSON(url, opts = {}) {
    toggleLoading(true);
    try {
    // 添加认证头
    if (authToken) {
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(url, opts);
    if (res.status === 401) {
        // 未授权，跳转到登录页面
        localStorage.removeItem('auth_token');
        window.location.href = '/';
        return;
    }
    if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
        const errorText = await res.text();
        if (errorText) {
            // 尝试解析JSON错误信息
            try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.detail || errorJson.message || errorText;
            } catch {
            errorMessage = errorText;
            }
        }
        } catch {
        errorMessage = `HTTP ${res.status} ${res.statusText}`;
        }
        throw new Error(errorMessage);
    }
    const data = await res.json();
    toggleLoading(false);
    return data;
    } catch (err) {
    handleApiError(err);
    throw err;
    }
}

function isAccountsSectionActive() {
    const section = document.getElementById('accounts-section');
    return section && section.classList.contains('active');
}

function formatCookieConnectionTime(timestamp) {
    if (!timestamp) return '未检查';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function getCookieConnectionState(status) {
    if (!status) {
        return {
            badgeClass: 'bg-secondary',
            icon: 'question-circle',
            text: '未测试',
            message: '尚未检查账号连接状态',
            checkedAt: null
        };
    }

    if (status.status === 'checking') {
        const checkedAt = status.checked_at || 0;
        const isStale = checkedAt && (Date.now() / 1000 - checkedAt > 60);
        if (isStale) {
            return {
                badgeClass: 'bg-warning text-dark',
                icon: 'exclamation-triangle-fill',
                text: '异常',
                message: '连接测试请求超时，请手动重试',
                checkedAt: status.checked_at
            };
        }

        return {
            badgeClass: 'bg-info',
            icon: 'arrow-repeat',
            text: '测试中',
            message: '正在检查账号连接状态',
            checkedAt: status.checked_at
        };
    }

    if (status.valid) {
        return {
            badgeClass: 'bg-success',
            icon: 'check-circle-fill',
            text: '有效',
            message: status.message || '账号连接有效',
            checkedAt: status.checked_at
        };
    }

    if (status.status === 'invalid') {
        return {
            badgeClass: 'bg-danger',
            icon: 'x-circle-fill',
            text: '失效',
            message: status.message || 'Cookie无效或已过期',
            checkedAt: status.checked_at
        };
    }

    return {
        badgeClass: 'bg-warning text-dark',
        icon: 'exclamation-triangle-fill',
        text: '异常',
        message: status.message || '无法确认连接状态',
        checkedAt: status.checked_at
    };
}

function renderCookieConnectionStatus(accountId) {
    const status = cookieConnectionStatusCache[accountId];
    const state = getCookieConnectionState(status);
    const title = `${state.message}；检查时间：${formatCookieConnectionTime(state.checkedAt)}`;
    return `
        <div class="d-flex align-items-center gap-2 cookie-connection-status" data-cookie-id="${escapeHtml(accountId)}">
            <span class="badge ${state.badgeClass}" title="${escapeHtml(title)}">
                <i class="bi bi-${state.icon}"></i> ${state.text}
            </span>
            <button class="btn btn-sm btn-outline-secondary" data-cookie-id="${escapeHtml(accountId)}" onclick="checkCookieConnectionFromButton(this)" title="立即测试账号连接状态">
                <i class="bi bi-lightning-charge"></i>
            </button>
        </div>
        <small class="text-muted d-block mt-1">${formatCookieConnectionTime(state.checkedAt)}</small>
    `;
}

function checkCookieConnectionFromButton(button) {
    const accountId = button?.dataset?.cookieId;
    if (accountId) {
        checkCookieConnection(accountId, true);
    }
}

function updateCookieConnectionCell(accountId) {
    const cell = Array.from(document.querySelectorAll('.cookie-connection-cell'))
        .find(element => element.dataset.cookieId === accountId);
    if (cell) {
        cell.innerHTML = renderCookieConnectionStatus(accountId);
    }
}

async function requestCookieConnectionCheck(accountId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), COOKIE_CONNECTION_REQUEST_TIMEOUT);

    let res;
    try {
        res = await fetch(`${apiBase}/cookies/${encodeURIComponent(accountId)}/connection-test`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (res.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = '/';
        return null;
    }

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
    }

    return await res.json();
}

async function checkCookieConnection(accountId, manual = false) {
    try {
        cookieConnectionStatusCache[accountId] = {
            status: 'checking',
            valid: false,
            message: '正在检查账号连接状态',
            checked_at: Math.floor(Date.now() / 1000)
        };
        updateCookieConnectionCell(accountId);

        const result = await requestCookieConnectionCheck(accountId);
        if (!result) return;

        cookieConnectionStatusCache[accountId] = result;
        updateCookieConnectionCell(accountId);

        if (manual) {
            showToast(`账号 "${accountId}" 连接测试：${result.valid ? '连接有效' : result.message}`, result.valid ? 'success' : 'warning');
        }
    } catch (err) {
        const message = err.name === 'AbortError'
            ? '连接测试超过15秒未返回，请稍后重试'
            : (err.message || '检查失败');
        cookieConnectionStatusCache[accountId] = {
            status: 'error',
            valid: false,
            message,
            checked_at: Math.floor(Date.now() / 1000)
        };
        updateCookieConnectionCell(accountId);
        if (manual) {
            showToast(`账号 "${accountId}" 连接测试失败`, 'danger');
        }
    }
}

async function checkAllCookieConnections() {
    if (!isAccountsSectionActive()) return;

    try {
        const res = await fetch(`${apiBase}/cookies/connection-tests`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.status === 401) {
            localStorage.removeItem('auth_token');
            window.location.href = '/';
            return;
        }

        if (!res.ok) return;

        const data = await res.json();
        (data.results || []).forEach(result => {
            cookieConnectionStatusCache[result.cookie_id] = result;
            updateCookieConnectionCell(result.cookie_id);
        });
    } catch (err) {
        console.warn('Cookie连接测试失败:', err);
    }
}

function startCookieConnectionChecks() {
    if (cookieConnectionCheckTimer) {
        clearInterval(cookieConnectionCheckTimer);
    }

    checkAllCookieConnections();
    cookieConnectionCheckTimer = setInterval(checkAllCookieConnections, COOKIE_CONNECTION_CHECK_INTERVAL);
}

function stopCookieConnectionChecks() {
    if (cookieConnectionCheckTimer) {
        clearInterval(cookieConnectionCheckTimer);
        cookieConnectionCheckTimer = null;
    }
}

// 加载Cookie列表
async function loadCookies() {
    try {
    toggleLoading(true);
    const tbody = document.querySelector('#cookieTable tbody');
    tbody.innerHTML = '';

    const cookieDetails = await fetchJSON(apiBase + '/cookies/details');

    if (cookieDetails.length === 0) {
        tbody.innerHTML = `
        <tr>
            <td colspan="9" class="text-center py-4 text-muted empty-state">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            <h5>暂无账号</h5>
            <p class="mb-0">请添加新的闲鱼账号开始使用</p>
            </td>
        </tr>
        `;
        return;
    }

    // 为每个账号获取关键词数量和默认回复设置并渲染
    const accountsWithKeywords = await Promise.all(
        cookieDetails.map(async (cookie) => {
        try {
            // 获取关键词数量
            const keywordsResponse = await fetch(`${apiBase}/keywords/${cookie.id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
            });

            let keywordCount = 0;
            if (keywordsResponse.ok) {
            const keywordsData = await keywordsResponse.json();
            keywordCount = keywordsData.length;
            }

            // 获取默认回复设置
            const defaultReplyResponse = await fetch(`${apiBase}/default-replies/${cookie.id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
            });

            let defaultReply = { enabled: false, reply_content: '' };
            if (defaultReplyResponse.ok) {
            defaultReply = await defaultReplyResponse.json();
            }

            // 获取AI回复设置
            const aiReplyResponse = await fetch(`${apiBase}/ai-reply-settings/${cookie.id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
            });

            let aiReply = { ai_enabled: false, model_name: 'qwen-plus' };
            if (aiReplyResponse.ok) {
            aiReply = await aiReplyResponse.json();
            }

            return {
            ...cookie,
            keywordCount: keywordCount,
            defaultReply: defaultReply,
            aiReply: aiReply
            };
        } catch (error) {
            return {
            ...cookie,
            keywordCount: 0,
            defaultReply: { enabled: false, reply_content: '' },
            aiReply: { ai_enabled: false, model_name: 'qwen-plus' }
            };
        }
        })
    );

    accountsWithKeywords.forEach(cookie => {
        // 使用数据库中的实际状态，默认为启用
        const isEnabled = cookie.enabled === undefined ? true : cookie.enabled;

        console.log(`账号 ${cookie.id} 状态: enabled=${cookie.enabled}, isEnabled=${isEnabled}`); // 调试信息

        const tr = document.createElement('tr');
        tr.className = `account-row ${isEnabled ? 'enabled' : 'disabled'}`;
        // 默认回复状态标签
        const defaultReplyBadge = cookie.defaultReply.enabled ?
        '<span class="badge bg-success">启用</span>' :
        '<span class="badge bg-secondary">禁用</span>';

        // AI回复状态标签
        const aiReplyBadge = cookie.aiReply.ai_enabled ?
        '<span class="badge bg-primary">AI启用</span>' :
        '<span class="badge bg-secondary">AI禁用</span>';

        // 自动确认发货状态（默认开启）
        const autoConfirm = cookie.auto_confirm === undefined ? true : cookie.auto_confirm;

        tr.innerHTML = `
        <td class="align-middle">
            <div class="cookie-id">
            <strong class="text-primary">${cookie.id}</strong>
            </div>
        </td>
        <td class="align-middle">
            <div class="cookie-value" title="点击复制Cookie" style="font-family: monospace; font-size: 0.875rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${cookie.value || '未设置'}
            </div>
        </td>
        <td class="align-middle">
            <span class="badge ${cookie.keywordCount > 0 ? 'bg-success' : 'bg-secondary'}">
            ${cookie.keywordCount} 个关键词
            </span>
        </td>
        <td class="align-middle">
            <div class="d-flex align-items-center gap-2">
            <label class="status-toggle" title="${isEnabled ? '点击禁用' : '点击启用'}">
                <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleAccountStatus('${cookie.id}', this.checked)">
                <span class="status-slider"></span>
            </label>
            <span class="status-badge ${isEnabled ? 'enabled' : 'disabled'}" title="${isEnabled ? '账号已启用' : '账号已禁用'}">
                <i class="bi bi-${isEnabled ? 'check-circle-fill' : 'x-circle-fill'}"></i>
            </span>
            </div>
        </td>
        <td class="align-middle cookie-connection-cell" data-cookie-id="${escapeHtml(cookie.id)}">
            ${renderCookieConnectionStatus(cookie.id)}
        </td>
        <td class="align-middle">
            ${defaultReplyBadge}
        </td>
        <td class="align-middle">
            ${aiReplyBadge}
        </td>
        <td class="align-middle">
            <div class="d-flex align-items-center gap-2">
            <label class="status-toggle" title="${autoConfirm ? '点击关闭自动确认发货' : '点击开启自动确认发货'}">
                <input type="checkbox" ${autoConfirm ? 'checked' : ''} onchange="toggleAutoConfirm('${cookie.id}', this.checked)">
                <span class="status-slider"></span>
            </label>
            <span class="status-badge ${autoConfirm ? 'enabled' : 'disabled'}" title="${autoConfirm ? '自动确认发货已开启' : '自动确认发货已关闭'}">
                <i class="bi bi-${autoConfirm ? 'truck' : 'truck-flatbed'}"></i>
            </span>
            </div>
        </td>
        <td class="align-middle">
            <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="editCookieInline('${cookie.id}', '${cookie.value}')" title="修改Cookie" ${!isEnabled ? 'disabled' : ''}>
                <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-success" onclick="goToAutoReply('${cookie.id}')" title="${isEnabled ? '设置自动回复' : '配置关键词 (账号已禁用)'}">
                <i class="bi bi-arrow-right-circle"></i>
            </button>
            <button class="btn btn-sm btn-outline-warning" onclick="configAIReply('${cookie.id}')" title="配置AI回复" ${!isEnabled ? 'disabled' : ''}>
                <i class="bi bi-robot"></i>
            </button>
            <button class="btn btn-sm btn-outline-info" onclick="copyCookie('${cookie.id}', '${cookie.value}')" title="复制Cookie">
                <i class="bi bi-clipboard"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="delCookie('${cookie.id}')" title="删除账号">
                <i class="bi bi-trash"></i>
            </button>
            </div>
        </td>
        `;
        tbody.appendChild(tr);
    });

    // 为Cookie值添加点击复制功能
    document.querySelectorAll('.cookie-value').forEach(element => {
        element.style.cursor = 'pointer';
        element.addEventListener('click', function() {
        const cookieValue = this.textContent;
        if (cookieValue && cookieValue !== '未设置') {
            navigator.clipboard.writeText(cookieValue).then(() => {
            showToast('Cookie已复制到剪贴板', 'success');
            }).catch(() => {
            showToast('复制失败，请手动复制', 'error');
            });
        }
        });
    });

    startCookieConnectionChecks();

    } catch (err) {
    // 错误已在fetchJSON中处理
    } finally {
    toggleLoading(false);
    }
}

// 复制Cookie
function copyCookie(id, value) {
    if (!value || value === '未设置') {
    showToast('该账号暂无Cookie值', 'warning');
    return;
    }

    navigator.clipboard.writeText(value).then(() => {
    showToast(`账号 "${id}" 的Cookie已复制到剪贴板`, 'success');
    }).catch(() => {
    // 降级方案：创建临时文本框
    const textArea = document.createElement('textarea');
    textArea.value = value;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        showToast(`账号 "${id}" 的Cookie已复制到剪贴板`, 'success');
    } catch (err) {
        showToast('复制失败，请手动复制', 'error');
    }
    document.body.removeChild(textArea);
    });
}

// 删除Cookie
async function delCookie(id) {
    if (!confirm(`确定要删除账号 "${id}" 吗？此操作不可恢复。`)) return;

    try {
    await fetchJSON(apiBase + `/cookies/${id}`, { method: 'DELETE' });
    showToast(`账号 "${id}" 已删除`, 'success');
    loadCookies();
    } catch (err) {
    // 错误已在fetchJSON中处理
    }
}

// 内联编辑Cookie
function editCookieInline(id, currentValue) {
    const row = event.target.closest('tr');
    const cookieValueCell = row.querySelector('.cookie-value');
    const originalContent = cookieValueCell.innerHTML;

    // 存储原始数据到全局变量，避免HTML注入问题
    window.editingCookieData = {
    id: id,
    originalContent: originalContent,
    originalValue: currentValue || ''
    };

    // 创建编辑界面容器
    const editContainer = document.createElement('div');
    editContainer.className = 'd-flex gap-2';

    // 创建输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.id = `edit-${id}`;
    input.value = currentValue || '';
    input.placeholder = '输入新的Cookie值';

    // 创建保存按钮
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm btn-success';
    saveBtn.title = '保存';
    saveBtn.innerHTML = '<i class="bi bi-check"></i>';
    saveBtn.onclick = () => saveCookieInline(id);

    // 创建取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-secondary';
    cancelBtn.title = '取消';
    cancelBtn.innerHTML = '<i class="bi bi-x"></i>';
    cancelBtn.onclick = () => cancelCookieEdit(id);

    // 组装编辑界面
    editContainer.appendChild(input);
    editContainer.appendChild(saveBtn);
    editContainer.appendChild(cancelBtn);

    // 替换原内容
    cookieValueCell.innerHTML = '';
    cookieValueCell.appendChild(editContainer);

    // 聚焦输入框
    input.focus();
    input.select();

    // 添加键盘事件监听
    input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveCookieInline(id);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCookieEdit(id);
    }
    });

    // 禁用该行的其他按钮
    const actionButtons = row.querySelectorAll('.btn-group button');
    actionButtons.forEach(btn => btn.disabled = true);
}

// 保存内联编辑的Cookie
async function saveCookieInline(id) {
    const input = document.getElementById(`edit-${id}`);
    const newValue = input.value.trim();

    if (!newValue) {
    showToast('Cookie值不能为空', 'warning');
    return;
    }

    try {
    toggleLoading(true);

    await fetchJSON(apiBase + `/cookies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        id: id,
        value: newValue
        })
    });

    showToast(`账号 "${id}" Cookie已更新`, 'success');
    loadCookies(); // 重新加载列表

    } catch (err) {
    console.error('Cookie更新失败:', err);
    showToast(`Cookie更新失败: ${err.message || '未知错误'}`, 'danger');
    // 恢复原内容
    cancelCookieEdit(id);
    } finally {
    toggleLoading(false);
    }
}

// 取消Cookie编辑
function cancelCookieEdit(id) {
    if (!window.editingCookieData || window.editingCookieData.id !== id) {
    console.error('编辑数据不存在');
    return;
    }

    const row = document.querySelector(`#edit-${id}`).closest('tr');
    const cookieValueCell = row.querySelector('.cookie-value');

    // 恢复原内容
    cookieValueCell.innerHTML = window.editingCookieData.originalContent;

    // 恢复按钮状态
    const actionButtons = row.querySelectorAll('.btn-group button');
    actionButtons.forEach(btn => btn.disabled = false);

    // 清理全局数据
    delete window.editingCookieData;
}



// 切换账号启用/禁用状态
async function toggleAccountStatus(accountId, enabled) {
    try {
    toggleLoading(true);

    // 这里需要调用后端API来更新账号状态
    // 由于当前后端可能没有enabled字段，我们先在前端模拟
    // 实际项目中需要后端支持

    const response = await fetch(`${apiBase}/cookies/${accountId}/status`, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ enabled: enabled })
    });

    if (response.ok) {
        showToast(`账号 "${accountId}" 已${enabled ? '启用' : '禁用'}`, 'success');

        // 清除相关缓存，确保数据一致性
        clearKeywordCache();

        // 更新界面显示
        updateAccountRowStatus(accountId, enabled);

        // 刷新自动回复页面的账号列表
        refreshAccountList();

        // 如果禁用的账号在自动回复页面被选中，更新显示
        const accountSelect = document.getElementById('accountSelect');
        if (accountSelect && accountSelect.value === accountId) {
        if (!enabled) {
            // 更新徽章显示禁用状态
            updateAccountBadge(accountId, false);
            showToast('账号已禁用，配置的关键词不会参与自动回复', 'warning');
        } else {
            // 更新徽章显示启用状态
            updateAccountBadge(accountId, true);
            showToast('账号已启用，配置的关键词将参与自动回复', 'success');
        }
        }

    } else {
        // 如果后端不支持，先在前端模拟
        console.warn('后端暂不支持账号状态切换，使用前端模拟');
        showToast(`账号 "${accountId}" 已${enabled ? '启用' : '禁用'} (前端模拟)`, enabled ? 'success' : 'warning');
        updateAccountRowStatus(accountId, enabled);
    }

    } catch (error) {
    console.error('切换账号状态失败:', error);

    // 后端不支持时的降级处理
    showToast(`账号 "${accountId}" 已${enabled ? '启用' : '禁用'} (本地模拟)`, enabled ? 'success' : 'warning');
    updateAccountRowStatus(accountId, enabled);

    // 恢复切换按钮状态
    const toggle = document.querySelector(`input[onchange*="${accountId}"]`);
    if (toggle) {
        toggle.checked = enabled;
    }
    } finally {
    toggleLoading(false);
    }
}

// 更新账号行的状态显示
function updateAccountRowStatus(accountId, enabled) {
    const toggle = document.querySelector(`input[onchange*="${accountId}"]`);
    if (!toggle) return;

    const row = toggle.closest('tr');
    const statusBadge = row.querySelector('.status-badge');
    const actionButtons = row.querySelectorAll('.btn-group .btn:not(.btn-outline-info):not(.btn-outline-danger)');

    // 更新行样式
    row.className = `account-row ${enabled ? 'enabled' : 'disabled'}`;

    // 更新状态徽章
    statusBadge.className = `status-badge ${enabled ? 'enabled' : 'disabled'}`;
    statusBadge.title = enabled ? '账号已启用' : '账号已禁用';
    statusBadge.innerHTML = `
    <i class="bi bi-${enabled ? 'check-circle-fill' : 'x-circle-fill'}"></i>
    `;

    // 更新按钮状态（只禁用编辑Cookie按钮，其他按钮保持可用）
    actionButtons.forEach(btn => {
    if (btn.onclick && btn.onclick.toString().includes('editCookieInline')) {
        btn.disabled = !enabled;
    }
    // 设置自动回复按钮始终可用，但更新提示文本
    if (btn.onclick && btn.onclick.toString().includes('goToAutoReply')) {
        btn.title = enabled ? '设置自动回复' : '配置关键词 (账号已禁用)';
    }
    });

    // 更新切换按钮的提示
    const label = toggle.closest('.status-toggle');
    label.title = enabled ? '点击禁用' : '点击启用';
}

// 切换自动确认发货状态
async function toggleAutoConfirm(accountId, enabled) {
    try {
    toggleLoading(true);

    const response = await fetch(`${apiBase}/cookies/${accountId}/auto-confirm`, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ auto_confirm: enabled })
    });

    if (response.ok) {
        const result = await response.json();
        showToast(result.message, 'success');

        // 更新界面显示
        updateAutoConfirmRowStatus(accountId, enabled);
    } else {
        const error = await response.json();
        showToast(error.detail || '更新自动确认发货设置失败', 'error');

        // 恢复切换按钮状态
        const toggle = document.querySelector(`input[onchange*="toggleAutoConfirm('${accountId}'"]`);
        if (toggle) {
        toggle.checked = !enabled;
        }
    }

    } catch (error) {
    console.error('切换自动确认发货状态失败:', error);
    showToast('网络错误，请稍后重试', 'error');

    // 恢复切换按钮状态
    const toggle = document.querySelector(`input[onchange*="toggleAutoConfirm('${accountId}'"]`);
    if (toggle) {
        toggle.checked = !enabled;
    }
    } finally {
    toggleLoading(false);
    }
}

// 更新自动确认发货行状态
function updateAutoConfirmRowStatus(accountId, enabled) {
    const row = document.querySelector(`tr:has(input[onchange*="toggleAutoConfirm('${accountId}'"])`);
    if (!row) return;

    const statusBadge = row.querySelector('.status-badge:has(i.bi-truck, i.bi-truck-flatbed)');
    const toggle = row.querySelector(`input[onchange*="toggleAutoConfirm('${accountId}'"]`);

    if (statusBadge && toggle) {
    // 更新状态徽章
    statusBadge.className = `status-badge ${enabled ? 'enabled' : 'disabled'}`;
    statusBadge.title = enabled ? '自动确认发货已开启' : '自动确认发货已关闭';
    statusBadge.innerHTML = `
        <i class="bi bi-${enabled ? 'truck' : 'truck-flatbed'}"></i>
    `;

    // 更新切换按钮的提示
    const label = toggle.closest('.status-toggle');
    label.title = enabled ? '点击关闭自动确认发货' : '点击开启自动确认发货';
    }
}

// 跳转到自动回复页面并选择指定账号
function goToAutoReply(accountId) {
    // 切换到自动回复页面
    showSection('auto-reply');

    // 设置账号选择器的值
    setTimeout(() => {
    const accountSelect = document.getElementById('accountSelect');
    if (accountSelect) {
        accountSelect.value = accountId;
        // 触发change事件来加载关键词
        loadAccountKeywords();
    }
    }, 100);

    showToast(`已切换到自动回复页面，账号 "${accountId}" 已选中`, 'info');
}





// 登出功能
async function logout() {
    try {
    if (authToken) {
        await fetch('/logout', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
        });
    }
    localStorage.removeItem('auth_token');
    window.location.href = '/';
    } catch (err) {
    console.error('登出失败:', err);
    localStorage.removeItem('auth_token');
    window.location.href = '/';
    }
}

// 检查认证状态
async function checkAuth() {
    if (!authToken) {
    window.location.href = '/';
    return false;
    }

    try {
    const response = await fetch('/verify', {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });
    const result = await response.json();

    if (!result.authenticated) {
        localStorage.removeItem('auth_token');
        window.location.href = '/';
        return false;
    }

    // 检查是否为管理员，显示管理员菜单和功能
    if (result.username === 'admin') {
        const adminMenuSection = document.getElementById('adminMenuSection');
        if (adminMenuSection) {
        adminMenuSection.style.display = 'block';
        }

        // 显示备份管理功能
        const backupManagement = document.getElementById('backup-management');
        if (backupManagement) {
        backupManagement.style.display = 'block';
        }
    }

    return true;
    } catch (err) {
    localStorage.removeItem('auth_token');
    window.location.href = '/';
    return false;
    }
}

// 初始化事件监听
document.addEventListener('DOMContentLoaded', async () => {
    // 首先检查认证状态
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;
    // 添加Cookie表单提交
    document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cookieId').value.trim();
    const value = document.getElementById('cookieValue').value.trim();

    if (!id || !value) return;

    try {
        await fetchJSON(apiBase + '/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value })
        });

        document.getElementById('cookieId').value = '';
        document.getElementById('cookieValue').value = '';
        showToast(`账号 "${id}" 添加成功`);
        loadCookies();
    } catch (err) {
        // 错误已在fetchJSON中处理
    }
    });

    // 增强的键盘快捷键和用户体验
    document.getElementById('newKeyword')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('newReply').focus();
    }
    });

    document.getElementById('newReply')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addKeyword();
    }
    });

    // ESC键取消编辑
    document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && typeof window.editingIndex !== 'undefined') {
        e.preventDefault();
        cancelEdit();
    }
    });

    // 输入框实时验证和提示
    document.getElementById('newKeyword')?.addEventListener('input', function(e) {
    const value = e.target.value.trim();
    const addBtn = document.querySelector('.add-btn');
    const replyInput = document.getElementById('newReply');

    if (value.length > 0) {
        e.target.style.borderColor = '#10b981';
        if (replyInput.value.trim().length > 0) {
        addBtn.style.opacity = '1';
        addBtn.style.transform = 'scale(1)';
        }
    } else {
        e.target.style.borderColor = '#e5e7eb';
        addBtn.style.opacity = '0.7';
        addBtn.style.transform = 'scale(0.95)';
    }
    });

    document.getElementById('newReply')?.addEventListener('input', function(e) {
    const value = e.target.value.trim();
    const addBtn = document.querySelector('.add-btn');
    const keywordInput = document.getElementById('newKeyword');

    if (value.length > 0) {
        e.target.style.borderColor = '#10b981';
        if (keywordInput.value.trim().length > 0) {
        addBtn.style.opacity = '1';
        addBtn.style.transform = 'scale(1)';
        }
    } else {
        e.target.style.borderColor = '#e5e7eb';
        addBtn.style.opacity = '0.7';
        addBtn.style.transform = 'scale(0.95)';
    }
    });

    // 初始加载仪表盘
    loadDashboard();

    // 初始化图片关键词事件监听器
    initImageKeywordEventListeners();

    // 初始化卡券图片文件选择器
    initCardImageFileSelector();

    // 初始化编辑卡券图片文件选择器
    initEditCardImageFileSelector();

    // 点击侧边栏外部关闭移动端菜单
    document.addEventListener('click', function(e) {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.querySelector('.mobile-toggle');

    if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !toggle.contains(e.target) &&
        sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
    }
    });
});

// ==================== 默认回复管理功能 ====================

// 打开默认回复管理器
async function openDefaultReplyManager() {
    try {
    await loadDefaultReplies();
    const modal = new bootstrap.Modal(document.getElementById('defaultReplyModal'));
    modal.show();
    } catch (error) {
    console.error('打开默认回复管理器失败:', error);
    showToast('打开默认回复管理器失败', 'danger');
    }
}

// 加载默认回复列表
async function loadDefaultReplies() {
    try {
    // 获取所有账号
    const accountsResponse = await fetch(`${apiBase}/cookies`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (!accountsResponse.ok) {
        throw new Error('获取账号列表失败');
    }

    const accounts = await accountsResponse.json();

    // 获取所有默认回复设置
    const repliesResponse = await fetch(`${apiBase}/default-replies`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    let defaultReplies = {};
    if (repliesResponse.ok) {
        defaultReplies = await repliesResponse.json();
    }

    renderDefaultRepliesList(accounts, defaultReplies);
    } catch (error) {
    console.error('加载默认回复列表失败:', error);
    showToast('加载默认回复列表失败', 'danger');
    }
}

// 渲染默认回复列表
function renderDefaultRepliesList(accounts, defaultReplies) {
    const tbody = document.getElementById('defaultReplyTableBody');
    tbody.innerHTML = '';

    if (accounts.length === 0) {
    tbody.innerHTML = `
        <tr>
        <td colspan="4" class="text-center py-4 text-muted">
            <i class="bi bi-chat-text fs-1 d-block mb-3"></i>
            <h5>暂无账号数据</h5>
            <p class="mb-0">请先添加账号</p>
        </td>
        </tr>
    `;
    return;
    }

    accounts.forEach(accountId => {
    const replySettings = defaultReplies[accountId] || { enabled: false, reply_content: '' };
    const tr = document.createElement('tr');

    // 状态标签
    const statusBadge = replySettings.enabled ?
        '<span class="badge bg-success">启用</span>' :
        '<span class="badge bg-secondary">禁用</span>';

    // 回复内容预览
    let contentPreview = replySettings.reply_content || '未设置';
    if (contentPreview.length > 50) {
        contentPreview = contentPreview.substring(0, 50) + '...';
    }

    tr.innerHTML = `
        <td>
        <strong class="text-primary">${accountId}</strong>
        </td>
        <td>${statusBadge}</td>
        <td>
        <div class="text-truncate" style="max-width: 300px;" title="${replySettings.reply_content || ''}">
            ${contentPreview}
        </div>
        </td>
        <td>
        <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="editDefaultReply('${accountId}')" title="编辑">
            <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-info" onclick="testDefaultReply('${accountId}')" title="测试">
            <i class="bi bi-play"></i>
            </button>
        </div>
        </td>
    `;

    tbody.appendChild(tr);
    });
}

// 编辑默认回复
async function editDefaultReply(accountId) {
    try {
    // 获取当前设置
    const response = await fetch(`${apiBase}/default-replies/${accountId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    let settings = { enabled: false, reply_content: '' };
    if (response.ok) {
        settings = await response.json();
    }

    // 填充编辑表单
    document.getElementById('editAccountId').value = accountId;
    document.getElementById('editAccountIdDisplay').value = accountId;
    document.getElementById('editDefaultReplyEnabled').checked = settings.enabled;
    document.getElementById('editReplyContent').value = settings.reply_content || '';

    // 根据启用状态显示/隐藏内容输入框
    toggleReplyContentVisibility();

    // 显示编辑模态框
    const modal = new bootstrap.Modal(document.getElementById('editDefaultReplyModal'));
    modal.show();
    } catch (error) {
    console.error('获取默认回复设置失败:', error);
    showToast('获取默认回复设置失败', 'danger');
    }
}

// 切换回复内容输入框的显示/隐藏
function toggleReplyContentVisibility() {
    const enabled = document.getElementById('editDefaultReplyEnabled').checked;
    const contentGroup = document.getElementById('editReplyContentGroup');
    contentGroup.style.display = enabled ? 'block' : 'none';
}

// 保存默认回复设置
async function saveDefaultReply() {
    try {
    const accountId = document.getElementById('editAccountId').value;
    const enabled = document.getElementById('editDefaultReplyEnabled').checked;
    const replyContent = document.getElementById('editReplyContent').value;

    if (enabled && !replyContent.trim()) {
        showToast('启用默认回复时必须设置回复内容', 'warning');
        return;
    }

    const data = {
        enabled: enabled,
        reply_content: enabled ? replyContent : null
    };

    const response = await fetch(`${apiBase}/default-replies/${accountId}`, {
        method: 'PUT',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (response.ok) {
        showToast('默认回复设置保存成功', 'success');
        bootstrap.Modal.getInstance(document.getElementById('editDefaultReplyModal')).hide();
        loadDefaultReplies(); // 刷新列表
        loadCookies(); // 刷新账号列表以更新默认回复状态显示
    } else {
        const error = await response.text();
        showToast(`保存失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('保存默认回复设置失败:', error);
    showToast('保存默认回复设置失败', 'danger');
    }
}

// 测试默认回复（占位函数）
function testDefaultReply(accountId) {
    showToast('测试功能开发中...', 'info');
}

// ==================== AI回复配置相关函数 ====================

// 配置AI回复
async function configAIReply(accountId) {
    try {
    // 获取当前AI回复设置
    const settings = await fetchJSON(`${apiBase}/ai-reply-settings/${accountId}`);

    // 填充表单
    document.getElementById('aiConfigAccountId').value = accountId;
    document.getElementById('aiConfigAccountIdDisplay').value = accountId;
    document.getElementById('aiReplyEnabled').checked = settings.ai_enabled;
    // 处理模型名称
    const modelSelect = document.getElementById('aiModelName');
    const customModelInput = document.getElementById('customModelName');
    const modelName = settings.model_name;
    // 检查是否是预设模型
    const presetModels = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'gpt-3.5-turbo', 'gpt-4'];
    if (presetModels.includes(modelName)) {
        modelSelect.value = modelName;
        customModelInput.style.display = 'none';
        customModelInput.value = '';
    } else {
        // 自定义模型
        modelSelect.value = 'custom';
        customModelInput.style.display = 'block';
        customModelInput.value = modelName;
    }
    document.getElementById('aiBaseUrl').value = settings.base_url;
    document.getElementById('aiApiKey').value = settings.api_key;
    document.getElementById('maxDiscountPercent').value = settings.max_discount_percent;
    document.getElementById('maxDiscountAmount').value = settings.max_discount_amount;
    document.getElementById('maxBargainRounds').value = settings.max_bargain_rounds;
    document.getElementById('customPrompts').value = settings.custom_prompts;

    // 切换设置显示状态
    toggleAIReplySettings();

    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('aiReplyConfigModal'));
    modal.show();

    } catch (error) {
    console.error('获取AI回复设置失败:', error);
    showToast('获取AI回复设置失败', 'danger');
    }
}

// 切换AI回复设置显示
function toggleAIReplySettings() {
    const enabled = document.getElementById('aiReplyEnabled').checked;
    const settingsDiv = document.getElementById('aiReplySettings');
    const bargainSettings = document.getElementById('bargainSettings');
    const promptSettings = document.getElementById('promptSettings');
    const testArea = document.getElementById('testArea');

    if (enabled) {
    settingsDiv.style.display = 'block';
    bargainSettings.style.display = 'block';
    promptSettings.style.display = 'block';
    testArea.style.display = 'block';
    } else {
    settingsDiv.style.display = 'none';
    bargainSettings.style.display = 'none';
    promptSettings.style.display = 'none';
    testArea.style.display = 'none';
    }
}

// 保存AI回复配置
async function saveAIReplyConfig() {
    try {
    const accountId = document.getElementById('aiConfigAccountId').value;
    const enabled = document.getElementById('aiReplyEnabled').checked;

    // 如果启用AI回复，验证必填字段
    if (enabled) {
        const apiKey = document.getElementById('aiApiKey').value.trim();
        if (!apiKey) {
        showToast('请输入API密钥', 'warning');
        return;
        }

        // 验证自定义提示词格式
        const customPrompts = document.getElementById('customPrompts').value.trim();
        if (customPrompts) {
        try {
            JSON.parse(customPrompts);
        } catch (e) {
            showToast('自定义提示词格式错误，请检查JSON格式', 'warning');
            return;
        }
        }
    }
// 获取模型名称
    let modelName = document.getElementById('aiModelName').value;
    if (modelName === 'custom') {
        const customModelName = document.getElementById('customModelName').value.trim();
        if (!customModelName) {
        showToast('请输入自定义模型名称', 'warning');
        return;
        }
        modelName = customModelName;
    }
    // 构建设置对象
    const settings = {
        ai_enabled: enabled,
        model_name: modelName,
        api_key: document.getElementById('aiApiKey').value,
        base_url: document.getElementById('aiBaseUrl').value,
        max_discount_percent: parseInt(document.getElementById('maxDiscountPercent').value),
        max_discount_amount: parseInt(document.getElementById('maxDiscountAmount').value),
        max_bargain_rounds: parseInt(document.getElementById('maxBargainRounds').value),
        custom_prompts: document.getElementById('customPrompts').value
    };

    // 保存设置
    const response = await fetch(`${apiBase}/ai-reply-settings/${accountId}`, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(settings)
    });

    if (response.ok) {
        showToast('AI回复配置保存成功', 'success');
        bootstrap.Modal.getInstance(document.getElementById('aiReplyConfigModal')).hide();
        loadCookies(); // 刷新账号列表以更新AI回复状态显示
    } else {
        const error = await response.text();
        showToast(`保存失败: ${error}`, 'danger');
    }

    } catch (error) {
    console.error('保存AI回复配置失败:', error);
    showToast('保存AI回复配置失败', 'danger');
    }
}

// 测试AI回复
async function testAIReply() {
    try {
    const accountId = document.getElementById('aiConfigAccountId').value;
    const testMessage = document.getElementById('testMessage').value.trim();
    const testItemPrice = document.getElementById('testItemPrice').value;

    if (!testMessage) {
        showToast('请输入测试消息', 'warning');
        return;
    }

    // 构建测试数据
    const testData = {
        message: testMessage,
        item_title: '测试商品',
        item_price: parseFloat(testItemPrice) || 100,
        item_desc: '这是一个用于测试AI回复功能的商品'
    };

    // 显示加载状态
    const testResult = document.getElementById('testResult');
    const testReplyContent = document.getElementById('testReplyContent');
    testResult.style.display = 'block';
    testReplyContent.innerHTML = '<i class="bi bi-hourglass-split"></i> 正在生成AI回复...';

    // 调用测试API
    const response = await fetch(`${apiBase}/ai-reply-test/${accountId}`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(testData)
    });

    if (response.ok) {
        const result = await response.json();
        testReplyContent.innerHTML = result.reply;
        showToast('AI回复测试成功', 'success');
    } else {
        const error = await response.text();
        testReplyContent.innerHTML = `<span class="text-danger">测试失败: ${error}</span>`;
        showToast(`测试失败: ${error}`, 'danger');
    }

    } catch (error) {
    console.error('测试AI回复失败:', error);
    const testReplyContent = document.getElementById('testReplyContent');
    testReplyContent.innerHTML = `<span class="text-danger">测试失败: ${error.message}</span>`;
    showToast('测试AI回复失败', 'danger');
    }
}

// 切换自定义模型输入框的显示/隐藏
function toggleCustomModelInput() {
    const modelSelect = document.getElementById('aiModelName');
    const customModelInput = document.getElementById('customModelName');
    if (modelSelect.value === 'custom') {
    customModelInput.style.display = 'block';
    customModelInput.focus();
    } else {
    customModelInput.style.display = 'none';
    customModelInput.value = '';
    }
}

// 监听默认回复启用状态变化
document.addEventListener('DOMContentLoaded', function() {
    const enabledCheckbox = document.getElementById('editDefaultReplyEnabled');
    if (enabledCheckbox) {
    enabledCheckbox.addEventListener('change', toggleReplyContentVisibility);
    }
});

// ==================== 通知渠道管理功能 ====================

// 通知渠道类型配置
const channelTypeConfigs = {
    qq: {
    title: 'QQ通知',
    description: '需要添加QQ号 <code>3668943488</code> 为好友才能正常接收消息通知',
    icon: 'bi-chat-dots-fill',
    color: 'primary',
    fields: [
        {
        id: 'qq_number',
        label: '接收QQ号码',
        type: 'text',
        placeholder: '输入QQ号码',
        required: true,
        help: '用于接收通知消息的QQ号码'
        }
    ]
    },
    dingtalk: {
    title: '钉钉通知',
    description: '请设置钉钉机器人Webhook URL，支持自定义机器人和群机器人',
    icon: 'bi-bell-fill',
    color: 'info',
    fields: [
        {
        id: 'webhook_url',
        label: '钉钉机器人Webhook URL',
        type: 'url',
        placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...',
        required: true,
        help: '钉钉机器人的Webhook地址'
        },
        {
        id: 'secret',
        label: '加签密钥（可选）',
        type: 'text',
        placeholder: '输入加签密钥',
        required: false,
        help: '如果机器人开启了加签验证，请填写密钥'
        }
    ]
    },
    email: {
    title: '邮件通知',
    description: '通过SMTP服务器发送邮件通知，支持各种邮箱服务商',
    icon: 'bi-envelope-fill',
    color: 'success',
    fields: [
        {
        id: 'smtp_server',
        label: 'SMTP服务器',
        type: 'text',
        placeholder: 'smtp.gmail.com',
        required: true,
        help: '邮箱服务商的SMTP服务器地址'
        },
        {
        id: 'smtp_port',
        label: 'SMTP端口',
        type: 'number',
        placeholder: '587',
        required: true,
        help: '通常为587（TLS）或465（SSL）'
        },
        {
        id: 'email_user',
        label: '发送邮箱',
        type: 'email',
        placeholder: 'your-email@gmail.com',
        required: true,
        help: '用于发送通知的邮箱地址'
        },
        {
        id: 'email_password',
        label: '邮箱密码/授权码',
        type: 'password',
        placeholder: '输入密码或授权码',
        required: true,
        help: '邮箱密码或应用专用密码'
        },
        {
        id: 'recipient_email',
        label: '接收邮箱',
        type: 'email',
        placeholder: 'recipient@example.com',
        required: true,
        help: '用于接收通知的邮箱地址'
        }
    ]
    },
    webhook: {
    title: 'Webhook通知',
    description: '通过HTTP POST请求发送通知到自定义的Webhook地址',
    icon: 'bi-link-45deg',
    color: 'warning',
    fields: [
        {
        id: 'webhook_url',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://your-server.com/webhook',
        required: true,
        help: '接收通知的Webhook地址'
        },
        {
        id: 'http_method',
        label: 'HTTP方法',
        type: 'select',
        options: [
            { value: 'POST', text: 'POST' },
            { value: 'PUT', text: 'PUT' }
        ],
        required: true,
        help: '发送请求使用的HTTP方法'
        },
        {
        id: 'headers',
        label: '自定义请求头（可选）',
        type: 'textarea',
        placeholder: '{"Authorization": "Bearer token", "Content-Type": "application/json"}',
        required: false,
        help: 'JSON格式的自定义请求头'
        }
    ]
    },
    wechat: {
    title: '微信通知',
    description: '通过企业微信机器人发送通知消息',
    icon: 'bi-wechat',
    color: 'success',
    fields: [
        {
        id: 'webhook_url',
        label: '企业微信机器人Webhook URL',
        type: 'url',
        placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...',
        required: true,
        help: '企业微信群机器人的Webhook地址'
        }
    ]
    },
    telegram: {
    title: 'Telegram通知',
    description: '通过Telegram机器人发送通知消息',
    icon: 'bi-telegram',
    color: 'primary',
    fields: [
        {
        id: 'bot_token',
        label: 'Bot Token',
        type: 'text',
        placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
        required: true,
        help: '从@BotFather获取的机器人Token'
        },
        {
        id: 'chat_id',
        label: 'Chat ID',
        type: 'text',
        placeholder: '123456789 或 @channel_name',
        required: true,
        help: '接收消息的用户ID或频道名'
        }
    ]
    }
};

// 显示添加渠道模态框
function showAddChannelModal(type) {
    const config = channelTypeConfigs[type];
    if (!config) {
    showToast('不支持的通知渠道类型', 'danger');
    return;
    }

    // 设置模态框标题和描述
    document.getElementById('addChannelModalTitle').textContent = `添加${config.title}`;
    document.getElementById('channelTypeDescription').innerHTML = config.description;
    document.getElementById('channelType').value = type;

    // 生成配置字段
    const fieldsContainer = document.getElementById('channelConfigFields');
    fieldsContainer.innerHTML = '';

    config.fields.forEach(field => {
    const fieldHtml = generateFieldHtml(field, '');
    fieldsContainer.insertAdjacentHTML('beforeend', fieldHtml);
    });

    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('addChannelModal'));
    modal.show();
}

// 生成表单字段HTML
function generateFieldHtml(field, prefix) {
    const fieldId = prefix + field.id;
    let inputHtml = '';

    switch (field.type) {
    case 'select':
        inputHtml = `<select class="form-select" id="${fieldId}" ${field.required ? 'required' : ''}>`;
        if (field.options) {
        field.options.forEach(option => {
            inputHtml += `<option value="${option.value}">${option.text}</option>`;
        });
        }
        inputHtml += '</select>';
        break;
    case 'textarea':
        inputHtml = `<textarea class="form-control" id="${fieldId}" placeholder="${field.placeholder}" rows="3" ${field.required ? 'required' : ''}></textarea>`;
        break;
    default:
        inputHtml = `<input type="${field.type}" class="form-control" id="${fieldId}" placeholder="${field.placeholder}" ${field.required ? 'required' : ''}>`;
    }

    return `
    <div class="mb-3">
        <label for="${fieldId}" class="form-label">
        ${field.label} ${field.required ? '<span class="text-danger">*</span>' : ''}
        </label>
        ${inputHtml}
        ${field.help ? `<small class="form-text text-muted">${field.help}</small>` : ''}
    </div>
    `;
}

// 保存通知渠道
async function saveNotificationChannel() {
    const type = document.getElementById('channelType').value;
    const name = document.getElementById('channelName').value;
    const enabled = document.getElementById('channelEnabled').checked;

    if (!name.trim()) {
    showToast('请输入渠道名称', 'warning');
    return;
    }

    const config = channelTypeConfigs[type];
    if (!config) {
    showToast('无效的渠道类型', 'danger');
    return;
    }

    // 收集配置数据
    const configData = {};
    let hasError = false;

    config.fields.forEach(field => {
    const element = document.getElementById(field.id);
    const value = element.value.trim();

    if (field.required && !value) {
        showToast(`请填写${field.label}`, 'warning');
        hasError = true;
        return;
    }

    if (value) {
        configData[field.id] = value;
    }
    });

    if (hasError) return;

    try {
    const response = await fetch(`${apiBase}/notification-channels`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({
        name: name,
        type: type,
        config: JSON.stringify(configData),
        enabled: enabled
        })
    });

    if (response.ok) {
        showToast('通知渠道添加成功', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('addChannelModal'));
        modal.hide();
        loadNotificationChannels();
    } else {
        const error = await response.text();
        showToast(`添加失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('添加通知渠道失败:', error);
    showToast('添加通知渠道失败', 'danger');
    }
}

// 加载通知渠道列表
async function loadNotificationChannels() {
    try {
    const response = await fetch(`${apiBase}/notification-channels`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (!response.ok) {
        throw new Error('获取通知渠道失败');
    }

    const channels = await response.json();
    renderNotificationChannels(channels);
    } catch (error) {
    console.error('加载通知渠道失败:', error);
    showToast('加载通知渠道失败', 'danger');
    }
}

// 渲染通知渠道列表
function renderNotificationChannels(channels) {
    const tbody = document.getElementById('channelsTableBody');
    tbody.innerHTML = '';

    if (channels.length === 0) {
    tbody.innerHTML = `
        <tr>
        <td colspan="6" class="text-center py-4 text-muted">
            <i class="bi bi-bell fs-1 d-block mb-3"></i>
            <h5>暂无通知渠道</h5>
            <p class="mb-0">点击上方按钮添加通知渠道</p>
        </td>
        </tr>
    `;
    return;
    }

    channels.forEach(channel => {
    const tr = document.createElement('tr');

    const statusBadge = channel.enabled ?
        '<span class="badge bg-success">启用</span>' :
        '<span class="badge bg-secondary">禁用</span>';

    // 获取渠道类型配置（处理类型映射）
    let channelType = channel.type;
    if (channelType === 'ding_talk') {
        channelType = 'dingtalk';  // 兼容旧的类型名
    }
    const typeConfig = channelTypeConfigs[channelType];
    const typeDisplay = typeConfig ? typeConfig.title : channel.type;
    const typeColor = typeConfig ? typeConfig.color : 'secondary';

    // 解析并显示配置信息
    let configDisplay = '';
    try {
        const configData = JSON.parse(channel.config || '{}');
        const configEntries = Object.entries(configData);

        if (configEntries.length > 0) {
        configDisplay = configEntries.map(([key, value]) => {
            // 隐藏敏感信息
            if (key.includes('password') || key.includes('token') || key.includes('secret')) {
            return `${key}: ****`;
            }
            // 截断过长的值
            const displayValue = value.length > 30 ? value.substring(0, 30) + '...' : value;
            return `${key}: ${displayValue}`;
        }).join('<br>');
        } else {
        configDisplay = channel.config || '无配置';
        }
    } catch (e) {
        // 兼容旧格式
        configDisplay = channel.config || '无配置';
        if (configDisplay.length > 30) {
        configDisplay = configDisplay.substring(0, 30) + '...';
        }
    }

    tr.innerHTML = `
        <td><strong class="text-primary">${channel.id}</strong></td>
        <td>
        <div class="d-flex align-items-center">
            <i class="bi ${typeConfig ? typeConfig.icon : 'bi-bell'} me-2 text-${typeColor}"></i>
            ${channel.name}
        </div>
        </td>
        <td><span class="badge bg-${typeColor}">${typeDisplay}</span></td>
        <td><small class="text-muted">${configDisplay}</small></td>
        <td>${statusBadge}</td>
        <td>
        <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="editNotificationChannel(${channel.id})" title="编辑">
            <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteNotificationChannel(${channel.id})" title="删除">
            <i class="bi bi-trash"></i>
            </button>
        </div>
        </td>
    `;

    tbody.appendChild(tr);
    });
}



// 删除通知渠道
async function deleteNotificationChannel(channelId) {
    if (!confirm('确定要删除这个通知渠道吗？')) {
    return;
    }

    try {
    const response = await fetch(`${apiBase}/notification-channels/${channelId}`, {
        method: 'DELETE',
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        showToast('通知渠道删除成功', 'success');
        loadNotificationChannels();
    } else {
        const error = await response.text();
        showToast(`删除失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('删除通知渠道失败:', error);
    showToast('删除通知渠道失败', 'danger');
    }
}

// 编辑通知渠道
async function editNotificationChannel(channelId) {
    try {
    // 获取渠道详情
    const response = await fetch(`${apiBase}/notification-channels`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (!response.ok) {
        throw new Error('获取通知渠道失败');
    }

    const channels = await response.json();
    const channel = channels.find(c => c.id === channelId);

    if (!channel) {
        showToast('通知渠道不存在', 'danger');
        return;
    }

    // 处理类型映射
    let channelType = channel.type;
    if (channelType === 'ding_talk') {
        channelType = 'dingtalk';  // 兼容旧的类型名
    }

    const config = channelTypeConfigs[channelType];
    if (!config) {
        showToast('不支持的渠道类型', 'danger');
        return;
    }

    // 填充基本信息
    document.getElementById('editChannelId').value = channel.id;
    document.getElementById('editChannelType').value = channelType;  // 使用映射后的类型
    document.getElementById('editChannelName').value = channel.name;
    document.getElementById('editChannelEnabled').checked = channel.enabled;

    // 解析配置数据
    let configData = {};
    try {
        configData = JSON.parse(channel.config || '{}');
    } catch (e) {
        // 兼容旧格式（直接字符串）
        if (channel.type === 'qq') {
        configData = { qq_number: channel.config };
        } else if (channel.type === 'dingtalk' || channel.type === 'ding_talk') {
        configData = { webhook_url: channel.config };
        } else {
        configData = { config: channel.config };
        }
    }

    // 生成编辑字段
    const fieldsContainer = document.getElementById('editChannelConfigFields');
    fieldsContainer.innerHTML = '';

    config.fields.forEach(field => {
        const fieldHtml = generateFieldHtml(field, 'edit_');
        fieldsContainer.insertAdjacentHTML('beforeend', fieldHtml);

        // 填充现有值
        const element = document.getElementById('edit_' + field.id);
        if (element && configData[field.id]) {
        element.value = configData[field.id];
        }
    });

    // 显示编辑模态框
    const modal = new bootstrap.Modal(document.getElementById('editChannelModal'));
    modal.show();
    } catch (error) {
    console.error('编辑通知渠道失败:', error);
    showToast('编辑通知渠道失败', 'danger');
    }
}

// 更新通知渠道
async function updateNotificationChannel() {
    const channelId = document.getElementById('editChannelId').value;
    const type = document.getElementById('editChannelType').value;
    const name = document.getElementById('editChannelName').value;
    const enabled = document.getElementById('editChannelEnabled').checked;

    if (!name.trim()) {
    showToast('请输入渠道名称', 'warning');
    return;
    }

    const config = channelTypeConfigs[type];
    if (!config) {
    showToast('无效的渠道类型', 'danger');
    return;
    }

    // 收集配置数据
    const configData = {};
    let hasError = false;

    config.fields.forEach(field => {
    const element = document.getElementById('edit_' + field.id);
    const value = element.value.trim();

    if (field.required && !value) {
        showToast(`请填写${field.label}`, 'warning');
        hasError = true;
        return;
    }

    if (value) {
        configData[field.id] = value;
    }
    });

    if (hasError) return;

    try {
    const response = await fetch(`${apiBase}/notification-channels/${channelId}`, {
        method: 'PUT',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({
        name: name,
        config: JSON.stringify(configData),
        enabled: enabled
        })
    });

    if (response.ok) {
        showToast('通知渠道更新成功', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('editChannelModal'));
        modal.hide();
        loadNotificationChannels();
    } else {
        const error = await response.text();
        showToast(`更新失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('更新通知渠道失败:', error);
    showToast('更新通知渠道失败', 'danger');
    }
}

// ==================== 消息通知配置功能 ====================

// 加载消息通知配置
async function loadMessageNotifications() {
    try {
    // 获取所有账号
    const accountsResponse = await fetch(`${apiBase}/cookies`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (!accountsResponse.ok) {
        throw new Error('获取账号列表失败');
    }

    const accounts = await accountsResponse.json();

    // 获取所有通知配置
    const notificationsResponse = await fetch(`${apiBase}/message-notifications`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    let notifications = {};
    if (notificationsResponse.ok) {
        notifications = await notificationsResponse.json();
    }

    renderMessageNotifications(accounts, notifications);
    } catch (error) {
    console.error('加载消息通知配置失败:', error);
    showToast('加载消息通知配置失败', 'danger');
    }
}

// 渲染消息通知配置
function renderMessageNotifications(accounts, notifications) {
    const tbody = document.getElementById('notificationsTableBody');
    tbody.innerHTML = '';

    if (accounts.length === 0) {
    tbody.innerHTML = `
        <tr>
        <td colspan="4" class="text-center py-4 text-muted">
            <i class="bi bi-chat-dots fs-1 d-block mb-3"></i>
            <h5>暂无账号数据</h5>
            <p class="mb-0">请先添加账号</p>
        </td>
        </tr>
    `;
    return;
    }

    accounts.forEach(accountId => {
    const accountNotifications = notifications[accountId] || [];
    const tr = document.createElement('tr');

    let channelsList = '';
    if (accountNotifications.length > 0) {
        channelsList = accountNotifications.map(n =>
        `<span class="badge bg-${n.enabled ? 'success' : 'secondary'} me-1">${n.channel_name}</span>`
        ).join('');
    } else {
        channelsList = '<span class="text-muted">未配置</span>';
    }

    const status = accountNotifications.some(n => n.enabled) ?
        '<span class="badge bg-success">启用</span>' :
        '<span class="badge bg-secondary">禁用</span>';

    tr.innerHTML = `
        <td><strong class="text-primary">${accountId}</strong></td>
        <td>${channelsList}</td>
        <td>${status}</td>
        <td>
        <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="configAccountNotification('${accountId}')" title="配置">
            <i class="bi bi-gear"></i> 配置
            </button>
            ${accountNotifications.length > 0 ? `
            <button class="btn btn-sm btn-outline-danger" onclick="deleteAccountNotification('${accountId}')" title="删除配置">
            <i class="bi bi-trash"></i>
            </button>
            ` : ''}
        </div>
        </td>
    `;

    tbody.appendChild(tr);
    });
}

// 配置账号通知
async function configAccountNotification(accountId) {
    try {
    // 获取所有通知渠道
    const channelsResponse = await fetch(`${apiBase}/notification-channels`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (!channelsResponse.ok) {
        throw new Error('获取通知渠道失败');
    }

    const channels = await channelsResponse.json();

    if (channels.length === 0) {
        showToast('请先添加通知渠道', 'warning');
        return;
    }

    // 获取当前账号的通知配置
    const notificationResponse = await fetch(`${apiBase}/message-notifications/${accountId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    let currentNotifications = [];
    if (notificationResponse.ok) {
        currentNotifications = await notificationResponse.json();
    }

    // 填充表单
    document.getElementById('configAccountId').value = accountId;
    document.getElementById('displayAccountId').value = accountId;

    // 填充通知渠道选项
    const channelSelect = document.getElementById('notificationChannel');
    channelSelect.innerHTML = '<option value="">请选择通知渠道</option>';

    // 获取当前配置的第一个通知渠道（如果存在）
    const currentNotification = currentNotifications.length > 0 ? currentNotifications[0] : null;

    channels.forEach(channel => {
        if (channel.enabled) {
        const option = document.createElement('option');
        option.value = channel.id;
        option.textContent = `${channel.name} (${channel.config})`;
        if (currentNotification && currentNotification.channel_id === channel.id) {
            option.selected = true;
        }
        channelSelect.appendChild(option);
        }
    });

    // 设置启用状态
    document.getElementById('notificationEnabled').checked =
        currentNotification ? currentNotification.enabled : true;

    // 显示配置模态框
    const modal = new bootstrap.Modal(document.getElementById('configNotificationModal'));
    modal.show();
    } catch (error) {
    console.error('配置账号通知失败:', error);
    showToast('配置账号通知失败', 'danger');
    }
}

// 删除账号通知配置
async function deleteAccountNotification(accountId) {
    if (!confirm(`确定要删除账号 ${accountId} 的通知配置吗？`)) {
    return;
    }

    try {
    const response = await fetch(`${apiBase}/message-notifications/account/${accountId}`, {
        method: 'DELETE',
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        showToast('通知配置删除成功', 'success');
        loadMessageNotifications();
    } else {
        const error = await response.text();
        showToast(`删除失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('删除通知配置失败:', error);
    showToast('删除通知配置失败', 'danger');
    }
}

// 保存账号通知配置
async function saveAccountNotification() {
    const accountId = document.getElementById('configAccountId').value;
    const channelId = document.getElementById('notificationChannel').value;
    const enabled = document.getElementById('notificationEnabled').checked;

    if (!channelId) {
    showToast('请选择通知渠道', 'warning');
    return;
    }

    try {
    const response = await fetch(`${apiBase}/message-notifications/${accountId}`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({
        channel_id: parseInt(channelId),
        enabled: enabled
        })
    });

    if (response.ok) {
        showToast('通知配置保存成功', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('configNotificationModal'));
        modal.hide();
        loadMessageNotifications();
    } else {
        const error = await response.text();
        showToast(`保存失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('保存通知配置失败:', error);
    showToast('保存通知配置失败', 'danger');
    }
}

// ==================== 卡券管理功能 ====================

// 加载卡券列表
async function loadCards() {
    try {
    const response = await fetch(`${apiBase}/cards`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const cards = await response.json();
        renderCardsList(cards);
        updateCardsStats(cards);
    } else {
        showToast('加载卡券列表失败', 'danger');
    }
    } catch (error) {
    console.error('加载卡券列表失败:', error);
    showToast('加载卡券列表失败', 'danger');
    }
}

// 渲染卡券列表
function renderCardsList(cards) {
    const tbody = document.getElementById('cardsTableBody');

    if (cards.length === 0) {
    tbody.innerHTML = `
        <tr>
        <td colspan="8" class="text-center py-4 text-muted">
            <i class="bi bi-credit-card fs-1 d-block mb-3"></i>
            <h5>暂无卡券数据</h5>
            <p class="mb-0">点击"添加卡券"开始创建您的第一个卡券</p>
        </td>
        </tr>
    `;
    return;
    }

    tbody.innerHTML = '';

    cards.forEach(card => {
    const tr = document.createElement('tr');

    // 类型标签
    let typeBadge = '';
    switch(card.type) {
        case 'api':
        typeBadge = '<span class="badge bg-info">API接口</span>';
        break;
        case 'text':
        typeBadge = '<span class="badge bg-success">固定文字</span>';
        break;
        case 'data':
        typeBadge = '<span class="badge bg-warning">批量数据</span>';
        break;
        case 'image':
        typeBadge = '<span class="badge bg-primary">图片</span>';
        break;
    }

    // 状态标签
    const statusBadge = card.enabled ?
        '<span class="badge bg-success">启用</span>' :
        '<span class="badge bg-secondary">禁用</span>';

    // 数据量显示
    let dataCount = '-';
    if (card.type === 'data' && card.data_content) {
        const lines = card.data_content.split('\n').filter(line => line.trim());
        dataCount = lines.length;
    } else if (card.type === 'api') {
        dataCount = '∞';
    } else if (card.type === 'text') {
        dataCount = '1';
    } else if (card.type === 'image') {
        dataCount = '1';
    }

    // 延时时间显示
    const delayDisplay = card.delay_seconds > 0 ?
        `${card.delay_seconds}秒` :
        '<span class="text-muted">立即</span>';

    // 规格信息显示
    let specDisplay = '<span class="text-muted">普通卡券</span>';
    if (card.is_multi_spec && card.spec_name && card.spec_value) {
        specDisplay = `<span class="badge bg-primary">${card.spec_name}: ${card.spec_value}</span>`;
    }

    tr.innerHTML = `
        <td>
        <div class="fw-bold">${card.name}</div>
        ${card.description ? `<small class="text-muted">${card.description}</small>` : ''}
        </td>
        <td>${typeBadge}</td>
        <td>${specDisplay}</td>
        <td>${dataCount}</td>
        <td>${delayDisplay}</td>
        <td>${statusBadge}</td>
        <td>
        <small class="text-muted">${new Date(card.created_at).toLocaleString('zh-CN')}</small>
        </td>
        <td>
        <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="editCard(${card.id})" title="编辑">
            <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-info" onclick="testCard(${card.id})" title="测试">
            <i class="bi bi-play"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteCard(${card.id})" title="删除">
            <i class="bi bi-trash"></i>
            </button>
        </div>
        </td>
    `;

    tbody.appendChild(tr);
    });
}

// 更新卡券统计
function updateCardsStats(cards) {
    const totalCards = cards.length;
    const apiCards = cards.filter(card => card.type === 'api').length;
    const textCards = cards.filter(card => card.type === 'text').length;
    const dataCards = cards.filter(card => card.type === 'data').length;

    document.getElementById('totalCards').textContent = totalCards;
    document.getElementById('apiCards').textContent = apiCards;
    document.getElementById('textCards').textContent = textCards;
    document.getElementById('dataCards').textContent = dataCards;
}

// 显示添加卡券模态框
function showAddCardModal() {
    document.getElementById('addCardForm').reset();
    toggleCardTypeFields();
    const modal = new bootstrap.Modal(document.getElementById('addCardModal'));
    modal.show();
}

// 切换卡券类型字段显示
function toggleCardTypeFields() {
    const cardType = document.getElementById('cardType').value;

    document.getElementById('apiFields').style.display = cardType === 'api' ? 'block' : 'none';
    document.getElementById('textFields').style.display = cardType === 'text' ? 'block' : 'none';
    document.getElementById('dataFields').style.display = cardType === 'data' ? 'block' : 'none';
    document.getElementById('imageFields').style.display = cardType === 'image' ? 'block' : 'none';
}

// 切换多规格字段显示
function toggleMultiSpecFields() {
    const isMultiSpec = document.getElementById('isMultiSpec').checked;
    document.getElementById('multiSpecFields').style.display = isMultiSpec ? 'block' : 'none';
}

// 初始化卡券图片文件选择器
function initCardImageFileSelector() {
    const fileInput = document.getElementById('cardImageFile');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // 验证文件类型
                if (!file.type.startsWith('image/')) {
                    showToast('❌ 请选择图片文件，当前文件类型：' + file.type, 'warning');
                    e.target.value = '';
                    hideCardImagePreview();
                    return;
                }

                // 验证文件大小（5MB）
                if (file.size > 5 * 1024 * 1024) {
                    showToast('❌ 图片文件大小不能超过 5MB，当前文件大小：' + (file.size / 1024 / 1024).toFixed(1) + 'MB', 'warning');
                    e.target.value = '';
                    hideCardImagePreview();
                    return;
                }

                // 验证图片尺寸
                validateCardImageDimensions(file, e.target);
            } else {
                hideCardImagePreview();
            }
        });
    }
}

// 验证卡券图片尺寸
function validateCardImageDimensions(file, inputElement) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = function() {
        const width = this.naturalWidth;
        const height = this.naturalHeight;

        // 释放对象URL
        URL.revokeObjectURL(url);

        // 检查图片尺寸
        const maxDimension = 4096;
        const maxPixels = 8 * 1024 * 1024; // 8M像素
        const totalPixels = width * height;

        if (width > maxDimension || height > maxDimension) {
            showToast(`❌ 图片尺寸过大：${width}x${height}，最大允许：${maxDimension}x${maxDimension}像素`, 'warning');
            inputElement.value = '';
            hideCardImagePreview();
            return;
        }

        if (totalPixels > maxPixels) {
            showToast(`❌ 图片像素总数过大：${(totalPixels / 1024 / 1024).toFixed(1)}M像素，最大允许：8M像素`, 'warning');
            inputElement.value = '';
            hideCardImagePreview();
            return;
        }

        // 尺寸检查通过，显示预览和提示信息
        showCardImagePreview(file);

        // 如果图片较大，提示会被压缩
        if (width > 2048 || height > 2048) {
            showToast(`ℹ️ 图片尺寸较大（${width}x${height}），上传时将自动压缩以优化性能`, 'info');
        } else {
            showToast(`✅ 图片尺寸合适（${width}x${height}），可以上传`, 'success');
        }
    };

    img.onerror = function() {
        URL.revokeObjectURL(url);
        showToast('❌ 无法读取图片文件，请选择有效的图片', 'warning');
        inputElement.value = '';
        hideCardImagePreview();
    };

    img.src = url;
}

// 显示卡券图片预览
function showCardImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewContainer = document.getElementById('cardImagePreview');
        const previewImg = document.getElementById('cardPreviewImg');

        previewImg.src = e.target.result;
        previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// 隐藏卡券图片预览
function hideCardImagePreview() {
    const previewContainer = document.getElementById('cardImagePreview');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
}

// 初始化编辑卡券图片文件选择器
function initEditCardImageFileSelector() {
    const fileInput = document.getElementById('editCardImageFile');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // 验证文件类型
                if (!file.type.startsWith('image/')) {
                    showToast('❌ 请选择图片文件，当前文件类型：' + file.type, 'warning');
                    e.target.value = '';
                    hideEditCardImagePreview();
                    return;
                }

                // 验证文件大小（5MB）
                if (file.size > 5 * 1024 * 1024) {
                    showToast('❌ 图片文件大小不能超过 5MB，当前文件大小：' + (file.size / 1024 / 1024).toFixed(1) + 'MB', 'warning');
                    e.target.value = '';
                    hideEditCardImagePreview();
                    return;
                }

                // 验证图片尺寸
                validateEditCardImageDimensions(file, e.target);
            } else {
                hideEditCardImagePreview();
            }
        });
    }
}

// 验证编辑卡券图片尺寸
function validateEditCardImageDimensions(file, inputElement) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = function() {
        const width = this.naturalWidth;
        const height = this.naturalHeight;

        URL.revokeObjectURL(url);

        // 检查尺寸限制
        if (width > 4096 || height > 4096) {
            showToast(`❌ 图片尺寸过大（${width}x${height}），最大支持 4096x4096 像素`, 'warning');
            inputElement.value = '';
            hideEditCardImagePreview();
            return;
        }

        // 显示图片预览
        showEditCardImagePreview(file);

        // 如果图片较大，提示会被压缩
        if (width > 2048 || height > 2048) {
            showToast(`ℹ️ 图片尺寸较大（${width}x${height}），上传时将自动压缩以优化性能`, 'info');
        } else {
            showToast(`✅ 图片尺寸合适（${width}x${height}），可以上传`, 'success');
        }
    };

    img.onerror = function() {
        URL.revokeObjectURL(url);
        showToast('❌ 无法读取图片文件，请选择有效的图片', 'warning');
        inputElement.value = '';
        hideEditCardImagePreview();
    };

    img.src = url;
}

// 显示编辑卡券图片预览
function showEditCardImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImg = document.getElementById('editCardPreviewImg');
        const previewContainer = document.getElementById('editCardImagePreview');

        if (previewImg && previewContainer) {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
}

// 隐藏编辑卡券图片预览
function hideEditCardImagePreview() {
    const previewContainer = document.getElementById('editCardImagePreview');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
}

// 切换编辑多规格字段显示
function toggleEditMultiSpecFields() {
    const checkbox = document.getElementById('editIsMultiSpec');
    const fieldsDiv = document.getElementById('editMultiSpecFields');

    if (!checkbox) {
    console.error('编辑多规格开关元素未找到');
    return;
    }

    if (!fieldsDiv) {
    console.error('编辑多规格字段容器未找到');
    return;
    }

    const isMultiSpec = checkbox.checked;
    const displayStyle = isMultiSpec ? 'block' : 'none';

    console.log('toggleEditMultiSpecFields - 多规格状态:', isMultiSpec);
    console.log('toggleEditMultiSpecFields - 设置显示样式:', displayStyle);

    fieldsDiv.style.display = displayStyle;

    // 验证设置是否生效
    console.log('toggleEditMultiSpecFields - 实际显示样式:', fieldsDiv.style.display);
}

// 清空添加卡券表单
function clearAddCardForm() {
    try {
    // 安全地清空表单字段
    const setElementValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
        if (element.type === 'checkbox') {
            element.checked = value;
        } else {
            element.value = value;
        }
        } else {
        console.warn(`Element with id '${id}' not found`);
        }
    };

    const setElementDisplay = (id, display) => {
        const element = document.getElementById(id);
        if (element) {
        element.style.display = display;
        } else {
        console.warn(`Element with id '${id}' not found`);
        }
    };

    // 清空基本字段
    setElementValue('cardName', '');
    setElementValue('cardType', 'text');
    setElementValue('cardDescription', '');
    setElementValue('cardDelaySeconds', '0');
    setElementValue('isMultiSpec', false);
    setElementValue('specName', '');
    setElementValue('specValue', '');

    // 隐藏多规格字段
    setElementDisplay('multiSpecFields', 'none');

    // 清空类型相关字段
    setElementValue('textContent', '');
    setElementValue('dataContent', '');
    setElementValue('apiUrl', '');
    setElementValue('apiMethod', 'GET');
    setElementValue('apiHeaders', '');
    setElementValue('apiParams', '');
    setElementValue('apiTimeout', '10');

    // 重置字段显示
    toggleCardTypeFields();
    } catch (error) {
    console.error('清空表单时出错:', error);
    }
}

// 保存卡券
async function saveCard() {
    try {
    const cardType = document.getElementById('cardType').value;
    const cardName = document.getElementById('cardName').value;

    if (!cardType || !cardName) {
        showToast('请填写必填字段', 'warning');
        return;
    }

    // 检查多规格设置
    const isMultiSpec = document.getElementById('isMultiSpec').checked;
    const specName = document.getElementById('specName').value;
    const specValue = document.getElementById('specValue').value;

    // 验证多规格字段
    if (isMultiSpec && (!specName || !specValue)) {
        showToast('多规格卡券必须填写规格名称和规格值', 'warning');
        return;
    }

    const cardData = {
        name: cardName,
        type: cardType,
        description: document.getElementById('cardDescription').value,
        delay_seconds: parseInt(document.getElementById('cardDelaySeconds').value) || 0,
        enabled: true,
        is_multi_spec: isMultiSpec,
        spec_name: isMultiSpec ? specName : null,
        spec_value: isMultiSpec ? specValue : null
    };

    // 根据类型添加特定配置
    switch(cardType) {
        case 'api':
        // 验证和解析JSON字段
        let headers = '{}';
        let params = '{}';

        try {
            const headersInput = document.getElementById('apiHeaders').value.trim();
            if (headersInput) {
            JSON.parse(headersInput); // 验证JSON格式
            headers = headersInput;
            }
        } catch (e) {
            showToast('请求头格式错误，请输入有效的JSON', 'warning');
            return;
        }

        try {
            const paramsInput = document.getElementById('apiParams').value.trim();
            if (paramsInput) {
            JSON.parse(paramsInput); // 验证JSON格式
            params = paramsInput;
            }
        } catch (e) {
            showToast('请求参数格式错误，请输入有效的JSON', 'warning');
            return;
        }

        cardData.api_config = {
            url: document.getElementById('apiUrl').value,
            method: document.getElementById('apiMethod').value,
            timeout: parseInt(document.getElementById('apiTimeout').value),
            headers: headers,
            params: params
        };
        break;
        case 'text':
        cardData.text_content = document.getElementById('textContent').value;
        break;
        case 'data':
        cardData.data_content = document.getElementById('dataContent').value;
        break;
        case 'image':
        // 处理图片上传
        const imageFile = document.getElementById('cardImageFile').files[0];
        if (!imageFile) {
            showToast('请选择图片文件', 'warning');
            return;
        }

        // 上传图片
        const formData = new FormData();
        formData.append('image', imageFile);

        const uploadResponse = await fetch(`${apiBase}/upload-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            showToast(`图片上传失败: ${errorData.detail || '未知错误'}`, 'danger');
            return;
        }

        const uploadResult = await uploadResponse.json();
        cardData.image_url = uploadResult.image_url;
        break;
    }

    const response = await fetch(`${apiBase}/cards`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify(cardData)
    });

    if (response.ok) {
        showToast('卡券保存成功', 'success');
        bootstrap.Modal.getInstance(document.getElementById('addCardModal')).hide();
        // 清空表单
        clearAddCardForm();
        loadCards();
    } else {
        let errorMessage = '保存失败';
        try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.detail || errorMessage;
        } catch (e) {
        // 如果不是JSON格式，尝试获取文本
        try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
        } catch (e2) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        }
        showToast(`保存失败: ${errorMessage}`, 'danger');
    }
    } catch (error) {
    console.error('保存卡券失败:', error);
    showToast(`网络错误: ${error.message}`, 'danger');
    }
}
// ==================== 自动发货功能 ====================

// 加载发货规则列表
async function loadDeliveryRules() {
    try {
    const response = await fetch(`${apiBase}/delivery-rules`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const rules = await response.json();
        renderDeliveryRulesList(rules);
        updateDeliveryStats(rules);

        // 同时加载卡券列表用于下拉选择
        loadCardsForSelect();
    } else {
        showToast('加载发货规则失败', 'danger');
    }
    } catch (error) {
    console.error('加载发货规则失败:', error);
    showToast('加载发货规则失败', 'danger');
    }
}

// 渲染发货规则列表
function renderDeliveryRulesList(rules) {
    const tbody = document.getElementById('deliveryRulesTableBody');

    if (rules.length === 0) {
    tbody.innerHTML = `
        <tr>
        <td colspan="7" class="text-center py-4 text-muted">
            <i class="bi bi-truck fs-1 d-block mb-3"></i>
            <h5>暂无发货规则</h5>
            <p class="mb-0">点击"添加规则"开始配置自动发货规则</p>
        </td>
        </tr>
    `;
    return;
    }

    tbody.innerHTML = '';

    rules.forEach(rule => {
    const tr = document.createElement('tr');

    // 状态标签
    const statusBadge = rule.enabled ?
        '<span class="badge bg-success">启用</span>' :
        '<span class="badge bg-secondary">禁用</span>';

    // 卡券类型标签
    let cardTypeBadge = '<span class="badge bg-secondary">未知</span>';
    if (rule.card_type) {
        switch(rule.card_type) {
        case 'api':
            cardTypeBadge = '<span class="badge bg-info">API接口</span>';
            break;
        case 'text':
            cardTypeBadge = '<span class="badge bg-success">固定文字</span>';
            break;
        case 'data':
            cardTypeBadge = '<span class="badge bg-warning">批量数据</span>';
            break;
        case 'image':
            cardTypeBadge = '<span class="badge bg-primary">图片</span>';
            break;
        }
    }

    tr.innerHTML = `
        <td>
        <div class="fw-bold">${rule.keyword}</div>
        ${rule.description ? `<small class="text-muted">${rule.description}</small>` : ''}
        </td>
        <td>
        <div>
            <span class="badge bg-primary">${rule.card_name || '未知卡券'}</span>
            ${rule.is_multi_spec && rule.spec_name && rule.spec_value ?
            `<br><small class="text-muted mt-1 d-block"><i class="bi bi-tags"></i> ${rule.spec_name}: ${rule.spec_value}</small>` :
            ''}
        </div>
        </td>
        <td>${cardTypeBadge}</td>
        <td>
        <span class="badge bg-info">${rule.delivery_count || 1}</span>
        </td>
        <td>${statusBadge}</td>
        <td>
        <span class="badge bg-warning">${rule.delivery_times || 0}</span>
        </td>
        <td>
        <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="editDeliveryRule(${rule.id})" title="编辑">
            <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-info" onclick="testDeliveryRule(${rule.id})" title="测试">
            <i class="bi bi-play"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteDeliveryRule(${rule.id})" title="删除">
            <i class="bi bi-trash"></i>
            </button>
        </div>
        </td>
    `;

    tbody.appendChild(tr);
    });
}

// 更新发货统计
function updateDeliveryStats(rules) {
    const totalRules = rules.length;
    const activeRules = rules.filter(rule => rule.enabled).length;
    const todayDeliveries = 0; // 需要从后端获取今日发货统计
    const totalDeliveries = rules.reduce((sum, rule) => sum + (rule.delivery_times || 0), 0);

    document.getElementById('totalRules').textContent = totalRules;
    document.getElementById('activeRules').textContent = activeRules;
    document.getElementById('todayDeliveries').textContent = todayDeliveries;
    document.getElementById('totalDeliveries').textContent = totalDeliveries;
}

// 显示添加发货规则模态框
function showAddDeliveryRuleModal() {
    document.getElementById('addDeliveryRuleForm').reset();
    loadCardsForSelect(); // 加载卡券选项
    const modal = new bootstrap.Modal(document.getElementById('addDeliveryRuleModal'));
    modal.show();
}

// 加载卡券列表用于下拉选择
async function loadCardsForSelect() {
    try {
    const response = await fetch(`${apiBase}/cards`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const cards = await response.json();
        const select = document.getElementById('selectedCard');

        // 清空现有选项
        select.innerHTML = '<option value="">请选择卡券</option>';

        cards.forEach(card => {
        if (card.enabled) { // 只显示启用的卡券
            const option = document.createElement('option');
            option.value = card.id;

            // 构建显示文本
            let displayText = card.name;

            // 添加类型信息
            let typeText;
            switch(card.type) {
                case 'api':
                    typeText = 'API';
                    break;
                case 'text':
                    typeText = '固定文字';
                    break;
                case 'data':
                    typeText = '批量数据';
                    break;
                case 'image':
                    typeText = '图片';
                    break;
                default:
                    typeText = '未知类型';
            }
            displayText += ` (${typeText})`;

            // 添加规格信息
            if (card.is_multi_spec && card.spec_name && card.spec_value) {
            displayText += ` [${card.spec_name}:${card.spec_value}]`;
            }

            option.textContent = displayText;
            select.appendChild(option);
        }
        });
    }
    } catch (error) {
    console.error('加载卡券选项失败:', error);
    }
}

// 保存发货规则
async function saveDeliveryRule() {
    try {
    const keyword = document.getElementById('productKeyword').value;
    const cardId = document.getElementById('selectedCard').value;
    const deliveryCount = document.getElementById('deliveryCount').value;
    const enabled = document.getElementById('ruleEnabled').checked;
    const description = document.getElementById('ruleDescription').value;

    if (!keyword || !cardId) {
        showToast('请填写必填字段', 'warning');
        return;
    }

    const ruleData = {
        keyword: keyword,
        card_id: parseInt(cardId),
        delivery_count: parseInt(deliveryCount),
        enabled: enabled,
        description: description
    };

    const response = await fetch(`${apiBase}/delivery-rules`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify(ruleData)
    });

    if (response.ok) {
        showToast('发货规则保存成功', 'success');
        bootstrap.Modal.getInstance(document.getElementById('addDeliveryRuleModal')).hide();
        loadDeliveryRules();
    } else {
        const error = await response.text();
        showToast(`保存失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('保存发货规则失败:', error);
    showToast('保存发货规则失败', 'danger');
    }
}

// 编辑卡券
async function editCard(cardId) {
    try {
    // 获取卡券详情
    const response = await fetch(`${apiBase}/cards/${cardId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const card = await response.json();

        // 填充编辑表单
        document.getElementById('editCardId').value = card.id;
        document.getElementById('editCardName').value = card.name;
        document.getElementById('editCardType').value = card.type;
        document.getElementById('editCardDescription').value = card.description || '';
        document.getElementById('editCardDelaySeconds').value = card.delay_seconds || 0;
        document.getElementById('editCardEnabled').checked = card.enabled;

        // 填充多规格字段
        const isMultiSpec = card.is_multi_spec || false;
        document.getElementById('editIsMultiSpec').checked = isMultiSpec;
        document.getElementById('editSpecName').value = card.spec_name || '';
        document.getElementById('editSpecValue').value = card.spec_value || '';

        // 添加调试日志
        console.log('编辑卡券 - 多规格状态:', isMultiSpec);
        console.log('编辑卡券 - 规格名称:', card.spec_name);
        console.log('编辑卡券 - 规格值:', card.spec_value);

        // 根据类型填充特定字段
        if (card.type === 'api' && card.api_config) {
        document.getElementById('editApiUrl').value = card.api_config.url || '';
        document.getElementById('editApiMethod').value = card.api_config.method || 'GET';
        document.getElementById('editApiTimeout').value = card.api_config.timeout || 10;
        document.getElementById('editApiHeaders').value = card.api_config.headers || '{}';
        document.getElementById('editApiParams').value = card.api_config.params || '{}';
        } else if (card.type === 'text') {
        document.getElementById('editTextContent').value = card.text_content || '';
        } else if (card.type === 'data') {
        document.getElementById('editDataContent').value = card.data_content || '';
        } else if (card.type === 'image') {
        // 处理图片类型
        const currentImagePreview = document.getElementById('editCurrentImagePreview');
        const currentImg = document.getElementById('editCurrentImg');
        const noImageText = document.getElementById('editNoImageText');

        if (card.image_url) {
            // 显示当前图片
            currentImg.src = card.image_url;
            currentImagePreview.style.display = 'block';
            noImageText.style.display = 'none';
        } else {
            // 没有图片
            currentImagePreview.style.display = 'none';
            noImageText.style.display = 'block';
        }

        // 清空文件选择器和预览
        document.getElementById('editCardImageFile').value = '';
        document.getElementById('editCardImagePreview').style.display = 'none';
        }

        // 显示对应的字段
        toggleEditCardTypeFields();

        // 使用延迟调用确保DOM更新完成后再显示多规格字段
        setTimeout(() => {
        console.log('延迟调用 toggleEditMultiSpecFields');
        toggleEditMultiSpecFields();

        // 验证多规格字段是否正确显示
        const multiSpecElement = document.getElementById('editMultiSpecFields');
        const isChecked = document.getElementById('editIsMultiSpec').checked;
        console.log('多规格元素存在:', !!multiSpecElement);
        console.log('多规格开关状态:', isChecked);
        console.log('多规格字段显示状态:', multiSpecElement ? multiSpecElement.style.display : 'element not found');
        }, 100);

        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('editCardModal'));
        modal.show();
    } else {
        showToast('获取卡券详情失败', 'danger');
    }
    } catch (error) {
    console.error('获取卡券详情失败:', error);
    showToast('获取卡券详情失败', 'danger');
    }
}

// 切换编辑卡券类型字段显示
function toggleEditCardTypeFields() {
    const cardType = document.getElementById('editCardType').value;

    document.getElementById('editApiFields').style.display = cardType === 'api' ? 'block' : 'none';
    document.getElementById('editTextFields').style.display = cardType === 'text' ? 'block' : 'none';
    document.getElementById('editDataFields').style.display = cardType === 'data' ? 'block' : 'none';
    document.getElementById('editImageFields').style.display = cardType === 'image' ? 'block' : 'none';
}

// 更新卡券
async function updateCard() {
    try {
    const cardId = document.getElementById('editCardId').value;
    const cardType = document.getElementById('editCardType').value;
    const cardName = document.getElementById('editCardName').value;

    if (!cardType || !cardName) {
        showToast('请填写必填字段', 'warning');
        return;
    }

    // 检查多规格设置
    const isMultiSpec = document.getElementById('editIsMultiSpec').checked;
    const specName = document.getElementById('editSpecName').value;
    const specValue = document.getElementById('editSpecValue').value;

    // 验证多规格字段
    if (isMultiSpec && (!specName || !specValue)) {
        showToast('多规格卡券必须填写规格名称和规格值', 'warning');
        return;
    }

    const cardData = {
        name: cardName,
        type: cardType,
        description: document.getElementById('editCardDescription').value,
        delay_seconds: parseInt(document.getElementById('editCardDelaySeconds').value) || 0,
        enabled: document.getElementById('editCardEnabled').checked,
        is_multi_spec: isMultiSpec,
        spec_name: isMultiSpec ? specName : null,
        spec_value: isMultiSpec ? specValue : null
    };

    // 根据类型添加特定配置
    switch(cardType) {
        case 'api':
        // 验证和解析JSON字段
        let headers = '{}';
        let params = '{}';

        try {
            const headersInput = document.getElementById('editApiHeaders').value.trim();
            if (headersInput) {
            JSON.parse(headersInput);
            headers = headersInput;
            }
        } catch (e) {
            showToast('请求头格式错误，请输入有效的JSON', 'warning');
            return;
        }

        try {
            const paramsInput = document.getElementById('editApiParams').value.trim();
            if (paramsInput) {
            JSON.parse(paramsInput);
            params = paramsInput;
            }
        } catch (e) {
            showToast('请求参数格式错误，请输入有效的JSON', 'warning');
            return;
        }

        cardData.api_config = {
            url: document.getElementById('editApiUrl').value,
            method: document.getElementById('editApiMethod').value,
            timeout: parseInt(document.getElementById('editApiTimeout').value),
            headers: headers,
            params: params
        };
        break;
        case 'text':
        cardData.text_content = document.getElementById('editTextContent').value;
        break;
        case 'data':
        cardData.data_content = document.getElementById('editDataContent').value;
        break;
        case 'image':
        // 处理图片类型 - 如果有新图片则上传，否则保持原有图片
        const imageFile = document.getElementById('editCardImageFile').files[0];
        if (imageFile) {
            // 有新图片，需要上传
            await updateCardWithImage(cardId, cardData, imageFile);
            return; // 提前返回，因为上传图片是异步的
        }
        // 没有新图片，保持原有配置，继续正常更新流程
        break;
    }

    const response = await fetch(`${apiBase}/cards/${cardId}`, {
        method: 'PUT',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify(cardData)
    });

    if (response.ok) {
        showToast('卡券更新成功', 'success');
        bootstrap.Modal.getInstance(document.getElementById('editCardModal')).hide();
        loadCards();
    } else {
        const error = await response.text();
        showToast(`更新失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('更新卡券失败:', error);
    showToast('更新卡券失败', 'danger');
    }
}

// 更新带图片的卡券
async function updateCardWithImage(cardId, cardData, imageFile) {
    try {
        // 创建FormData对象
        const formData = new FormData();

        // 添加图片文件
        formData.append('image', imageFile);

        // 添加卡券数据
        Object.keys(cardData).forEach(key => {
            if (cardData[key] !== null && cardData[key] !== undefined) {
                if (typeof cardData[key] === 'object') {
                    formData.append(key, JSON.stringify(cardData[key]));
                } else {
                    formData.append(key, cardData[key]);
                }
            }
        });

        const response = await fetch(`${apiBase}/cards/${cardId}/image`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`
                // 不设置Content-Type，让浏览器自动设置multipart/form-data
            },
            body: formData
        });

        if (response.ok) {
            showToast('卡券更新成功', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editCardModal')).hide();
            loadCards();
        } else {
            const error = await response.text();
            showToast(`更新失败: ${error}`, 'danger');
        }
    } catch (error) {
        console.error('更新带图片的卡券失败:', error);
        showToast('更新卡券失败', 'danger');
    }
}



// 测试卡券（占位函数）
function testCard(cardId) {
    showToast('测试功能开发中...', 'info');
}

// 删除卡券
async function deleteCard(cardId) {
    if (confirm('确定要删除这个卡券吗？删除后无法恢复！')) {
    try {
        const response = await fetch(`${apiBase}/cards/${cardId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
        });

        if (response.ok) {
        showToast('卡券删除成功', 'success');
        loadCards();
        } else {
        const error = await response.text();
        showToast(`删除失败: ${error}`, 'danger');
        }
    } catch (error) {
        console.error('删除卡券失败:', error);
        showToast('删除卡券失败', 'danger');
    }
    }
}

// 编辑发货规则
async function editDeliveryRule(ruleId) {
    try {
    // 获取发货规则详情
    const response = await fetch(`${apiBase}/delivery-rules/${ruleId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const rule = await response.json();

        // 填充编辑表单
        document.getElementById('editRuleId').value = rule.id;
        document.getElementById('editProductKeyword').value = rule.keyword;
        document.getElementById('editDeliveryCount').value = rule.delivery_count || 1;
        document.getElementById('editRuleEnabled').checked = rule.enabled;
        document.getElementById('editRuleDescription').value = rule.description || '';

        // 加载卡券选项并设置当前选中的卡券
        await loadCardsForEditSelect();
        document.getElementById('editSelectedCard').value = rule.card_id;

        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('editDeliveryRuleModal'));
        modal.show();
    } else {
        showToast('获取发货规则详情失败', 'danger');
    }
    } catch (error) {
    console.error('获取发货规则详情失败:', error);
    showToast('获取发货规则详情失败', 'danger');
    }
}

// 加载卡券列表用于编辑时的下拉选择
async function loadCardsForEditSelect() {
    try {
    const response = await fetch(`${apiBase}/cards`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const cards = await response.json();
        const select = document.getElementById('editSelectedCard');

        // 清空现有选项
        select.innerHTML = '<option value="">请选择卡券</option>';

        cards.forEach(card => {
        if (card.enabled) { // 只显示启用的卡券
            const option = document.createElement('option');
            option.value = card.id;

            // 构建显示文本
            let displayText = card.name;

            // 添加类型信息
            let typeText;
            switch(card.type) {
                case 'api':
                    typeText = 'API';
                    break;
                case 'text':
                    typeText = '固定文字';
                    break;
                case 'data':
                    typeText = '批量数据';
                    break;
                case 'image':
                    typeText = '图片';
                    break;
                default:
                    typeText = '未知类型';
            }
            displayText += ` (${typeText})`;

            // 添加规格信息
            if (card.is_multi_spec && card.spec_name && card.spec_value) {
            displayText += ` [${card.spec_name}:${card.spec_value}]`;
            }

            option.textContent = displayText;
            select.appendChild(option);
        }
        });
    }
    } catch (error) {
    console.error('加载卡券选项失败:', error);
    }
}

// 更新发货规则
async function updateDeliveryRule() {
    try {
    const ruleId = document.getElementById('editRuleId').value;
    const keyword = document.getElementById('editProductKeyword').value;
    const cardId = document.getElementById('editSelectedCard').value;
    const deliveryCount = document.getElementById('editDeliveryCount').value;
    const enabled = document.getElementById('editRuleEnabled').checked;
    const description = document.getElementById('editRuleDescription').value;

    if (!keyword || !cardId) {
        showToast('请填写必填字段', 'warning');
        return;
    }

    const ruleData = {
        keyword: keyword,
        card_id: parseInt(cardId),
        delivery_count: parseInt(deliveryCount),
        enabled: enabled,
        description: description
    };

    const response = await fetch(`${apiBase}/delivery-rules/${ruleId}`, {
        method: 'PUT',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify(ruleData)
    });

    if (response.ok) {
        showToast('发货规则更新成功', 'success');
        bootstrap.Modal.getInstance(document.getElementById('editDeliveryRuleModal')).hide();
        loadDeliveryRules();
    } else {
        const error = await response.text();
        showToast(`更新失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('更新发货规则失败:', error);
    showToast('更新发货规则失败', 'danger');
    }
}

// 测试发货规则（占位函数）
function testDeliveryRule(ruleId) {
    showToast('测试功能开发中...', 'info');
}

// 删除发货规则
async function deleteDeliveryRule(ruleId) {
    if (confirm('确定要删除这个发货规则吗？删除后无法恢复！')) {
    try {
        const response = await fetch(`${apiBase}/delivery-rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
        });

        if (response.ok) {
        showToast('发货规则删除成功', 'success');
        loadDeliveryRules();
        } else {
        const error = await response.text();
        showToast(`删除失败: ${error}`, 'danger');
        }
    } catch (error) {
        console.error('删除发货规则失败:', error);
        showToast('删除发货规则失败', 'danger');
    }
    }
}



// ==================== 系统设置功能 ====================

// 主题颜色映射
const themeColors = {
    blue: '#4f46e5',
    green: '#10b981',
    purple: '#8b5cf6',
    red: '#ef4444',
    orange: '#f59e0b'
};

// 加载用户设置
async function loadUserSettings() {
    try {
    const response = await fetch(`${apiBase}/user-settings`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const settings = await response.json();

        // 设置主题颜色
        if (settings.theme_color && settings.theme_color.value) {
        document.getElementById('themeColor').value = settings.theme_color.value;
        applyThemeColor(settings.theme_color.value);
        }
    }
    } catch (error) {
    console.error('加载用户设置失败:', error);
    }
}

// 应用主题颜色
function applyThemeColor(colorName) {
    const color = themeColors[colorName];
    if (color) {
    document.documentElement.style.setProperty('--primary-color', color);

    // 计算hover颜色（稍微深一点）
    const hoverColor = adjustBrightness(color, -20);
    document.documentElement.style.setProperty('--primary-hover', hoverColor);

    // 计算浅色版本（用于某些UI元素）
    const lightColor = adjustBrightness(color, 10);
    document.documentElement.style.setProperty('--primary-light', lightColor);
    }
}

// 调整颜色亮度
function adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// 主题表单提交处理
document.addEventListener('DOMContentLoaded', function() {
    const themeForm = document.getElementById('themeForm');
    if (themeForm) {
    themeForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const selectedColor = document.getElementById('themeColor').value;

        try {
        const response = await fetch(`${apiBase}/user-settings/theme_color`, {
            method: 'PUT',
            headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({
            value: selectedColor,
            description: '主题颜色'
            })
        });

        if (response.ok) {
            applyThemeColor(selectedColor);
            showToast('主题颜色应用成功', 'success');
        } else {
            const error = await response.text();
            showToast(`主题设置失败: ${error}`, 'danger');
        }
        } catch (error) {
        console.error('主题设置失败:', error);
        showToast('主题设置失败', 'danger');
        }
    });
    }

    // 密码表单提交处理
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
    passwordForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
        showToast('新密码和确认密码不匹配', 'warning');
        return;
        }

        if (newPassword.length < 6) {
        showToast('新密码长度至少6位', 'warning');
        return;
        }

        try {
        const response = await fetch(`${apiBase}/change-admin-password`, {
            method: 'POST',
            headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword
            })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success) {
            showToast('密码更新成功，请重新登录', 'success');
            passwordForm.reset();
            // 3秒后跳转到登录页面
            setTimeout(() => {
                localStorage.removeItem('auth_token');
                window.location.href = '/login.html';
            }, 3000);
            } else {
            showToast(`密码更新失败: ${result.message}`, 'danger');
            }
        } else {
            const error = await response.text();
            showToast(`密码更新失败: ${error}`, 'danger');
        }
        } catch (error) {
        console.error('密码更新失败:', error);
        showToast('密码更新失败', 'danger');
        }
    });
    }

    // 页面加载时加载用户设置
    loadUserSettings();
});

// ==================== 备份管理功能 ====================

// 下载数据库备份
async function downloadDatabaseBackup() {
    try {
    showToast('正在准备数据库备份，请稍候...', 'info');

    const response = await fetch(`${apiBase}/admin/backup/download`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        // 获取文件名
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'xianyu_backup.db';
        if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
            filename = filenameMatch[1];
        }
        }

        // 下载文件
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('数据库备份下载成功', 'success');
    } else {
        const error = await response.text();
        showToast(`下载失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('下载数据库备份失败:', error);
    showToast('下载数据库备份失败', 'danger');
    }
}

// 上传数据库备份
async function uploadDatabaseBackup() {
    const fileInput = document.getElementById('databaseFile');
    const file = fileInput.files[0];

    if (!file) {
    showToast('请选择数据库文件', 'warning');
    return;
    }

    if (!file.name.endsWith('.db')) {
    showToast('只支持.db格式的数据库文件', 'warning');
    return;
    }

    // 文件大小检查（限制100MB）
    if (file.size > 100 * 1024 * 1024) {
    showToast('数据库文件大小不能超过100MB', 'warning');
    return;
    }

    if (!confirm('恢复数据库将完全替换当前所有数据，包括所有用户、Cookie、卡券等信息。\n\n此操作不可撤销！\n\n确定要继续吗？')) {
    return;
    }

    try {
    showToast('正在上传并恢复数据库，请稍候...', 'info');

    const formData = new FormData();
    formData.append('backup_file', file);

    const response = await fetch(`${apiBase}/admin/backup/upload`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`
        },
        body: formData
    });

    if (response.ok) {
        const result = await response.json();
        showToast(`数据库恢复成功！包含 ${result.user_count} 个用户`, 'success');

        // 清空文件选择
        fileInput.value = '';

        // 提示用户刷新页面
        setTimeout(() => {
        if (confirm('数据库已恢复，建议刷新页面以加载新数据。是否立即刷新？')) {
            window.location.reload();
        }
        }, 2000);

    } else {
        const error = await response.json();
        showToast(`恢复失败: ${error.detail}`, 'danger');
    }
    } catch (error) {
    console.error('上传数据库备份失败:', error);
    showToast('上传数据库备份失败', 'danger');
    }
}

// 导出备份（JSON格式，兼容旧版本）
async function exportBackup() {
    try {
    showToast('正在导出备份，请稍候...', 'info');

    const response = await fetch(`${apiBase}/backup/export`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const backupData = await response.json();

        // 生成文件名
        const now = new Date();
        const timestamp = now.getFullYear() +
                        String(now.getMonth() + 1).padStart(2, '0') +
                        String(now.getDate()).padStart(2, '0') + '_' +
                        String(now.getHours()).padStart(2, '0') +
                        String(now.getMinutes()).padStart(2, '0') +
                        String(now.getSeconds()).padStart(2, '0');
        const filename = `xianyu_backup_${timestamp}.json`;

        // 创建下载链接
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('备份导出成功', 'success');
    } else {
        const error = await response.text();
        showToast(`导出失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('导出备份失败:', error);
    showToast('导出备份失败', 'danger');
    }
}

// 导入备份
async function importBackup() {
    const fileInput = document.getElementById('backupFile');
    const file = fileInput.files[0];

    if (!file) {
    showToast('请选择备份文件', 'warning');
    return;
    }

    if (!file.name.endsWith('.json')) {
    showToast('只支持JSON格式的备份文件', 'warning');
    return;
    }

    if (!confirm('导入备份将覆盖当前所有数据，确定要继续吗？')) {
    return;
    }

    try {
    showToast('正在导入备份，请稍候...', 'info');

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${apiBase}/backup/import`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`
        },
        body: formData
    });

    if (response.ok) {
        showToast('备份导入成功！正在刷新数据...', 'success');

        // 清空文件选择
        fileInput.value = '';

        // 清除前端缓存
        clearKeywordCache();

        // 延迟一下再刷新数据，确保后端缓存已更新
        setTimeout(async () => {
        try {
            // 如果当前在关键字管理页面，重新加载数据
            if (currentCookieId) {
            await loadAccountKeywords();
            }

            // 刷新仪表盘数据
            if (document.getElementById('dashboard-section').classList.contains('active')) {
            await loadDashboard();
            }

            // 刷新账号列表
            if (document.getElementById('accounts-section').classList.contains('active')) {
            await loadCookies();
            }

            showToast('数据刷新完成！', 'success');
        } catch (error) {
            console.error('刷新数据失败:', error);
            showToast('备份导入成功，但数据刷新失败，请手动刷新页面', 'warning');
        }
        }, 1000);
    } else {
        const error = await response.text();
        showToast(`导入失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('导入备份失败:', error);
    showToast('导入备份失败', 'danger');
    }
}

// 刷新系统缓存
async function reloadSystemCache() {
    try {
    showToast('正在刷新系统缓存...', 'info');

    const response = await fetch(`${apiBase}/system/reload-cache`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const result = await response.json();
        showToast('系统缓存刷新成功！关键字等数据已更新', 'success');

        // 清除前端缓存
        clearKeywordCache();

        // 如果当前在关键字管理页面，重新加载数据
        if (currentCookieId) {
        setTimeout(() => {
            loadAccountKeywords();
        }, 500);
        }
    } else {
        const error = await response.text();
        showToast(`刷新缓存失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('刷新系统缓存失败:', error);
    showToast('刷新系统缓存失败', 'danger');
    }
}

// ==================== 商品管理功能 ====================

// 切换商品多规格状态
async function toggleItemMultiSpec(cookieId, itemId, isMultiSpec) {
    try {
    const response = await fetch(`${apiBase}/items/${encodeURIComponent(cookieId)}/${encodeURIComponent(itemId)}/multi-spec`, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
        is_multi_spec: isMultiSpec
        })
    });

    if (response.ok) {
        showToast(`${isMultiSpec ? '开启' : '关闭'}多规格成功`, 'success');
        // 刷新商品列表
        await refreshItemsData();
    } else {
        const errorData = await response.json();
        throw new Error(errorData.error || '操作失败');
    }
    } catch (error) {
    console.error('切换多规格状态失败:', error);
    showToast(`切换多规格状态失败: ${error.message}`, 'danger');
    }
}

// 切换商品"确认收货后才发货"状态
async function toggleItemConfirmDelivery(cookieId, itemId, requireConfirm) {
    try {
    const response = await fetch(`${apiBase}/items/${encodeURIComponent(cookieId)}/${encodeURIComponent(itemId)}/confirm-delivery`, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
        require_confirm: requireConfirm
        })
    });

    if (response.ok) {
        const data = await response.json();
        showToast(data.message || `${requireConfirm ? '开启' : '关闭'}确认收货发货成功`, 'success');
        // 刷新商品列表
        await refreshItemsData();
    } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.error || '操作失败');
    }
    } catch (error) {
    console.error('切换确认收货发货状态失败:', error);
    showToast(`切换确认收货发货状态失败: ${error.message}`, 'danger');
    }
}

// 加载商品列表
async function loadItems() {
    try {
    // 先加载Cookie列表用于筛选
    await loadCookieFilter();

    // 加载商品列表
    await refreshItemsData();
    } catch (error) {
    console.error('加载商品列表失败:', error);
    showToast('加载商品列表失败', 'danger');
    }
}

// 只刷新商品数据，不重新加载筛选器
async function refreshItemsData() {
    try {
    const selectedCookie = document.getElementById('itemCookieFilter').value;
    if (selectedCookie) {
        await loadItemsByCookie();
    } else {
        await loadAllItems();
    }
    } catch (error) {
    console.error('刷新商品数据失败:', error);
    showToast('刷新商品数据失败', 'danger');
    }
}

// 加载Cookie筛选选项
async function loadCookieFilter() {
    try {
    const response = await fetch(`${apiBase}/cookies/details`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const accounts = await response.json();
        const select = document.getElementById('itemCookieFilter');

        // 保存当前选择的值
        const currentValue = select.value;

        // 清空现有选项（保留"所有账号"）
        select.innerHTML = '<option value="">所有账号</option>';

        if (accounts.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '❌ 暂无账号';
        option.disabled = true;
        select.appendChild(option);
        return;
        }

        // 分组显示：先显示启用的账号，再显示禁用的账号
        const enabledAccounts = accounts.filter(account => {
        const enabled = account.enabled === undefined ? true : account.enabled;
        return enabled;
        });
        const disabledAccounts = accounts.filter(account => {
        const enabled = account.enabled === undefined ? true : account.enabled;
        return !enabled;
        });

        // 添加启用的账号
        enabledAccounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `🟢 ${account.id}`;
        select.appendChild(option);
        });

        // 添加禁用的账号
        if (disabledAccounts.length > 0) {
        // 添加分隔线
        if (enabledAccounts.length > 0) {
            const separator = document.createElement('option');
            separator.value = '';
            separator.textContent = '────────────────';
            separator.disabled = true;
            select.appendChild(separator);
        }

        disabledAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = `🔴 ${account.id} (已禁用)`;
            select.appendChild(option);
        });
        }

        // 恢复之前选择的值
        if (currentValue) {
        select.value = currentValue;
        }
    }
    } catch (error) {
    console.error('加载Cookie列表失败:', error);
    showToast('加载账号列表失败', 'danger');
    }
}

// 加载所有商品
async function loadAllItems() {
    try {
    const response = await fetch(`${apiBase}/items`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        displayItems(data.items);
    } else {
        throw new Error('获取商品列表失败');
    }
    } catch (error) {
    console.error('加载商品列表失败:', error);
    showToast('加载商品列表失败', 'danger');
    }
}

// 按Cookie加载商品
async function loadItemsByCookie() {
    const cookieId = document.getElementById('itemCookieFilter').value;

    if (!cookieId) {
    await loadAllItems();
    return;
    }

    try {
    const response = await fetch(`${apiBase}/items/cookie/${encodeURIComponent(cookieId)}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        displayItems(data.items);
    } else {
        throw new Error('获取商品列表失败');
    }
    } catch (error) {
    console.error('加载商品列表失败:', error);
    showToast('加载商品列表失败', 'danger');
    }
}

// 显示商品列表
function displayItems(items) {
    const tbody = document.getElementById('itemsTableBody');

    if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">暂无商品数据</td></tr>';
    // 重置选择状态
    const selectAllCheckbox = document.getElementById('selectAllItems');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    updateBatchDeleteButton();
    return;
    }

    const itemsHtml = items.map(item => {
    // 处理商品标题显示
    let itemTitleDisplay = item.item_title || '未设置';
    if (itemTitleDisplay.length > 30) {
        itemTitleDisplay = itemTitleDisplay.substring(0, 30) + '...';
    }

    // 处理商品详情显示
    let itemDetailDisplay = '未设置';
    if (item.item_detail) {
        try {
        // 尝试解析JSON并提取有用信息
        const detail = JSON.parse(item.item_detail);
        if (detail.content) {
            itemDetailDisplay = detail.content.substring(0, 50) + (detail.content.length > 50 ? '...' : '');
        } else {
            // 如果是纯文本或其他格式，直接显示前50个字符
            itemDetailDisplay = item.item_detail.substring(0, 50) + (item.item_detail.length > 50 ? '...' : '');
        }
        } catch (e) {
        // 如果不是JSON格式，直接显示前50个字符
        itemDetailDisplay = item.item_detail.substring(0, 50) + (item.item_detail.length > 50 ? '...' : '');
        }
    }

    // 多规格状态显示
    const isMultiSpec = item.is_multi_spec;
    const multiSpecDisplay = isMultiSpec ?
        '<span class="badge bg-success">多规格</span>' :
        '<span class="badge bg-secondary">普通</span>';

    // 确认收货后发货状态显示
    const requireConfirmDelivery = item.require_confirm_delivery;
    const confirmDeliveryDisplay = requireConfirmDelivery ?
        '<span class="badge bg-warning" title="买家需确认收货后才发货"><i class="bi bi-check-circle-fill me-1"></i>需确认</span>' :
        '<span class="badge bg-light text-dark" title="付款后直接发货"><i class="bi bi-x-circle me-1"></i>直接发</span>';

    return `
        <tr>
        <td>
            <input type="checkbox" name="itemCheckbox"
                    data-cookie-id="${escapeHtml(item.cookie_id)}"
                    data-item-id="${escapeHtml(item.item_id)}"
                    onchange="updateSelectAllState()">
        </td>
        <td>${escapeHtml(item.cookie_id)}</td>
        <td>${escapeHtml(item.item_id)}</td>
        <td title="${escapeHtml(item.item_title || '未设置')}">${escapeHtml(itemTitleDisplay)}</td>
        <td title="${escapeHtml(item.item_detail || '未设置')}">${escapeHtml(itemDetailDisplay)}</td>
        <td>${multiSpecDisplay}</td>
        <td>${confirmDeliveryDisplay}</td>
        <td>${formatDateTime(item.updated_at)}</td>
        <td>
            <div class="btn-group" role="group">
            <button class="btn btn-sm btn-outline-primary" onclick="editItem('${escapeHtml(item.cookie_id)}', '${escapeHtml(item.item_id)}')" title="编辑详情">
                <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteItem('${escapeHtml(item.cookie_id)}', '${escapeHtml(item.item_id)}', '${escapeHtml(item.item_title || item.item_id)}')" title="删除">
                <i class="bi bi-trash"></i>
            </button>
            <button class="btn btn-sm ${requireConfirmDelivery ? 'btn-warning' : 'btn-success'}" onclick="toggleItemConfirmDelivery('${escapeHtml(item.cookie_id)}', '${escapeHtml(item.item_id)}', ${!requireConfirmDelivery})" title="${requireConfirmDelivery ? '关闭确认收货发货' : '开启确认收货发货'}">
                <i class="bi ${requireConfirmDelivery ? 'bi-shield-check' : 'bi-shield-slash'}"></i>
            </button>
            </div>
        </td>
        </tr>
    `;
    }).join('');

    // 更新表格内容
    tbody.innerHTML = itemsHtml;

    // 重置选择状态
    const selectAllCheckbox = document.getElementById('selectAllItems');
    if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    }
    updateBatchDeleteButton();
}

// 刷新商品列表
async function refreshItems() {
    await refreshItemsData();
    showToast('商品列表已刷新', 'success');
}

// 获取商品信息
async function getAllItemsFromAccount() {
    const cookieSelect = document.getElementById('itemCookieFilter');
    const selectedCookieId = cookieSelect.value;
    const pageNumber = parseInt(document.getElementById('pageNumber').value) || 1;

    if (!selectedCookieId) {
    showToast('请先选择一个账号', 'warning');
    return;
    }

    if (pageNumber < 1) {
    showToast('页码必须大于0', 'warning');
    return;
    }

    // 显示加载状态
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>获取中...';
    button.disabled = true;

    try {
    const response = await fetch(`${apiBase}/items/get-by-page`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
        cookie_id: selectedCookieId,
        page_number: pageNumber,
        page_size: 20
        })
    });

    if (response.ok) {
        const data = await response.json();
        if (data.success) {
        showToast(`成功获取第${pageNumber}页 ${data.current_count} 个商品，请查看控制台日志`, 'success');
        // 刷新商品列表（保持筛选器选择）
        await refreshItemsData();
        } else {
        showToast(data.message || '获取商品信息失败', 'danger');
        }
    } else {
        throw new Error(`HTTP ${response.status}`);
    }
    } catch (error) {
    console.error('获取商品信息失败:', error);
    showToast('获取商品信息失败', 'danger');
    } finally {
    // 恢复按钮状态
    button.innerHTML = originalText;
    button.disabled = false;
    }
}

// 获取所有页商品信息
async function getAllItemsFromAccountAll() {
    const cookieSelect = document.getElementById('itemCookieFilter');
    const selectedCookieId = cookieSelect.value;

    if (!selectedCookieId) {
    showToast('请先选择一个账号', 'warning');
    return;
    }

    // 显示加载状态
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>获取中...';
    button.disabled = true;

    try {
    const response = await fetch(`${apiBase}/items/get-all-from-account`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
        cookie_id: selectedCookieId
        })
    });

    if (response.ok) {
        const data = await response.json();
        if (data.success) {
        const message = data.total_pages ?
            `成功获取 ${data.total_count} 个商品（共${data.total_pages}页），请查看控制台日志` :
            `成功获取商品信息，请查看控制台日志`;
        showToast(message, 'success');
        // 刷新商品列表（保持筛选器选择）
        await refreshItemsData();
        } else {
        showToast(data.message || '获取商品信息失败', 'danger');
        }
    } else {
        throw new Error(`HTTP ${response.status}`);
    }
    } catch (error) {
    console.error('获取商品信息失败:', error);
    showToast('获取商品信息失败', 'danger');
    } finally {
    // 恢复按钮状态
    button.innerHTML = originalText;
    button.disabled = false;
    }
}



// 编辑商品详情
async function editItem(cookieId, itemId) {
    try {
    const response = await fetch(`${apiBase}/items/${encodeURIComponent(cookieId)}/${encodeURIComponent(itemId)}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        const item = data.item;

        // 填充表单
        document.getElementById('editItemCookieId').value = item.cookie_id;
        document.getElementById('editItemId').value = item.item_id;
        document.getElementById('editItemCookieIdDisplay').value = item.cookie_id;
        document.getElementById('editItemIdDisplay').value = item.item_id;
        document.getElementById('editItemDetail').value = item.item_detail || '';

        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('editItemModal'));
        modal.show();
    } else {
        throw new Error('获取商品详情失败');
    }
    } catch (error) {
    console.error('获取商品详情失败:', error);
    showToast('获取商品详情失败', 'danger');
    }
}

// 保存商品详情
async function saveItemDetail() {
    const cookieId = document.getElementById('editItemCookieId').value;
    const itemId = document.getElementById('editItemId').value;
    const itemDetail = document.getElementById('editItemDetail').value.trim();

    if (!itemDetail) {
    showToast('请输入商品详情', 'warning');
    return;
    }

    try {
    const response = await fetch(`${apiBase}/items/${encodeURIComponent(cookieId)}/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
        item_detail: itemDetail
        })
    });

    if (response.ok) {
        showToast('商品详情更新成功', 'success');

        // 关闭模态框
        const modal = bootstrap.Modal.getInstance(document.getElementById('editItemModal'));
        modal.hide();

        // 刷新列表（保持筛选器选择）
        await refreshItemsData();
    } else {
        const error = await response.text();
        showToast(`更新失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('更新商品详情失败:', error);
    showToast('更新商品详情失败', 'danger');
    }
}

// 删除商品信息
async function deleteItem(cookieId, itemId, itemTitle) {
    try {
    // 确认删除
    const confirmed = confirm(`确定要删除商品信息吗？\n\n商品ID: ${itemId}\n商品标题: ${itemTitle || '未设置'}\n\n此操作不可撤销！`);
    if (!confirmed) {
        return;
    }

    const response = await fetch(`${apiBase}/items/${encodeURIComponent(cookieId)}/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        showToast('商品信息删除成功', 'success');
        // 刷新列表（保持筛选器选择）
        await refreshItemsData();
    } else {
        const error = await response.text();
        showToast(`删除失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('删除商品信息失败:', error);
    showToast('删除商品信息失败', 'danger');
    }
}

// 批量删除商品信息
async function batchDeleteItems() {
    try {
    // 获取所有选中的复选框
    const checkboxes = document.querySelectorAll('input[name="itemCheckbox"]:checked');
    if (checkboxes.length === 0) {
        showToast('请选择要删除的商品', 'warning');
        return;
    }

    // 确认删除
    const confirmed = confirm(`确定要删除选中的 ${checkboxes.length} 个商品信息吗？\n\n此操作不可撤销！`);
    if (!confirmed) {
        return;
    }

    // 构造删除列表
    const itemsToDelete = Array.from(checkboxes).map(checkbox => {
        const row = checkbox.closest('tr');
        return {
        cookie_id: checkbox.dataset.cookieId,
        item_id: checkbox.dataset.itemId
        };
    });

    const response = await fetch(`${apiBase}/items/batch`, {
        method: 'DELETE',
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ items: itemsToDelete })
    });

    if (response.ok) {
        const result = await response.json();
        showToast(`批量删除完成: 成功 ${result.success_count} 个，失败 ${result.failed_count} 个`, 'success');
        // 刷新列表（保持筛选器选择）
        await refreshItemsData();
    } else {
        const error = await response.text();
        showToast(`批量删除失败: ${error}`, 'danger');
    }
    } catch (error) {
    console.error('批量删除商品信息失败:', error);
    showToast('批量删除商品信息失败', 'danger');
    }
}

// 全选/取消全选
function toggleSelectAll(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('input[name="itemCheckbox"]');
    checkboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
    });
    updateBatchDeleteButton();
}

// 更新全选状态
function updateSelectAllState() {
    const checkboxes = document.querySelectorAll('input[name="itemCheckbox"]');
    const checkedCheckboxes = document.querySelectorAll('input[name="itemCheckbox"]:checked');
    const selectAllCheckbox = document.getElementById('selectAllItems');

    if (checkboxes.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    } else if (checkedCheckboxes.length === checkboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
    } else if (checkedCheckboxes.length > 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
    } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    }

    updateBatchDeleteButton();
}

// 更新批量删除按钮状态
function updateBatchDeleteButton() {
    const checkedCheckboxes = document.querySelectorAll('input[name="itemCheckbox"]:checked');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');

    if (checkedCheckboxes.length > 0) {
    batchDeleteBtn.disabled = false;
    batchDeleteBtn.innerHTML = `<i class="bi bi-trash"></i> 批量删除 (${checkedCheckboxes.length})`;
    } else {
    batchDeleteBtn.disabled = true;
    batchDeleteBtn.innerHTML = '<i class="bi bi-trash"></i> 批量删除';
    }
}

// 格式化日期时间
function formatDateTime(dateString) {
    if (!dateString) return '未知';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

// HTML转义函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 日志管理功能 ====================

window.autoRefreshInterval = null;
window.allLogs = [];
window.filteredLogs = [];

// 刷新日志
async function refreshLogs() {
    try {
    const lines = document.getElementById('logLines').value;

    const response = await fetch(`${apiBase}/logs?lines=${lines}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        window.allLogs = data.logs || [];
        window.filteredLogs = window.allLogs; // 不再过滤，直接显示所有日志
        displayLogs();
        updateLogStats();
        showToast('日志已刷新', 'success');
    } else {
        throw new Error(`HTTP ${response.status}`);
    }
    } catch (error) {
    console.error('刷新日志失败:', error);
    showToast('刷新日志失败', 'danger');
    }
}



// 显示日志
function displayLogs() {
    const container = document.getElementById('logContainer');

    if (window.filteredLogs.length === 0) {
    container.innerHTML = `
        <div class="text-center p-4 text-muted">
        <i class="bi bi-file-text fs-1"></i>
        <p class="mt-2">暂无日志数据</p>
        </div>
    `;
    return;
    }

    const logsHtml = window.filteredLogs.map(log => {
    const timestamp = formatLogTimestamp(log.timestamp);
    const levelClass = log.level || 'INFO';

    return `
        <div class="log-entry ${levelClass}">
        <span class="log-timestamp">${timestamp}</span>
        <span class="log-level">[${log.level}]</span>
        <span class="log-source">${log.source}:</span>
        <span class="log-message">${escapeHtml(log.message)}</span>
        </div>
    `;
    }).join('');

    container.innerHTML = logsHtml;

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

// 格式化日志时间戳
function formatLogTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
    });
}

// 更新日志统计信息
function updateLogStats() {
    document.getElementById('logCount').textContent = `${window.filteredLogs.length} 条日志`;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('zh-CN');
}

// 清空日志显示
function clearLogsDisplay() {
    window.allLogs = [];
    window.filteredLogs = [];
    document.getElementById('logContainer').innerHTML = `
    <div class="text-center p-4 text-muted">
        <i class="bi bi-file-text fs-1"></i>
        <p class="mt-2">日志显示已清空</p>
    </div>
    `;
    updateLogStats();
    showToast('日志显示已清空', 'info');
}

// 切换自动刷新
function toggleAutoRefresh() {
    const button = document.querySelector('#autoRefreshText');
    const icon = button.previousElementSibling;

    if (window.autoRefreshInterval) {
    // 停止自动刷新
    clearInterval(window.autoRefreshInterval);
    window.autoRefreshInterval = null;
    button.textContent = '开启自动刷新';
    icon.className = 'bi bi-play-circle me-1';
    showToast('自动刷新已停止', 'info');
    } else {
    // 开启自动刷新
    window.autoRefreshInterval = setInterval(refreshLogs, 5000); // 每5秒刷新一次
    button.textContent = '停止自动刷新';
    icon.className = 'bi bi-pause-circle me-1';
    showToast('自动刷新已开启（每5秒）', 'success');

    // 立即刷新一次
    refreshLogs();
    }
}

// 清空服务器日志
async function clearLogsServer() {
    if (!confirm('确定要清空服务器端的所有日志吗？此操作不可恢复！')) {
    return;
    }

    try {
    const response = await fetch(`${apiBase}/logs/clear`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        if (data.success) {
        window.allLogs = [];
        window.filteredLogs = [];
        displayLogs();
        updateLogStats();
        showToast('服务器日志已清空', 'success');
        } else {
        showToast(data.message || '清空失败', 'danger');
        }
    } else {
        throw new Error(`HTTP ${response.status}`);
    }
    } catch (error) {
    console.error('清空服务器日志失败:', error);
    showToast('清空服务器日志失败', 'danger');
    }
}

// 显示日志统计信息
async function showLogStats() {
    try {
    const response = await fetch(`${apiBase}/logs/stats`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        if (data.success) {
        const stats = data.stats;

        let statsHtml = `
            <div class="row">
            <div class="col-md-6">
                <h6>总体统计</h6>
                <ul class="list-unstyled">
                <li>总日志数: <strong>${stats.total_logs}</strong></li>
                <li>最大容量: <strong>${stats.max_capacity}</strong></li>
                <li>使用率: <strong>${((stats.total_logs / stats.max_capacity) * 100).toFixed(1)}%</strong></li>
                </ul>
            </div>
            <div class="col-md-6">
                <h6>级别分布</h6>
                <ul class="list-unstyled">
        `;

        for (const [level, count] of Object.entries(stats.level_counts || {})) {
            const percentage = ((count / stats.total_logs) * 100).toFixed(1);
            statsHtml += `<li>${level}: <strong>${count}</strong> (${percentage}%)</li>`;
        }

        statsHtml += `
                </ul>
            </div>
            </div>
            <div class="row mt-3">
            <div class="col-12">
                <h6>来源分布</h6>
                <div class="row">
        `;

        const sources = Object.entries(stats.source_counts || {});
        sources.forEach(([source, count], index) => {
            if (index % 2 === 0) statsHtml += '<div class="col-md-6"><ul class="list-unstyled">';
            const percentage = ((count / stats.total_logs) * 100).toFixed(1);
            statsHtml += `<li>${source}: <strong>${count}</strong> (${percentage}%)</li>`;
            if (index % 2 === 1 || index === sources.length - 1) statsHtml += '</ul></div>';
        });

        statsHtml += `
                </div>
            </div>
            </div>
        `;

        // 显示模态框
        const modalHtml = `
            <div class="modal fade" id="logStatsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">日志统计信息</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    ${statsHtml}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                </div>
                </div>
            </div>
            </div>
        `;

        // 移除旧的模态框
        const oldModal = document.getElementById('logStatsModal');
        if (oldModal) oldModal.remove();

        // 添加新的模态框
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('logStatsModal'));
        modal.show();

        } else {
        showToast(data.message || '获取统计信息失败', 'danger');
        }
    } else {
        throw new Error(`HTTP ${response.status}`);
    }
    } catch (error) {
    console.error('获取日志统计失败:', error);
    showToast('获取日志统计失败', 'danger');
    }
}

// ==================== 导入导出功能 ====================

// 导出关键词
async function exportKeywords() {
    if (!currentCookieId) {
    showToast('请先选择账号', 'warning');
    return;
    }

    try {
    const response = await fetch(`${apiBase}/keywords-export/${currentCookieId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        // 创建下载链接
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // 根据当前账号是否有数据来设置文件名和提示
        const currentKeywords = keywordsData[currentCookieId] || [];
        const hasData = currentKeywords.length > 0;

        if (hasData) {
        a.download = `keywords_${currentCookieId}_${new Date().getTime()}.xlsx`;
        showToast('关键词导出成功！', 'success');
        } else {
        a.download = `keywords_template_${currentCookieId}_${new Date().getTime()}.xlsx`;
        showToast('导入模板导出成功！模板中包含示例数据供参考', 'success');
        }

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } else {
        const error = await response.json();
        showToast(`导出失败: ${error.detail}`, 'error');
    }
    } catch (error) {
    console.error('导出关键词失败:', error);
    showToast('导出关键词失败', 'error');
    }
}

// 显示导入模态框
function showImportModal() {
    if (!currentCookieId) {
    showToast('请先选择账号', 'warning');
    return;
    }

    const modal = new bootstrap.Modal(document.getElementById('importKeywordsModal'));
    modal.show();
}

// 导入关键词
async function importKeywords() {
    if (!currentCookieId) {
    showToast('请先选择账号', 'warning');
    return;
    }

    const fileInput = document.getElementById('importFileInput');
    const file = fileInput.files[0];

    if (!file) {
    showToast('请选择要导入的Excel文件', 'warning');
    return;
    }

    try {
    // 显示进度条
    const progressDiv = document.getElementById('importProgress');
    const progressBar = progressDiv.querySelector('.progress-bar');
    progressDiv.style.display = 'block';
    progressBar.style.width = '30%';

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${apiBase}/keywords-import/${currentCookieId}`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`
        },
        body: formData
    });

    progressBar.style.width = '70%';

    if (response.ok) {
        const result = await response.json();
        progressBar.style.width = '100%';

        setTimeout(() => {
        progressDiv.style.display = 'none';
        progressBar.style.width = '0%';

        // 关闭模态框
        const modal = bootstrap.Modal.getInstance(document.getElementById('importKeywordsModal'));
        modal.hide();

        // 清空文件输入
        fileInput.value = '';

        // 重新加载关键词列表
        loadAccountKeywords(currentCookieId);

        showToast(`导入成功！新增: ${result.added}, 更新: ${result.updated}`, 'success');
        }, 500);
    } else {
        const error = await response.json();
        progressDiv.style.display = 'none';
        progressBar.style.width = '0%';
        showToast(`导入失败: ${error.detail}`, 'error');
    }
    } catch (error) {
    console.error('导入关键词失败:', error);
    document.getElementById('importProgress').style.display = 'none';
    document.querySelector('#importProgress .progress-bar').style.width = '0%';
    showToast('导入关键词失败', 'error');
    }
}

// ========================= 账号添加相关函数 =========================

// 切换手动输入表单显示/隐藏
function toggleManualInput() {
    const manualForm = document.getElementById('manualInputForm');
    if (manualForm.style.display === 'none') {
    manualForm.style.display = 'block';
    // 清空表单
    document.getElementById('addForm').reset();
    } else {
    manualForm.style.display = 'none';
    }
}

// ========================= 扫码登录相关函数 =========================

let qrCodeCheckInterval = null;
let qrCodeSessionId = null;

// 显示扫码登录模态框
function showQRCodeLogin() {
    const modal = new bootstrap.Modal(document.getElementById('qrCodeLoginModal'));
    modal.show();

    // 模态框显示后生成二维码
    modal._element.addEventListener('shown.bs.modal', function () {
    generateQRCode();
    });

    // 模态框关闭时清理定时器
    modal._element.addEventListener('hidden.bs.modal', function () {
    clearQRCodeCheck();
    });
}

// 刷新二维码（兼容旧函数名）
async function refreshQRCode() {
    await generateQRCode();
}

// 生成二维码
async function generateQRCode() {
    try {
    showQRCodeLoading();

    const response = await fetch(`${apiBase}/qr-login/generate`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
        }
    });

    if (response.ok) {
        const data = await response.json();
        if (data.success) {
        qrCodeSessionId = data.session_id;
        showQRCodeImage(data.qr_code_url);
        startQRCodeCheck();
        } else {
        showQRCodeError(data.message || '生成二维码失败');
        }
    } else {
        showQRCodeError('生成二维码失败');
    }
    } catch (error) {
    console.error('生成二维码失败:', error);
    showQRCodeError('网络错误，请重试');
    }
}

// 显示二维码加载状态
function showQRCodeLoading() {
    document.getElementById('qrCodeContainer').style.display = 'block';
    document.getElementById('qrCodeImage').style.display = 'none';
    document.getElementById('statusText').textContent = '正在生成二维码，请耐心等待...';
    document.getElementById('statusSpinner').style.display = 'none';

    // 隐藏验证容器
    const verificationContainer = document.getElementById('verificationContainer');
    if (verificationContainer) {
    verificationContainer.style.display = 'none';
    }
}

// 显示二维码图片
function showQRCodeImage(qrCodeUrl) {
    document.getElementById('qrCodeContainer').style.display = 'none';
    document.getElementById('qrCodeImage').style.display = 'block';
    document.getElementById('qrCodeImg').src = qrCodeUrl;
    document.getElementById('statusText').textContent = '等待扫码...';
    document.getElementById('statusSpinner').style.display = 'none';
}

// 显示二维码错误
function showQRCodeError(message) {
    document.getElementById('qrCodeContainer').innerHTML = `
    <div class="text-danger">
        <i class="bi bi-exclamation-triangle fs-1 mb-3"></i>
        <p>${message}</p>
    </div>
    `;
    document.getElementById('qrCodeImage').style.display = 'none';
    document.getElementById('statusText').textContent = '生成失败';
    document.getElementById('statusSpinner').style.display = 'none';
}

// 开始检查二维码状态
function startQRCodeCheck() {
    if (qrCodeCheckInterval) {
    clearInterval(qrCodeCheckInterval);
    }

    document.getElementById('statusSpinner').style.display = 'inline-block';
    document.getElementById('statusText').textContent = '等待扫码...';

    qrCodeCheckInterval = setInterval(checkQRCodeStatus, 2000); // 每2秒检查一次
}

// 检查二维码状态
async function checkQRCodeStatus() {
    if (!qrCodeSessionId) return;

    try {
    const response = await fetch(`${apiBase}/qr-login/check/${qrCodeSessionId}`, {
        headers: {
        'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.ok) {
        const data = await response.json();

        switch (data.status) {
        case 'waiting':
            document.getElementById('statusText').textContent = '等待扫码...';
            break;
        case 'scanned':
            document.getElementById('statusText').textContent = '已扫码，请在手机上确认...';
            break;
        case 'success':
            document.getElementById('statusText').textContent = '登录成功！';
            document.getElementById('statusSpinner').style.display = 'none';
            clearQRCodeCheck();
            handleQRCodeSuccess(data);
            break;
        case 'expired':
            document.getElementById('statusText').textContent = '二维码已过期';
            document.getElementById('statusSpinner').style.display = 'none';
            clearQRCodeCheck();
            showQRCodeError('二维码已过期，请刷新重试');
            break;
        case 'cancelled':
            document.getElementById('statusText').textContent = '用户取消登录';
            document.getElementById('statusSpinner').style.display = 'none';
            clearQRCodeCheck();
            break;
        case 'verification_required':
            document.getElementById('statusText').textContent = '需要手机验证';
            document.getElementById('statusSpinner').style.display = 'none';
            clearQRCodeCheck();
            showVerificationRequired(data);
            break;
        }
    }
    } catch (error) {
    console.error('检查二维码状态失败:', error);
    }
}

// 显示需要验证的提示
function showVerificationRequired(data) {
    if (data.verification_url) {
    // 隐藏二维码区域
    document.getElementById('qrCodeContainer').style.display = 'none';
    document.getElementById('qrCodeImage').style.display = 'none';

    // 显示验证提示
    const verificationHtml = `
        <div class="text-center">
        <div class="mb-4">
            <i class="bi bi-shield-exclamation text-warning" style="font-size: 4rem;"></i>
        </div>
        <h5 class="text-warning mb-3">账号需要手机验证</h5>
        <div class="alert alert-warning border-0 mb-4">
            <i class="bi bi-info-circle me-2"></i>
            <strong>检测到账号存在风控，需要进行手机验证才能完成登录</strong>
        </div>
        <div class="mb-4">
            <p class="text-muted mb-3">请点击下方按钮，在新窗口中完成手机验证：</p>
            <a href="${data.verification_url}" target="_blank" class="btn btn-warning btn-lg">
            <i class="bi bi-phone me-2"></i>
            打开手机验证页面
            </a>
        </div>
        <div class="alert alert-info border-0">
            <i class="bi bi-lightbulb me-2"></i>
            <small>
            <strong>验证步骤：</strong><br>
            1. 点击上方按钮打开验证页面<br>
            2. 按照页面提示完成手机验证<br>
            3. 验证完成后，重新扫码登录
            </small>
        </div>
        </div>
    `;

    // 创建验证提示容器
    let verificationContainer = document.getElementById('verificationContainer');
    if (!verificationContainer) {
        verificationContainer = document.createElement('div');
        verificationContainer.id = 'verificationContainer';
        document.querySelector('#qrCodeLoginModal .modal-body').appendChild(verificationContainer);
    }

    verificationContainer.innerHTML = verificationHtml;
    verificationContainer.style.display = 'block';

    // 显示Toast提示
    showToast('账号需要手机验证，请按照提示完成验证', 'warning');
    }
}

// 处理扫码成功
function handleQRCodeSuccess(data) {
    if (data.account_info) {
    const { account_id, is_new_account } = data.account_info;

    if (is_new_account) {
        showToast(`新账号添加成功！账号ID: ${account_id}`, 'success');
    } else {
        showToast(`账号Cookie已更新！账号ID: ${account_id}`, 'success');
    }

    // 关闭模态框
    setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('qrCodeLoginModal'));
        modal.hide();

        // 刷新账号列表
        loadCookies();
    }, 2000);
    }
}

// 清理二维码检查
function clearQRCodeCheck() {
    if (qrCodeCheckInterval) {
    clearInterval(qrCodeCheckInterval);
    qrCodeCheckInterval = null;
    }
    qrCodeSessionId = null;
}

// 刷新二维码
function refreshQRCode() {
    clearQRCodeCheck();
    generateQRCode();
}

// ==================== 图片关键词管理功能 ====================

// 显示添加图片关键词模态框
function showAddImageKeywordModal() {
    if (!currentCookieId) {
        showToast('请先选择账号', 'warning');
        return;
    }

    // 加载商品列表到图片关键词模态框
    loadItemsListForImageKeyword();

    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('addImageKeywordModal'));
    modal.show();

    // 清空表单
    document.getElementById('imageKeyword').value = '';
    document.getElementById('imageItemIdSelect').value = '';
    document.getElementById('imageFile').value = '';
    hideImagePreview();
}

// 为图片关键词模态框加载商品列表
async function loadItemsListForImageKeyword() {
    try {
        const response = await fetch(`${apiBase}/items/${currentCookieId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const items = data.items || [];

            // 更新商品选择下拉框
            const selectElement = document.getElementById('imageItemIdSelect');
            if (selectElement) {
                // 清空现有选项（保留第一个默认选项）
                selectElement.innerHTML = '<option value="">选择商品或留空表示通用关键词</option>';

                // 添加商品选项
                items.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.item_id;
                    option.textContent = `${item.item_id} - ${item.item_title}`;
                    selectElement.appendChild(option);
                });
            }

            console.log(`为图片关键词加载了 ${items.length} 个商品到选择列表`);
        } else {
            console.warn('加载商品列表失败:', response.status);
        }
    } catch (error) {
        console.error('加载商品列表时发生错误:', error);
    }
}

// 处理图片文件选择事件监听器
function initImageKeywordEventListeners() {
    const imageFileInput = document.getElementById('imageFile');
    if (imageFileInput && !imageFileInput.hasEventListener) {
        imageFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // 验证文件类型
                if (!file.type.startsWith('image/')) {
                    showToast('请选择图片文件', 'warning');
                    e.target.value = '';
                    hideImagePreview();
                    return;
                }

                // 验证文件大小（5MB）
                if (file.size > 5 * 1024 * 1024) {
                    showToast('❌ 图片文件大小不能超过 5MB，当前文件大小：' + (file.size / 1024 / 1024).toFixed(1) + 'MB', 'warning');
                    e.target.value = '';
                    hideImagePreview();
                    return;
                }

                // 验证图片尺寸
                validateImageDimensions(file, e.target);
            } else {
                hideImagePreview();
            }
        });
        imageFileInput.hasEventListener = true;
    }
}

// 验证图片尺寸
function validateImageDimensions(file, inputElement) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = function() {
        const width = this.naturalWidth;
        const height = this.naturalHeight;

        // 释放对象URL
        URL.revokeObjectURL(url);

        // 检查图片尺寸
        const maxDimension = 4096;
        const maxPixels = 8 * 1024 * 1024; // 8M像素
        const totalPixels = width * height;

        if (width > maxDimension || height > maxDimension) {
            showToast(`❌ 图片尺寸过大：${width}x${height}，最大允许：${maxDimension}x${maxDimension}像素`, 'warning');
            inputElement.value = '';
            hideImagePreview();
            return;
        }

        if (totalPixels > maxPixels) {
            showToast(`❌ 图片像素总数过大：${(totalPixels / 1024 / 1024).toFixed(1)}M像素，最大允许：8M像素`, 'warning');
            inputElement.value = '';
            hideImagePreview();
            return;
        }

        // 尺寸检查通过，显示预览和提示信息
        showImagePreview(file);

        // 如果图片较大，提示会被压缩
        if (width > 2048 || height > 2048) {
            showToast(`ℹ️ 图片尺寸较大（${width}x${height}），上传时将自动压缩以优化性能`, 'info');
        } else {
            showToast(`✅ 图片尺寸合适（${width}x${height}），可以上传`, 'success');
        }
    };

    img.onerror = function() {
        URL.revokeObjectURL(url);
        showToast('❌ 无法读取图片文件，请选择有效的图片', 'warning');
        inputElement.value = '';
        hideImagePreview();
    };

    img.src = url;
}

// 显示图片预览
function showImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewContainer = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');

        previewImg.src = e.target.result;
        previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// 隐藏图片预览
function hideImagePreview() {
    const previewContainer = document.getElementById('imagePreview');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
}

// 添加图片关键词
async function addImageKeyword() {
    const keyword = document.getElementById('imageKeyword').value.trim();
    const itemId = document.getElementById('imageItemIdSelect').value.trim();
    const fileInput = document.getElementById('imageFile');
    const file = fileInput.files[0];

    if (!keyword) {
        showToast('请填写关键词', 'warning');
        return;
    }

    if (!file) {
        showToast('请选择图片文件', 'warning');
        return;
    }

    if (!currentCookieId) {
        showToast('请先选择账号', 'warning');
        return;
    }

    try {
        toggleLoading(true);

        // 创建FormData对象
        const formData = new FormData();
        formData.append('keyword', keyword);
        formData.append('item_id', itemId || '');
        formData.append('image', file);

        const response = await fetch(`${apiBase}/keywords/${currentCookieId}/image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        if (response.ok) {
            showToast(`✨ 图片关键词 "${keyword}" 添加成功！`, 'success');

            // 关闭模态框
            const modal = bootstrap.Modal.getInstance(document.getElementById('addImageKeywordModal'));
            modal.hide();

            // 重新加载关键词列表
            loadAccountKeywords();
            clearKeywordCache();
        } else {
            try {
                const errorData = await response.json();
                let errorMessage = errorData.detail || '图片关键词添加失败';

                // 根据不同的错误类型提供更友好的提示
                if (errorMessage.includes('图片尺寸过大')) {
                    errorMessage = '❌ 图片尺寸过大，请选择尺寸较小的图片（建议不超过4096x4096像素）';
                } else if (errorMessage.includes('图片像素总数过大')) {
                    errorMessage = '❌ 图片像素总数过大，请选择分辨率较低的图片';
                } else if (errorMessage.includes('图片数据验证失败')) {
                    errorMessage = '❌ 图片格式不支持或文件损坏，请选择JPG、PNG、GIF格式的图片';
                } else if (errorMessage.includes('图片保存失败')) {
                    errorMessage = '❌ 图片保存失败，请检查图片格式和大小后重试';
                } else if (errorMessage.includes('文件大小超过限制')) {
                    errorMessage = '❌ 图片文件过大，请选择小于5MB的图片';
                } else if (errorMessage.includes('不支持的图片格式')) {
                    errorMessage = '❌ 不支持的图片格式，请选择JPG、PNG、GIF格式的图片';
                } else if (response.status === 413) {
                    errorMessage = '❌ 图片文件过大，请选择小于5MB的图片';
                } else if (response.status === 400) {
                    errorMessage = `❌ 请求参数错误：${errorMessage}`;
                } else if (response.status === 500) {
                    errorMessage = '❌ 服务器内部错误，请稍后重试';
                }

                console.error('图片关键词添加失败:', errorMessage);
                showToast(errorMessage, 'danger');
            } catch (e) {
                // 如果不是JSON格式，使用文本
                const errorText = await response.text();
                console.error('图片关键词添加失败:', errorText);

                let friendlyMessage = '图片关键词添加失败';
                if (response.status === 413) {
                    friendlyMessage = '❌ 图片文件过大，请选择小于5MB的图片';
                } else if (response.status === 400) {
                    friendlyMessage = '❌ 图片格式不正确或参数错误，请检查后重试';
                } else if (response.status === 500) {
                    friendlyMessage = '❌ 服务器内部错误，请稍后重试';
                }

                showToast(friendlyMessage, 'danger');
            }
        }
    } catch (error) {
        console.error('添加图片关键词失败:', error);
        showToast('添加图片关键词失败', 'danger');
    } finally {
        toggleLoading(false);
    }
}

// 显示图片模态框
function showImageModal(imageUrl) {
    // 创建模态框HTML
    const modalHtml = `
        <div class="modal fade" id="imageViewModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">图片预览</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body text-center">
                        <img src="${imageUrl}" alt="关键词图片" style="max-width: 100%; max-height: 70vh; border-radius: 8px;">
                    </div>
                </div>
            </div>
        </div>
    `;

    // 移除已存在的模态框
    const existingModal = document.getElementById('imageViewModal');
    if (existingModal) {
        existingModal.remove();
    }

    // 添加新模态框
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('imageViewModal'));
    modal.show();

    // 模态框关闭后移除DOM元素
    document.getElementById('imageViewModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// 编辑图片关键词（不允许修改）
function editImageKeyword(index) {
    showToast('图片关键词不允许修改，请删除后重新添加', 'warning');
}

// 修改导出关键词函数，使用后端导出API
async function exportKeywords() {
    if (!currentCookieId) {
        showToast('请先选择账号', 'warning');
        return;
    }

    try {
        toggleLoading(true);

        // 使用后端导出API
        const response = await fetch(`${apiBase}/keywords-export/${currentCookieId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            // 获取文件blob
            const blob = await response.blob();

            // 从响应头获取文件名
            const contentDisposition = response.headers.get('Content-Disposition');
            let fileName = `关键词数据_${currentCookieId}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
                if (fileNameMatch) {
                    fileName = decodeURIComponent(fileNameMatch[1]);
                }
            }

            // 创建下载链接
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            // 清理
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast('✅ 关键词导出成功', 'success');
        } else {
            const errorText = await response.text();
            console.error('导出关键词失败:', errorText);
            showToast('导出关键词失败', 'danger');
        }
    } catch (error) {
        console.error('导出关键词失败:', error);
        showToast('导出关键词失败', 'danger');
    } finally {
        toggleLoading(false);
    }
}
