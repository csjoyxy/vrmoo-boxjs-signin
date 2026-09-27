/*
 * VR魔趣签到 - Token缓存版
 *
 * 流程：
 * 1. 优先读取每个账号缓存 Token
 * 2. 使用缓存 Token 调用 getUserMission
 * 3. Token 有效 → 不登录，直接继续签到
 * 4. Token 返回 401/403 → 自动重新登录
 * 5. 登录成功后自动保存新 Token
 * 6. credit=0 才执行 userMission
 * 7. userMission 使用 body:null
 * 8. 签到后再次 getUserMission 验证
 * 9. 网络超时不直接判定 Token 失效
 * 10. 两个账号独立保存 Token
 * 11. 账号之间随机等待 2~5 秒
 */

const HOST = "https://www.vrmoo.net";

const ACCOUNT_KEY = "vrmoo_accounts";

// Token 独立缓存
const TOKEN_KEY = "vrmoo_tokens";


// ========================================
// UA
// ========================================
function getUA() {

    return "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4_1 like Mac OS X) " +
           "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
           "Version/16.4 Mobile/15E148 Safari/604.1";
}


// ========================================
// 延迟
// ========================================
function sleep(ms) {

    return new Promise(resolve => {

        setTimeout(resolve, ms);

    });
}


function randomDelay() {

    const ms =
        2000 +
        Math.floor(Math.random() * 3000);

    return sleep(ms);
}


// ========================================
// Token 缓存读取
// ========================================
function loadTokens() {

    try {

        const raw =
            $persistentStore.read(
                TOKEN_KEY
            );

        if (!raw) {

            return {};
        }

        const obj =
            JSON.parse(raw);

        if (
            obj &&
            typeof obj === "object"
        ) {

            return obj;
        }

    } catch (e) {

        console.log(
            "[vrmoo] Token缓存读取异常: " +
            e
        );
    }

    return {};
}


// ========================================
// Token 缓存保存
// ========================================
function saveTokens(tokens) {

    try {

        $persistentStore.write(
            JSON.stringify(tokens),
            TOKEN_KEY
        );

        return true;

    } catch (e) {

        console.log(
            "[vrmoo] Token缓存保存异常: " +
            e
        );

        return false;
    }
}


// ========================================
// 获取某个账号的缓存 Token
// ========================================
function getCachedToken(username) {

    const tokens =
        loadTokens();

    const token =
        tokens[username];

    if (
        typeof token === "string" &&
        token.length > 0
    ) {

        return token;
    }

    return null;
}


// ========================================
// 保存某个账号 Token
// ========================================
function setCachedToken(username, token) {

    const tokens =
        loadTokens();

    tokens[username] =
        token;

    saveTokens(tokens);
}


// ========================================
// 删除某个账号 Token
// ========================================
function removeCachedToken(username) {

    const tokens =
        loadTokens();

    if (
        Object.prototype.hasOwnProperty.call(
            tokens,
            username
        )
    ) {

        delete tokens[username];

        saveTokens(tokens);
    }
}


