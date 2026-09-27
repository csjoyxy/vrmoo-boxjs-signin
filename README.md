# VR魔趣自动签到

vrmoo.net 多账号每日自动签到脚本，基于 BoxJS + Loon 定时任务，带 Token 缓存。一次配置，每天自动跑完所有账号。

## 功能特性

- **多账号**：账号配在 BoxJS 里，一个脚本依次跑完所有号
- **Token 缓存**：每个账号独立缓存 Token，不用每次重新登录
- **自动重登**：Token 失效（401/403）自动重新登录并更新缓存
- **防并发**：账号之间随机等待 2–5 秒
- **结果验证**：签到后再次查询确认，通知里带奖励积分、连续签到天数和总积分

## 使用方法

### 1. BoxJS 订阅

在 BoxJS「订阅」里添加：

```
https://raw.githubusercontent.com/csjoyxy/vrmoo-boxjs-signin/main/boxjs.json
```

然后在 BoxJS 中填写 `vrmoo_accounts`，格式为 JSON 数组：

```json
[
  { "username": "账号1", "password": "密码1" },
  { "username": "账号2", "password": "密码2" }
]
```

`username` 支持邮箱或用户名。

### 2. Loon 定时任务

在 Loon `[Script]` 段添加：

```
cron "5 9 * * *" script-path=https://raw.githubusercontent.com/csjoyxy/vrmoo-boxjs-signin/main/vrmoo-signin.js, tag=VR魔趣签到, enabled=true
```

每天 9:05 自动执行。Surge / Stash 的定时任务写法类似，脚本通用。

## 文件说明

| 文件           | 说明                              |
| -------------- | --------------------------------- |
| `vrmoo-signin.js` | 签到主脚本（Loon / Surge / Stash 通用） |
| `boxjs.json`      | BoxJS 订阅文件（账号配置界面）          |

## 工作原理

1. 从 BoxJS `vrmoo_accounts` 读取账号列表
2. 每个账号优先用缓存 Token（`vrmoo_tokens`）查询签到状态
3. 当天未签到则调用签到接口，签到后再查询一次验证结果
4. 汇总所有账号结果，一次性推送通知

## 隐私说明

- 账号、密码只保存在你手机 BoxJS 本地（`vrmoo_accounts`），**不会**上传到本仓库
- Token 同样缓存在 BoxJS 本地（`vrmoo_tokens`）
- 本仓库不含任何账号、密码、Token 等敏感信息

## License

[MIT](LICENSE)
