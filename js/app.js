document.addEventListener('DOMContentLoaded', () => {
    const categoryList = document.getElementById('category-list');
    const waterfall = document.getElementById('books-waterfall');
    const updateDate = document.getElementById('update-date');
    const categoryTitle = document.getElementById('current-category-title');
    const aiContent = document.getElementById('ai-content');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const boardTabs = document.getElementById('board-tabs');
    const dateDisplay = document.getElementById('date-display');
    const datePickerBtn = document.getElementById('date-picker-btn');
    const dateInput = document.getElementById('date-input');
    const datePrevBtn = document.getElementById('date-prev');
    const dateNextBtn = document.getElementById('date-next');

    const legacyBoard = { key: 'female_new', name: '女频新书榜' };
    const defaultBoardKey = 'female_new';
    const cacheBuster = `v=${Math.floor(Date.now() / 600000)}`;

    let allData = null;
    let typingTimer = null;
    let availableDates = [];
    let snapshotFilesByDate = {};
    let currentDateIndex = -1;
    let currentBoardKey = defaultBoardKey;
    let currentCategory = null;
    const currentCategoryByBoard = {};

    const copyToast = document.createElement('div');
    copyToast.className = 'copy-toast';
    copyToast.textContent = '书本信息已复制';
    document.body.appendChild(copyToast);
    let toastTimer = null;

    let overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });

    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            if (preset === 'latest' && availableDates.length > 0) {
                currentDateIndex = availableDates.length - 1;
                loadDateData(availableDates[currentDateIndex]);
            } else if (preset === 'yesterday' && availableDates.length >= 2) {
                currentDateIndex = availableDates.length - 2;
                loadDateData(availableDates[currentDateIndex]);
            }
        });
    });

    datePrevBtn.addEventListener('click', () => {
        if (currentDateIndex > 0) {
            currentDateIndex--;
            loadDateData(availableDates[currentDateIndex]);
        }
    });

    dateNextBtn.addEventListener('click', () => {
        if (currentDateIndex < availableDates.length - 1) {
            currentDateIndex++;
            loadDateData(availableDates[currentDateIndex]);
        }
    });

    datePickerBtn.addEventListener('click', () => {
        dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
    });

    dateInput.addEventListener('change', () => {
        const selected = dateInput.value;
        if (!selected) return;
        const idx = availableDates.indexOf(selected);
        if (idx !== -1) {
            currentDateIndex = idx;
            loadDateData(selected);
            return;
        }

        const nearest = findNearestAvailableDate(selected);
        if (nearest) {
            currentDateIndex = availableDates.indexOf(nearest);
            loadDateData(nearest);
            showToast(`${selected} 无数据，已跳转至最近的 ${nearest}`);
        }
    });

    fetch(`data/dates.json?${cacheBuster}`)
        .then(r => r.ok ? r.json() : Promise.reject('No dates.json'))
        .then(idx => {
            availableDates = idx.dates || [];
            snapshotFilesByDate = buildSnapshotFileMap(idx);
            if (availableDates.length > 0) {
                dateInput.min = availableDates[0];
                dateInput.max = availableDates[availableDates.length - 1];
            }
            return loadLatestData();
        })
        .catch(() => {
            console.warn('dates.json not found, falling back to latest only');
            loadLatestData();
        });

    function loadLatestData() {
        return fetchJson(`data/latest_ranks.json?${cacheBuster}`)
            .then(data => {
                allData = normalizeData(data);
                const latestDate = allData.date;
                currentDateIndex = availableDates.indexOf(latestDate);
                if (currentDateIndex === -1) {
                    availableDates.push(latestDate);
                    availableDates.sort();
                    currentDateIndex = availableDates.indexOf(latestDate);
                }
                applyData(allData);
            })
            .catch(err => {
                console.error(err);
                waterfall.innerHTML = '<p style="color:#f87171;padding:20px;">数据加载失败，请刷新重试。</p>';
            });
    }

    function loadDateData(dateStr) {
        const isLatest = currentDateIndex === availableDates.length - 1;
        if (isLatest) {
            loadLatestData();
            return;
        }

        waterfall.innerHTML = '<p style="color:var(--text-muted);padding:20px;">加载中...</p>';

        Promise.all([
            fetchSnapshot(dateStr),
            fetchJson(`data/trends/${dateStr}.json?${cacheBuster}`).catch(() => null),
        ]).then(([snapshot, trendData]) => {
            allData = buildDataWithTrends(snapshot, trendData);
            applyData(allData);
        }).catch(err => {
            console.error('Failed to load historical data:', err);
            const nearest = findNearestAvailableDate(dateStr);
            if (nearest && nearest !== dateStr) {
                showToast(`${dateStr} 数据不可用，已跳转至 ${nearest}`);
                currentDateIndex = availableDates.indexOf(nearest);
                loadDateData(nearest);
            } else {
                waterfall.innerHTML = `<div class="empty-state">
                    <p>该日期（${escapeHtml(dateStr)}）暂无数据</p>
                    <p class="empty-hint">可尝试切换到其他日期查看</p>
                </div>`;
                updateDateNav();
            }
        });
    }

    function fetchJson(url) {
        return fetch(url).then(response => {
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            return response.json();
        });
    }

    function fetchSnapshot(dateStr) {
        const indexedFile = snapshotFilesByDate[dateStr];
        if (indexedFile) {
            return fetchJson(`${indexedFile}?${cacheBuster}`);
        }
        const fileDateStr = dateStr.replace(/-/g, '');
        return fetchJson(`data/fanqie_ranks_${fileDateStr}.json?${cacheBuster}`)
            .catch(() => fetchJson(`data/fanqie_female_new_ranks_${fileDateStr}.json?${cacheBuster}`));
    }

    function buildSnapshotFileMap(idx) {
        const map = {};
        (idx.snapshots || []).forEach(item => {
            if (item.date && item.file) map[item.date] = item.file;
        });
        return map;
    }

    function buildDataWithTrends(snapshot, trendData) {
        const normalized = normalizeData(snapshot);
        const boards = normalized.boards.map(board => ({
            key: board.key,
            name: board.name,
            categories: board.categories.map(cat => ({
                name: cat.name,
                trend: getTrendForCategory(trendData, board.key, cat.name),
                books: cat.books || [],
            })),
        }));
        const defaultKey = normalized.default_board || getDefaultBoardKey(boards);
        const defaultBoard = boards.find(board => board.key === defaultKey) || boards[0];
        return {
            date: normalized.date,
            prev_date: trendData ? (trendData.prev_date || '') : '',
            default_board: defaultKey,
            boards,
            categories: defaultBoard ? defaultBoard.categories : [],
        };
    }

    function getTrendForCategory(trendData, boardKey, categoryName) {
        if (!trendData) return {};
        if (trendData.boards && trendData.boards[boardKey]) {
            return trendData.boards[boardKey].trends[categoryName] || {};
        }
        if (boardKey === legacyBoard.key && trendData.trends) {
            return trendData.trends[categoryName] || {};
        }
        return {};
    }

    function normalizeData(data) {
        const boards = Array.isArray(data.boards)
            ? data.boards.map((board, index) => ({
                key: board.key || `board_${index + 1}`,
                name: board.name || board.key || `榜单 ${index + 1}`,
                categories: board.categories || [],
            }))
            : [{
                key: legacyBoard.key,
                name: legacyBoard.name,
                categories: data.categories || [],
            }];
        const defaultKey = data.default_board || getDefaultBoardKey(boards);
        const defaultBoard = boards.find(board => board.key === defaultKey) || boards[0];
        return {
            date: data.date,
            prev_date: data.prev_date || '',
            default_board: defaultKey,
            boards,
            categories: defaultBoard ? defaultBoard.categories : [],
        };
    }

    function getDefaultBoardKey(boards) {
        return boards.some(board => board.key === defaultBoardKey)
            ? defaultBoardKey
            : (boards[0] ? boards[0].key : defaultBoardKey);
    }

    function applyData(data) {
        allData = normalizeData(data);
        const prevInfo = allData.prev_date ? ` (对比 ${allData.prev_date})` : '';
        updateDate.textContent = `${allData.date}${prevInfo}`;
        updateDateNav();

        if (!allData.boards.some(board => board.key === currentBoardKey)) {
            currentBoardKey = allData.default_board || getDefaultBoardKey(allData.boards);
        }

        renderBoards();
        renderCategories();

        const board = getActiveBoard();
        const savedCategory = currentCategoryByBoard[currentBoardKey] || currentCategory;
        const categoryExists = savedCategory && board.categories.some(cat => cat.name === savedCategory);
        if (categoryExists) {
            selectCategory(savedCategory);
            syncActiveCategory();
        } else if (board.categories.length > 0) {
            selectCategory(board.categories[0].name);
        } else {
            categoryTitle.textContent = board.name;
            aiContent.innerHTML = '<span class="ai-loading">暂无分析数据</span>';
            waterfall.innerHTML = '<p style="color:var(--text-muted);padding:20px;">该榜单暂无分类。</p>';
        }
    }

    function updateDateNav() {
        const isLatest = currentDateIndex === availableDates.length - 1;
        const isFirst = currentDateIndex <= 0;
        datePrevBtn.disabled = isFirst;
        dateNextBtn.disabled = isLatest;

        const currentDate = availableDates[currentDateIndex];
        dateDisplay.textContent = currentDate || '加载中...';
        datePickerBtn.classList.toggle('is-historical', !isLatest);
        updatePresetButtons();
    }

    function updatePresetButtons() {
        const isLatest = currentDateIndex === availableDates.length - 1;
        const isYesterday = availableDates.length >= 2 && currentDateIndex === availableDates.length - 2;
        presetBtns.forEach(btn => {
            const preset = btn.dataset.preset;
            btn.classList.toggle(
                'active',
                (preset === 'latest' && isLatest) || (preset === 'yesterday' && isYesterday)
            );
        });
    }

    function renderBoards() {
        if (!boardTabs) return;
        boardTabs.innerHTML = allData.boards.map(board => `
            <button class="board-btn${board.key === currentBoardKey ? ' active' : ''}" type="button" data-board="${escapeAttr(board.key)}">
                ${escapeHtml(board.name)}
            </button>
        `).join('');

        boardTabs.querySelectorAll('.board-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.board === currentBoardKey) return;
                currentBoardKey = btn.dataset.board;
                currentCategory = currentCategoryByBoard[currentBoardKey] || null;
                renderBoards();
                renderCategories();
                const board = getActiveBoard();
                const nextCategory = currentCategory && board.categories.some(cat => cat.name === currentCategory)
                    ? currentCategory
                    : (board.categories[0] ? board.categories[0].name : null);
                if (nextCategory) selectCategory(nextCategory);
            });
        });
    }

    function renderCategories() {
        const board = getActiveBoard();
        categoryList.innerHTML = '';
        board.categories.forEach((cat, i) => {
            const li = document.createElement('li');
            li.dataset.category = cat.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = cat.name;
            li.appendChild(nameSpan);

            const trend = cat.trend || {};
            if (trend.new_count > 0) {
                const badge = document.createElement('span');
                badge.className = 'cat-badge new';
                badge.textContent = `+${trend.new_count}`;
                li.appendChild(badge);
            }

            if ((currentCategory && cat.name === currentCategory) || (!currentCategory && i === 0)) {
                li.classList.add('active');
            }

            li.addEventListener('click', () => {
                document.querySelectorAll('#category-list li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                selectCategory(cat.name);
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
            });

            categoryList.appendChild(li);
        });
    }

    function selectCategory(categoryName) {
        const board = getActiveBoard();
        currentCategory = categoryName;
        currentCategoryByBoard[currentBoardKey] = categoryName;
        categoryTitle.textContent = `${board.name} · ${categoryName}`;
        const cat = board.categories.find(item => item.name === categoryName);
        if (!cat) return;
        syncActiveCategory();
        renderTrend(cat);
        renderBooks(cat);
    }

    function syncActiveCategory() {
        document.querySelectorAll('#category-list li').forEach(el => {
            el.classList.toggle('active', el.dataset.category === currentCategory);
        });
    }

    function getActiveBoard() {
        return allData.boards.find(board => board.key === currentBoardKey) || allData.boards[0] || {
            key: legacyBoard.key,
            name: legacyBoard.name,
            categories: [],
        };
    }

    function buildPrevRankMap(categoryName) {
        const board = getActiveBoard();
        const cat = board.categories.find(item => item.name === categoryName);
        if (!cat || !cat.trend) return {};

        const map = {};
        (cat.trend.new_books || []).forEach(title => {
            map[title] = 'new';
        });
        (cat.trend.top_risers || []).forEach(r => {
            map[r.title] = r.change;
        });
        (cat.trend.top_fallers || []).forEach(f => {
            map[f.title] = f.change;
        });
        return map;
    }

    function renderTrend(cat) {
        const trend = cat.trend || {};
        typewriterEffect(trend.summary || '');
    }

    function typewriterEffect(text) {
        if (typingTimer) {
            clearTimeout(typingTimer);
            typingTimer = null;
        }

        aiContent.innerHTML = '';
        if (!text) {
            aiContent.innerHTML = '<span class="ai-loading">暂无分析数据</span>';
            return;
        }
        aiContent.innerHTML = renderMarkdown(text);
    }

    function renderBooks(cat) {
        waterfall.innerHTML = '';
        const books = cat.books || [];
        if (books.length === 0) {
            waterfall.innerHTML = '<p style="color:var(--text-muted);padding:20px;">该分类暂无书籍。</p>';
            return;
        }

        const changeMap = buildPrevRankMap(cat.name);
        const fragment = document.createDocumentFragment();

        books.forEach((book, index) => {
            const rank = index + 1;
            const card = document.createElement('a');
            const bookId = extractBookId(book.url);
            card.href = bookId
                ? `book.html?id=${encodeURIComponent(bookId)}&board=${encodeURIComponent(currentBoardKey)}`
                : 'javascript:void(0)';
            card.rel = 'noopener';
            card.className = 'book-card';

            let rankCls = '';
            if (rank === 1) rankCls = 'rank-1';
            else if (rank === 2) rankCls = 'rank-2';
            else if (rank === 3) rankCls = 'rank-3';

            let changeHtml = '';
            const change = changeMap[book.title];
            if (change === 'new') {
                changeHtml = '<span class="book-change new">NEW</span>';
            } else if (change && change.startsWith('+')) {
                changeHtml = `<span class="book-change up">↑${change}</span>`;
            } else if (change && change.startsWith('-')) {
                changeHtml = `<span class="book-change down">↓${change.replace('-', '')}</span>`;
            }

            const coverHtml = book.cover
                ? `<div class="book-cover"><img src="${book.cover}" alt="${escapeAttr(book.title)}" loading="lazy"></div>`
                : `<div class="book-cover"><div class="no-cover">暂无封面</div></div>`;

            card.innerHTML = `
                <span class="book-rank ${rankCls}">${rank}</span>
                ${changeHtml}
                ${coverHtml}
                <div class="book-info">
                    <h3 class="book-title" title="${escapeAttr(book.title)}">${escapeHtml(book.title)}</h3>
                    <div class="book-meta">
                        <span class="book-author">${escapeHtml(book.author)}</span>
                        <span class="book-reads">${escapeHtml(book.reads)}</span>
                    </div>
                    <p class="book-intro">${escapeHtml(book.intro)}</p>
                    <button class="book-copy-btn" type="button">复制信息</button>
                </div>
            `;

            const copyBtn = card.querySelector('.book-copy-btn');
            copyBtn.addEventListener('click', e => copyBookInfo(e, book));
            fragment.appendChild(card);
        });

        waterfall.appendChild(fragment);
    }

    function copyBookInfo(e, book) {
        e.preventDefault();
        e.stopPropagation();
        const text = `${book.title}
作者：${book.author}
阅读量：${book.reads}
简介：${book.intro || '无'}
链接：${book.url || '无'}`;
        copyText(text).then(() => {
            const btn = e.currentTarget;
            btn.classList.add('copied');
            btn.textContent = '已复制';
            showCopyToast();
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.textContent = '复制信息';
            }, 1500);
        });
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
        }
        return fallbackCopyText(text);
    }

    function fallbackCopyText(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    function showCopyToast() {
        if (toastTimer) clearTimeout(toastTimer);
        copyToast.classList.add('show');
        toastTimer = setTimeout(() => copyToast.classList.remove('show'), 1800);
    }

    function showToast(msg) {
        copyToast.textContent = msg;
        if (toastTimer) clearTimeout(toastTimer);
        copyToast.classList.add('show');
        toastTimer = setTimeout(() => {
            copyToast.classList.remove('show');
            copyToast.textContent = '书本信息已复制';
        }, 2500);
    }

    function findNearestAvailableDate(targetDate) {
        if (availableDates.length === 0) return null;
        return availableDates.reduce((prev, curr) =>
            Math.abs(new Date(curr) - new Date(targetDate)) < Math.abs(new Date(prev) - new Date(targetDate)) ? curr : prev
        );
    }

    function renderMarkdown(text) {
        let html = escapeHtml(text);
        html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:1.05rem; margin:1em 0 0.5em; color:var(--text-primary);">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.15rem; margin:1em 0 0.5em; color:var(--text-primary);">$1</h2>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/《(.+?)》/g, '<span style="color:var(--accent);font-weight:500">《$1》</span>');
        html = html.replace(/^[-*] (.+)$/gm, '<span style="display:block;padding-left:1em;text-indent:-0.6em">• $1</span>');
        html = html.replace(/^(\d+)\. (.+)$/gm, '<span style="display:block;padding-left:1em;text-indent:-0.6em">$1. $2</span>');
        return html;
    }

    function extractBookId(url) {
        const match = String(url || '').match(/\/page\/(\d+)/);
        return match ? match[1] : '';
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }

    function escapeAttr(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
});