// ========================================
// 登录
// ========================================
function login(account) {

    return new Promise(resolve => {

        const body =
            "nickname=" +
            "&username=" +
            encodeURIComponent(account.username) +
            "&password=" +
            encodeURIComponent(account.password) +
            "&code=" +
            "&img_code=" +
            "&invitation_code=" +
            "&token=" +
            "&smsToken=" +
            "&luoToken=" +
            "&confirmPassword=" +
            "&loginType=";


        $httpClient.post({

            url:
                HOST +
                "/wp-json/jwt-auth/v1/token",

            headers: {

                "Content-Type":
                    "application/x-www-form-urlencoded",

                "Accept":
                    "application/json, text/plain, */*",

                "User-Agent":
                    getUA()
            },

            body:
                body

        }, (error, response, data) => {

            if (error) {

                console.log(
                    "[vrmoo] " +
                    account.username +
                    " 登录网络错误: " +
                    error
                );

                resolve(null);

                return;
            }


            const status =
                response &&
                response.status
                    ?
                    response.status
                    :
                    0;


            console.log(
                "[vrmoo] " +
                account.username +
                " 登录 HTTP=" +
                status
            );


            try {

                const json =
                    JSON.parse(data);


                if (
                    json &&
                    typeof json.token === "string" &&
                    json.token
                ) {

                    console.log(
                        "[vrmoo] " +
                        account.username +
                        " 登录成功"
                    );

                    resolve(
                        json.token
                    );

                    return;
                }


                if (
                    json &&
                    json.data &&
                    typeof json.data.token === "string" &&
                    json.data.token
                ) {

                    console.log(
                        "[vrmoo] " +
                        account.username +
                        " 登录成功"
                    );

                    resolve(
                        json.data.token
                    );

                    return;
                }


                console.log(
                    "[vrmoo] " +
                    account.username +
                    " 登录失败返回: " +
                    String(data).substring(0, 500)
                );

                resolve(null);

            } catch (e) {

                console.log(
                    "[vrmoo] " +
                    account.username +
                    " 登录返回异常: " +
                    String(data).substring(0, 500)
                );

                resolve(null);
            }

        });

    });
}


// ========================================
// 登录重试
// ========================================
async function loginWithRetry(account) {

    for (
        let i = 1;
        i <= 3;
        i++
    ) {

        if (i > 1) {

            console.log(
                "[vrmoo] " +
                account.username +
                " 登录重试 " +
                i +
                "/3..."
            );

            await sleep(3000);
        }


        const token =
            await login(account);


        if (token) {

            // 登录成功后立即保存 Token
            setCachedToken(
                account.username,
                token
            );

            console.log(
                "[vrmoo] " +
                account.username +
                " 新 Token 已保存"
            );

            return token;
        }
    }


    return null;
}


// ========================================
// 查询签到状态
//
// 返回：
// {
//   ok: true,
//   authFailed: false,
//   networkError: false,
//   data: json
// }
//
// 或：
// {
//   ok: false,
//   authFailed: true
// }
// ========================================
function getUserMission(token, username) {

    return new Promise(resolve => {

        $httpClient.post({

            url:
                HOST +
                "/wp-json/b2/v1/getUserMission",

            headers: {

                "Authorization":
                    "Bearer " + token,

                "Content-Type":
                    "application/x-www-form-urlencoded",

                "Accept":
                    "application/json, text/plain, */*",

                "User-Agent":
                    getUA(),

                "Cache-Control":
                    "no-cache",

                "Pragma":
                    "no-cache"
            },

            body:
                "count=0&paged=1"

        }, (error, response, data) => {

            if (error) {

                console.log(
                    "[vrmoo] " +
                    username +
                    " getUserMission 网络错误: " +
                    error
                );

                resolve({

                    ok: false,

                    authFailed: false,

                    networkError: true,

                    data: null
                });

                return;
            }


            const status =
                response &&
                response.status
                    ?
                    response.status
                    :
                    0;


            console.log(
                "[vrmoo] " +
                username +
                " getUserMission HTTP=" +
                status
            );


            console.log(
                "[vrmoo] " +
                username +
                " getUserMission 返回: " +
                String(data).substring(0, 1000)
            );


            // -----------------------------
            // 明确的认证失败
            // -----------------------------
            if (
                status === 401 ||
                status === 403
            ) {

                resolve({

                    ok: false,

                    authFailed: true,

                    networkError: false,

                    data: null
                });

                return;
            }


            try {

                const json =
                    JSON.parse(data);


                if (
                    json &&
                    json.mission
                ) {

                    resolve({

                        ok: true,

                        authFailed: false,

                        networkError: false,

                        data: json
                    });

                    return;
                }


                resolve({

                    ok: false,

                    authFailed: false,

                    networkError: false,

                    data: null
                });

            } catch (e) {

                resolve({

                    ok: false,

                    authFailed: false,

                    networkError: false,

                    data: null
                });
            }

        });

    });
}


