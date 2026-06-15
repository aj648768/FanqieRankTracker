import os
import json
import time
import sys
from datetime import datetime
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

START_CODE = 58344  # 0xE3E8
CHAR_SEQUENCE = [
    "D", "在", "主", "特", "家", "军", "然", "表", "场", "4", "要", "只", "v", "和", "?", "6", "别", "还", "g", "现", "儿", "岁", "?", "?", "此", "象", "月", "3", "出", "战", "工", "相", "o", "男", "直", "失", "世", "F", "都", "平", "文", "什", "V", "O", "将", "真", "T", "那", "当", "?", "会", "立", "些", "u", "是", "十", "张", "学", "气", "大", "爱", "两", "命", "全", "后", "东", "性", "通", "被", "1", "它", "乐", "接", "而", "感", "车", "山", "公", "了", "常", "以", "何", "可", "话", "先", "p", "i", "叫", "轻", "M", "士", "w", "着", "变", "尔", "快", "l", "个", "说", "少", "色", "里", "安", "花", "远", "7", "难", "师", "放", "t", "报", "认", "面", "道", "S", "?", "克", "地", "度", "I", "好", "机", "U", "民", "写", "把", "万", "同", "水", "新", "没", "书", "电", "吃", "像", "斯", "5", "为", "y", "白", "几", "日", "教", "看", "但", "第", "加", "候", "作", "上", "拉", "住", "有", "法", "r", "事", "应", "位", "利", "你", "声", "身", "国", "问", "马", "女", "他", "Y", "比", "父", "x", "A", "H", "N", "s", "X", "边", "美", "对", "所", "金", "活", "回", "意", "到", "z", "从", "j", "知", "又", "内", "因", "点", "Q", "三", "定", "8", "R", "b", "正", "或", "夫", "向", "德", "听", "更", "?", "得", "告", "并", "本", "q", "过", "记", "L", "让", "打", "f", "人", "就", "者", "去", "原", "满", "体", "做", "经", "K", "走", "如", "孩", "c", "G", "给", "使", "物", "?", "最", "笑", "部", "?", "员", "等", "受", "k", "行", "一", "条", "果", "动", "光", "门", "头", "见", "往", "自", "解", "成", "处", "天", "能", "于", "名", "其", "发", "总", "母", "的", "死", "手", "入", "路", "进", "心", "来", "h", "时", "力", "多", "开", "已", "许", "d", "至", "由", "很", "界", "n", "小", "与", "Z", "想", "代", "么", "分", "生", "口", "再", "妈", "望", "次", "西", "风", "种", "带", "J", "?", "实", "情", "才", "这", "?", "E", "我", "神", "格", "长", "觉", "间", "年", "眼", "无", "不", "亲", "关", "结", "0", "友", "信", "下", "却", "重", "己", "老", "2", "音", "字", "m", "呢", "明", "之", "前", "高", "P", "B", "目", "太", "e", "9", "起", "稜", "她", "也", "W", "用", "方", "子", "英", "每", "理", "便", "四", "数", "期", "中", "C", "外", "样", "a", "海", "们", "任"
]

def decode_text(text: str) -> str:
    if not text:
        return ""
    result = []
    for char in text:
        code = ord(char)
        idx = code - START_CODE
        if 0 <= idx < len(CHAR_SEQUENCE):
            result.append(CHAR_SEQUENCE[idx])
        else:
            result.append(char)
    return "".join(result)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

RANK_BOARDS = [
    {
        "key": "female_new",
        "name": "女频新书榜",
        "init_url": "https://fanqienovel.com/rank/0_1_1139",
        "href_marker": "/rank/0_1_",
    },
    {
        "key": "female_read",
        "name": "女频阅读榜",
        "init_url": "https://fanqienovel.com/rank/0_2_1139",
        "href_marker": "/rank/0_2_",
    },
    {
        "key": "male_new",
        "name": "男频新书榜",
        "init_url": "https://fanqienovel.com/rank/1_1_1141",
        "href_marker": "/rank/1_1_",
    },
    {
        "key": "male_read",
        "name": "男频阅读榜",
        "init_url": "https://fanqienovel.com/rank/1_2_1141",
        "href_marker": "/rank/1_2_",
    },
]


def board_task_id(board_key: str, category_name: str) -> str:
    return f"{board_key}/{category_name}"


def load_json_if_exists(path: str, fallback):
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback


