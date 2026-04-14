const profiles = [
    // --- [帳號 1] 明日方舟台服 ---
    {
        game: "arknights",
        cred: "",                // 填入 cred
        uid: "",                 // 填入明日方舟 UID
        accountName: "方舟帳號名稱"
    },
    // --- [帳號 2] 終末地 ---
    {
        game: "endfield",
        cred: "",                // 填入 cred
        uid: "",                 // 填入終末地 UID
        server: "2",             // Asia=2, Americas/Europe=3
        accountName: "終末地帳號名稱"
    }
];

const discord_notify = true;
const myDiscordID = "";
const discordWebhook = "";

/** ================= Config Ends ================= **/

const GLOBAL_CONF = {
    platform: "3",
    vName: "1.0.0",
    baseUrl: "https://zonai.skport.com"
};

const ENFIELD_ITEM_MAP = {
    "1": "中級作戰紀錄", "2": "初級認知載體", "3": "高級作戰紀錄",
    "4": "武器檢查裝置", "5": "武器檢查套組", "6": "協議稜柱",
    "7": "折金票", "8": "嵌晶玉"
};

async function main() {
    console.log("🚀 簽到腳本啟動...");
    const results = await Promise.all(profiles.map(profile => {
        if (profile.game === 'arknights') {
            return autoClaimArknights(profile);
        } else if (profile.game === 'endfield') {
            return autoClaimEndfield(profile);
        } else {
            return { name: profile.accountName, gameFlag: "❓ 未知", success: false, status: "設定錯誤", rewards: "未知的遊戲類型" };
        }
    }));

    if (discord_notify && discordWebhook) {
        postWebhook(results);
    }
    console.log("🏁 所有任務執行完畢。");
}

/** 明日方舟簽到邏輯 **/
function autoClaimArknights(profile) {
    const { cred, uid, accountName } = profile;
    const { platform, vName, baseUrl } = GLOBAL_CONF;
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = `/api/v1/game/attendance`;
    const attendanceUrl = baseUrl + path;
    const refreshUrl = `${baseUrl}/api/v1/auth/refresh`;
    const requestBody = JSON.stringify({ gameId: 1, uid: uid });

    let token = refreshToken(cred, platform, vName, refreshUrl);
    const sign = generateSign(path, requestBody, timestamp, token, platform, vName);

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'cred': cred, 'platform': platform, 'vName': vName, 'timestamp': timestamp, 'sign': sign
    };

    return executeRequest(attendanceUrl, { method: 'POST', headers: headers, payload: requestBody, muteHttpExceptions: true }, accountName, "💊 方舟台服");
}

/** 終末地簽到邏輯 **/
function autoClaimEndfield(profile) {
    const { cred, uid, server, accountName } = profile;
    const { platform, vName, baseUrl } = GLOBAL_CONF;

    const skGameRole = `3_${uid}_${server}`; // 自動組合
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = '/web/v1/game/endfield/attendance';
    const attendanceUrl = baseUrl + path;
    const refreshUrl = `${baseUrl}/web/v1/auth/refresh`;

    let token = refreshToken(cred, platform, vName, refreshUrl);
    const sign = generateSign(path, '', timestamp, token, platform, vName);

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'sk-language': 'zh-Hant',
        'sk-game-role': skGameRole,
        'cred': cred, 'platform': platform, 'vName': vName, 'timestamp': timestamp, 'sign': sign
    };

    return executeRequest(attendanceUrl, { method: 'POST', headers: headers, payload: "", muteHttpExceptions: true }, accountName, "🌍 終末地");
}

/** 通用執行器 **/
function executeRequest(url, options, accountName, gameFlag) {
    let result = { name: accountName, gameFlag: gameFlag, success: false, status: "", rewards: "" };
    try {
        const response = UrlFetchApp.fetch(url, options);
        const res = JSON.parse(response.getContentText());
        console.log(`[${accountName}] 回應: ${res.code}`);

        if (res.code === 0) {
            result.success = true;
            result.status = "✅ 簽到成功";
            if (res.data && res.data.awards) {
                result.rewards = res.data.awards.map(a => `${a.resource?.name || '物品'} x${a.count}`).join('\n');
            } else if (res.data && res.data.awardIds) {
                result.rewards = res.data.awardIds.map(a => {
                    const typeId = a.id.split('_')[2];
                    return `${ENFIELD_ITEM_MAP[typeId] || '未知物品'} x${a.count}`;
                }).join('\n');
            }
        } else if (res.code === 10001 || res.code === 10002) {
            result.success = true;
            result.status = "👌 今日已簽到";
            result.rewards = "獎勵已領取。";
        } else {
            result.status = `❌ 錯誤 (${res.code})`;
            result.rewards = res.message || "未知錯誤";
        }
    } catch (e) {
        result.status = "💥 例外錯誤";
        result.rewards = e.message;
    }
    return result;
}

/** 工具函式 **/
function refreshToken(cred, platform, vName, url) {
    const h = { 'cred': cred, 'platform': platform, 'vName': vName };
    try {
        const res = JSON.parse(UrlFetchApp.fetch(url, { headers: h, muteHttpExceptions: true }).getContentText());
        return (res.code === 0) ? res.data.token : "";
    } catch (e) { return ""; }
}

function generateSign(path, body, ts, token, plat, v) {
    const str = path + body + ts + `{"platform":"${plat}","timestamp":"${ts}","dId":"","vName":"${v}"}`;
    const hmac = bytesToHex(Utilities.computeHmacSha256Signature(str, token || ''));
    return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, hmac));
}

function bytesToHex(bytes) {
    return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function postWebhook(results) {
    const payload = {
        username: "Skport 簽到助手",
        avatar_url: 'https://i.imgur.com/TguAOiA.png',
        embeds: [{
            title: "📡 每日簽到報告",
            color: results.every(r => r.success) ? 5763719 : 15548997,
            fields: results.map(r => ({ name: `${r.gameFlag} | ${r.name}`, value: `**狀態：** ${r.status}\n**獎勵：**\n${r.rewards}`, inline: true })),
            footer: {
                text: `時間：${new Date().toLocaleString('zh-Hant', { timeZone: 'Asia/Taipei' })}（台灣時間）`,
                icon_url: "https://assets.skport.com/assets/favicon.ico"
            }
        }]
    };
    UrlFetchApp.fetch(discordWebhook, { method: 'POST', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
}