// ========================================
// 真正签到
// ========================================
function doSign(token, username) {

    return new Promise(resolve => {

        $httpClient.post({

            url:
                HOST +
                "/wp-json/b2/v1/userMission",

            headers: {

                "Authorization":
                    "Bearer " + token,

                "Content-Type":
                    "application/x-www-form-urlencoded",

                "Accept":
                    "application/json, text/plain, */*",

                "User-Agent":
                    getUA(),

                "Cache-Control":
                    "no-cache",

                "Pragma":
                    "no-cache"
            },

            // 关键：必须是 null
            body: null

        }, (error, response, data) => {

            if (error) {

                console.log(
                    "[vrmoo] " +
                    username +
                    " 签到网络错误: " +
                    error
                );

                resolve({

                    ok: false,

                    authFailed: false,

                    data: null
                });

                return;
            }


            const status =
                response &&
                response.status
                    ?
                    response.status
                    :
                    0;


            console.log(
                "[vrmoo] 签到 HTTP=" +
                status +
                " 返回: " +
                String(data).substring(0, 1000)
            );


            if (
                status === 401 ||
                status === 403
            ) {

                resolve({

                    ok: false,

                    authFailed: true,

                    data: null
                });

                return;
            }


            resolve({

                ok: true,

                authFailed: false,

                data: data
            });

        });

    });
}


// ========================================
// 判断是否为真正成功的签到 JSON
// ========================================
function parseSignResult(
    username,
    raw,
    result
) {

    if (!raw) {

        result.push(
            username +
            " ❌签到无返回"
        );

        return false;
    }


    try {

        const json =
            JSON.parse(
                String(raw)
            );


        if (
            json &&
            json.date &&
            json.mission &&
            json.mission.current_user
        ) {

            const credit =
                json.credit != null
                    ?
                    String(json.credit)
                    :
                    String(
                        json.mission.credit || ""
                    );


            const always =
                json.mission.always != null
                    ?
                    String(json.mission.always)
                    :
                    "";


            const myCredit =
                json.mission.my_credit != null
                    ?
                    String(json.mission.my_credit)
                    :
                    "";


            result.push(
                username +
                " ✅签到成功 +" +
                credit +
                "积分" +
                " | 连续" +
                always +
                "天" +
                " | 总积分" +
                myCredit
            );


            return true;
        }

    } catch (e) {}


    result.push(
        username +
        " ❌签到返回异常:" +
        String(raw).substring(0, 200)
    );


    return false;
}