def find_board(boards: list, board_key: str):
    for board in boards:
        if board.get("key") == board_key:
            return board
    return None


def normalize_existing_boards(existing: dict) -> list:
    if isinstance(existing.get("boards"), list):
        return existing["boards"]
    if isinstance(existing.get("categories"), list):
        return [{
            "key": "female_new",
            "name": "女频新书榜",
            "categories": existing["categories"],
        }]
    return []


def upsert_board(boards: list, board_payload: dict):
    for idx, board in enumerate(boards):
        if board.get("key") == board_payload.get("key"):
            boards[idx] = board_payload
            return
    boards.append(board_payload)


def write_snapshots(date_str: str, boards: list, output_file: str,
                    legacy_output_file: str):
    snapshot = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "boards": boards,
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    legacy_board = find_board(boards, "female_new")
    if legacy_board:
        legacy_snapshot = {
            "date": snapshot["date"],
            "categories": legacy_board.get("categories", []),
        }
        with open(legacy_output_file, "w", encoding="utf-8") as f:
            json.dump(legacy_snapshot, f, ensure_ascii=False, indent=2)


def run_scraper(limit=30, sleep_sec=5):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    date_str = datetime.now().strftime("%Y%m%d")
    output_file = os.path.join(OUTPUT_DIR, f"fanqie_ranks_{date_str}.json")
    legacy_output_file = os.path.join(
        OUTPUT_DIR, f"fanqie_female_new_ranks_{date_str}.json"
    )
    state_file = os.path.join(OUTPUT_DIR, f"task_state_{date_str}.json")

    state = load_json_if_exists(state_file, {})
    completed_tasks = set(state.get("completed", []))
    existing = load_json_if_exists(output_file, {})
    if not existing and os.path.exists(legacy_output_file):
        existing = load_json_if_exists(legacy_output_file, {})
    all_boards = normalize_existing_boards(existing)
    
    with sync_playwright() as p:
        if os.environ.get("GITHUB_ACTIONS"):
            browser = p.chromium.launch(headless=True)
        else:
            browser = p.chromium.launch(headless=True, channel="chrome")
        # Create a new context with a normal user agent
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        extract_js = """
        () => {
            const bookMap = new Map();
            const links = document.querySelectorAll('a[href^="/page/"]');
            links.forEach(link => {
                let container = link.parentElement;
                let depth = 0;
                while (container && depth < 6) {
                    if (container.querySelector('img') && container.innerText.includes('在读')) {
                        const href = link.getAttribute('href');
                        if (!bookMap.has(href)) {
                            bookMap.set(href, container);
                        }
                        break;
                    }
                    container = container.parentElement;
                    depth++;
                }
            });

            const cards = Array.from(bookMap.values());
            const results = [];
            for (const item of cards) {
                let imgNode = item.querySelector('img');
                let cover = imgNode ? imgNode.getAttribute('src') : "";

                let title = "";
                if (imgNode && imgNode.getAttribute('alt')) {
                    title = imgNode.getAttribute('alt').trim();
                }
                if (!title) {
                    let textTitleNode = item.querySelector('h4, .title, h1') || item.querySelector('a[href^="/page/"]');
                    if (textTitleNode) {
                        let text = textTitleNode.innerText.trim();
                        if (text && !/^\\d+$/.test(text)) {
                            title = text;
                        }
                    }
                }
                if (!title) title = "未知";
                if (title.includes("榜单说明")) continue;

                let authorNode = item.querySelector('.author, .author-name') || item.querySelector('a[href^="/author-page/"]');
                let author = authorNode ? authorNode.innerText.trim() : "未知";

                let reads = "未知";
                const lines = item.innerText.split('\\n');
                for (let line of lines) {
                    if (line.includes('在读')) {
                        reads = line;
                        break;
                    }
                }

                let introNode = item.querySelector('.intro, .abstract, .desc');
                let intro = introNode ? introNode.innerText.trim() : "暂无简介";

                const pageLink = item.querySelector('a[href^="/page/"]');
                results.push({
                    title,
                    author,
                    reads,
                    intro,
                    cover,
                    url: pageLink ? pageLink.getAttribute('href') : ""
                });
            }
            return results;
        }
        """

        for board in RANK_BOARDS:
            board_key = board["key"]
            board_name = board["name"]
            board_payload = find_board(all_boards, board_key) or {
                "key": board_key,
                "name": board_name,
                "categories": [],
            }
            category_payloads = board_payload.get("categories", [])
            completed_names = {
                task.split("/", 1)[1]
                for task in completed_tasks
                if task.startswith(f"{board_key}/")
            }

            print(
                f"\n[{datetime.now().strftime('%H:%M:%S')}] "
                f"初始化榜单：{board_name} -> {board['init_url']}"
            )
            page.goto(board["init_url"], wait_until="load", timeout=20000)
            page.wait_for_selector('a[href^="/page/"]', timeout=8000)

            categories_js = f"""
            () => {{
                const seen = new Set();
                return Array.from(document.querySelectorAll('a'))
                    .filter(a => a.href.includes('{board["href_marker"]}'))
                    .map(a => ({{
                        name: a.innerText.trim(),
                        href: a.getAttribute('href')
                    }}))
                    .filter(item => {{
                        if (!item.name || !item.href || seen.has(item.href)) return false;
                        seen.add(item.href);
                        return true;
                    }});
            }}
            """
            categories = page.evaluate(categories_js)
            print(f"✅ {board_name} 提取到 {len(categories)} 个分类。")

            for cat in categories:
                cat_name = cat["name"]
                cat_href = cat["href"]
                task_id = board_task_id(board_key, cat_name)

                if task_id in completed_tasks or cat_name in completed_names:
                    print(
                        f"[{datetime.now().strftime('%H:%M:%S')}] "
                        f"⏭️ 跳过已完成：{board_name} / {cat_name}"
                    )
                    continue

                target_url = (
                    cat_href if cat_href.startswith("http")
                    else "https://fanqienovel.com" + cat_href
                )
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] "
                    f"抓取 -> {board_name} / {cat_name}"
                )
                try:
                    page.goto(target_url, wait_until="load", timeout=20000)
                    time.sleep(2)
                    page.wait_for_selector('a[href^="/page/"]', timeout=8000)
                except Exception as e:
                    print(f"切换分类出错或加载超时 {board_name} / {cat_name}: {e}")

                for _ in range(3):
                    page.evaluate("window.scrollBy(0, window.innerHeight)")
                    time.sleep(1.5)

                try:
                    books_data = page.evaluate(extract_js)
                except Exception as e:
                    print(f"执行JS抽取失败 {board_name} / {cat_name}: {e}")
                    books_data = []

                category_books = []
                for b in books_data[:limit]:
                    t = decode_text(b.get("title", ""))
                    a = decode_text(b.get("author", ""))
                    r_raw = decode_text(b.get("reads", ""))
                    i = decode_text(b.get("intro", "")).replace("\\n", " ")
                    c = b.get("cover", "")

                    if "在读" in r_raw:
                        parts = r_raw.split("在读")
                        cleaned_r = (
                            parts[1].replace(":", "").replace("：", "").strip()
                            if len(parts) > 1 else r_raw
                        )
                    else:
                        cleaned_r = r_raw

                    book_url = b.get("url", "")
                    if book_url and not book_url.startswith("http"):
                        book_url = "https://fanqienovel.com" + book_url

                    category_books.append({
                        "title": t,
                        "author": a,
                        "reads": cleaned_r,
                        "intro": i,
                        "cover": c,
                        "url": book_url,
                    })

                category_payloads = [
                    item for item in category_payloads
                    if item.get("name") != cat_name
                ]
                category_payloads.append({
                    "name": cat_name,
                    "books": category_books,
                })

                board_payload = {
                    "key": board_key,
                    "name": board_name,
                    "categories": category_payloads,
                }
                upsert_board(all_boards, board_payload)
                write_snapshots(
                    date_str, all_boards, output_file, legacy_output_file
                )

                completed_tasks.add(task_id)
                with open(state_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {"completed": sorted(completed_tasks)},
                        f,
                        ensure_ascii=False,
                    )

                print(
                    f"成功抓取 {board_name} / {cat_name} 前 "
                    f"{len(category_books)} 本，等待 {sleep_sec} 秒防拦截..."
                )
                time.sleep(sleep_sec)
        
        browser.close()
        
    print(f"\n✅ 当日四榜任务已完毕或刷新！数据源：{output_file}")

if __name__ == "__main__":
    print("开始执行番茄四榜抓取计划...")
    run_scraper(limit=30, sleep_sec=5)