// ========================================
// 处理单个账号
// ========================================
async function processAccount(account) {

    const username =
        String(
            account.username
        ).trim();


    let token =
        getCachedToken(
            username
        );


    // ====================================
    // 第一阶段：
    // 优先使用缓存 Token
    // ====================================
    if (token) {

        console.log(
            "[vrmoo] " +
            username +
            " 使用缓存Token"
        );

    } else {

        console.log(
            "[vrmoo] " +
            username +
            " 无缓存Token，重新登录..."
        );


        token =
            await loginWithRetry(
                account
            );


        if (!token) {

            return {

                success: false,

                message:
                    username +
                    " ❌登录失败（3次重试仍失败）"
            };
        }
    }


    // ====================================
    // 第二阶段：
    // 使用 Token 查询签到状态
    // ====================================
    let mission =
        await getUserMission(
            token,
            username
        );


    // ====================================
    // 网络错误：
    // 不要马上删除 Token
    // 重试一次原 Token
    // ====================================
    if (
        !mission.ok &&
        mission.networkError
    ) {

        console.log(
            "[vrmoo] " +
            username +
            " getUserMission 网络异常，"
            +
            "保留Token并重试..."
        );


        await sleep(2000);


        mission =
            await getUserMission(
                token,
                username
            );
    }


    // ====================================
    // Token 明确失效
    // ====================================
    if (
        !mission.ok &&
        mission.authFailed
    ) {

        console.log(
            "[vrmoo] " +
            username +
            " 缓存Token已失效"
        );


        removeCachedToken(
            username
        );


        console.log(
            "[vrmoo] " +
            username +
            " 重新登录..."
        );


        token =
            await loginWithRetry(
                account
            );


        if (!token) {

            return {

                success: false,

                message:
                    username +
                    " ❌Token失效且重新登录失败"
            };
        }


        // 新 Token 再查询一次
        mission =
            await getUserMission(
                token,
                username
            );
    }


    // ====================================
    // 无法获得签到状态
    // ====================================
    if (
        !mission.ok ||
        !mission.data
    ) {

        return {

            success: false,

            message:
                username +
                " ❌无法获取签到状态"
        };
    }


    // ====================================
    // 读取今日状态
    // ====================================
    const m =
        mission.data.mission || {};


    const credit =
        Number(
            m.credit || 0
        );


    const always =
        String(
            m.always || ""
        );


    const myCredit =
        String(
            m.my_credit || ""
        );


    const date =
        String(
            m.date || ""
        );


    console.log(
        "[vrmoo] " +
        username +
        " 今日状态: " +
        "date=" +
        date +
        " | credit=" +
        credit +
        " | always=" +
        always +
        " | my_credit=" +
        myCredit
    );


    // ====================================
    // 已经签到
    // ====================================
    if (credit > 0) {

        return {

            success: true,

            message:
                username +
                " ℹ️今天已经签到 +" +
                credit +
                "积分" +
                " | 连续" +
                always +
                "天" +
                " | 总积分" +
                myCredit
        };
    }


    // ====================================
    // 今日未签到
    // ====================================
    console.log(
        "[vrmoo] " +
        username +
        " 今日未签到，执行签到..."
    );


    let sign =
        await doSign(
            token,
            username
        );


    // ====================================
    // 签到时 Token 失效
    // ====================================
    if (
        sign.authFailed
    ) {

        console.log(
            "[vrmoo] " +
            username +
            " 签到时Token已失效，重新登录..."
        );


        removeCachedToken(
            username
        );


        token =
            await loginWithRetry(
                account
            );


        if (!token) {

            return {

                success: false,

                message:
                    username +
                    " ❌签到时Token失效，重新登录失败"
            };
        }


        // 新 Token 登录后，
        // 再检查一次今日状态
        mission =
            await getUserMission(
                token,
                username
            );


        if (
            mission.ok &&
            mission.data &&
            mission.data.mission
        ) {

            const retryMission =
                mission.data.mission;


            const retryCredit =
                Number(
                    retryMission.credit || 0
                );


            // 如果重新登录后发现已经签到
            if (
                retryCredit > 0
            ) {

                return {

                    success: true,

                    message:
                        username +
                        " ℹ️今天已经签到 +" +
                        retryCredit +
                        "积分" +
                        " | 连续" +
                        String(
                            retryMission.always || ""
                        ) +
                        "天" +
                        " | 总积分" +
                        String(
                            retryMission.my_credit || ""
                        )
                };
            }
        }


        // 新 Token 再执行一次签到
        sign =
            await doSign(
                token,
                username
            );
    }


    // ====================================
    // 判断第一次签到是否直接成功
    // ====================================
    const result = [];


    const firstSuccess =
        parseSignResult(
            username,
            sign.data,
            result
        );


    if (firstSuccess) {

        return {

            success: true,

            message:
                result[0]
        };
    }


    // ====================================
    // 如果 userMission 返回：
    // "17" / "2"
    //
    // 不直接判定失败。
    // 再查询服务器真实状态。
    // ====================================
    console.log(
        "[vrmoo] " +
        username +
        " 签到返回非标准结果，" +
        "重新查询签到状态..."
    );


    await sleep(1000);


    const verify =
        await getUserMission(
            token,
            username
        );


    // ====================================
    // 验证时 Token 失效
    // ====================================
    if (
        verify &&
        verify.authFailed
    ) {

        console.log(
            "[vrmoo] " +
            username +
            " 验证时Token失效，重新登录..."
        );


        removeCachedToken(
            username
        );


        token =
            await loginWithRetry(
                account
            );


        if (token) {

            const verifyAfterLogin =
                await getUserMission(
                    token,
                    username
                );


            if (
                verifyAfterLogin.ok &&
                verifyAfterLogin.data &&
                verifyAfterLogin.data.mission
            ) {

                const vm =
                    verifyAfterLogin.data.mission;


                const verifyCredit =
                    Number(
                        vm.credit || 0
                    );


                if (
                    verifyCredit > 0
                ) {

                    return {

                        success: true,

                        message:
                            username +
                            " ✅签到成功 +" +
                            verifyCredit +
                            "积分" +
                            " | 连续" +
                            String(
                                vm.always || ""
                            ) +
                            "天" +
                            " | 总积分" +
                            String(
                                vm.my_credit || ""
                            )
                    };
                }
            }
        }
    }


    // ====================================
    // 正常验证
    // ====================================
    if (
        verify &&
        verify.ok &&
        verify.data &&
        verify.data.mission
    ) {

        const vm =
            verify.data.mission;


        const verifyCredit =
            Number(
                vm.credit || 0
            );


        const verifyDate =
            String(
                vm.date || ""
            );


        const verifyAlways =
            String(
                vm.always || ""
            );


        const verifyMyCredit =
            String(
                vm.my_credit || ""
            );


        console.log(
            "[vrmoo] " +
            username +
            " 签到后验证: " +
            "date=" +
            verifyDate +
            " | credit=" +
            verifyCredit +
            " | always=" +
            verifyAlways +
            " | my_credit=" +
            verifyMyCredit
        );


        if (
            verifyCredit > 0
        ) {

            return {

                success: true,

                message:
                    username +
                    " ✅签到成功 +" +
                    verifyCredit +
                    "积分" +
                    " | 连续" +
                    verifyAlways +
                    "天" +
                    " | 总积分" +
                    verifyMyCredit
            };
        }
    }


    return {

        success: false,

        message:
            username +
            " ❌签到失败，服务器未确认今日签到"
    };
}


// ========================================
// 主程序
// ========================================
(async () => {

    let accounts;


    // ====================================
    // 读取 BoxJS
    // ====================================
    try {

        const raw =
            $persistentStore.read(
                ACCOUNT_KEY
            );


        accounts =
            JSON.parse(
                raw || "[]"
            );

    } catch (e) {

        $notification.post(
            "VR魔趣签到",
            "",
            "❌账号配置 JSON 解析失败"
        );

        $done();

        return;
    }


    if (
        !Array.isArray(accounts) ||
        accounts.length === 0
    ) {

        $notification.post(
            "VR魔趣签到",
            "",
            "❌没有配置账号"
        );

        $done();

        return;
    }


    const result = [];


    // ====================================
    // 逐个账号
    // ====================================
    for (
        let i = 0;
        i < accounts.length;
        i++
    ) {

        const account =
            accounts[i];


        if (
            !account ||
            !account.username ||
            !account.password
        ) {

            result.push(
                "❌第 " +
                (i + 1) +
                " 个账号配置不完整"
            );

            continue;
        }


        // -------------------------------
        // 第二个账号开始随机等待
        // -------------------------------
        if (i > 0) {

            console.log(
                "[vrmoo] 等待延迟..."
            );

            await randomDelay();
        }


        const r =
            await processAccount(
                account
            );


        result.push(
            r.message
        );
    }


    // ====================================
    // 最终日志
    // ====================================
    const finalMessage =
        result.join("\n");


    console.log(
        "[vrmoo] 完成:\n" +
        finalMessage
    );


    $notification.post(
        "VR魔趣签到",
        "",
        finalMessage
    );


    $done();

})();
