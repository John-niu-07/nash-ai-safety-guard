/**
 * Nash Hook Handler for OpenClaw
 * 
 * 在消息到达 LLM 之前进行安全检查
 * 处理 message:received 事件
 */

const http = require('http');

const NASH_HOST = '127.0.0.1';
const NASH_PORT = 8768;
const TIMEOUT = 3000;

const log = (msg) => console.log(`[nash] ${msg}`);
const error = (msg) => console.error(`[nash] ${msg}`);

/**
 * 调用 Nash 服务进行安全检查
 */
function checkSafety(content, userId) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            user_id: userId,
            content: content,
        });

        const options = {
            hostname: NASH_HOST,
            port: NASH_PORT,
            path: '/check',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: TIMEOUT,
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`解析响应失败：${e.message}`));
                }
            });
        });

        req.on('error', (e) => {
            error(`请求失败：${e.message}`);
            // Fail-open: 服务不可用时放行
            resolve({ allowed: true, blocked: false, message: '' });
        });

        req.on('timeout', () => {
            error('请求超时');
            req.destroy();
            // Fail-open: 超时放行
            resolve({ allowed: true, blocked: false, message: '' });
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Hook 处理器
 */
const handler = async (event) => {
    const { type, action, context } = event;
    
    // 只处理 received 事件
    if (type !== 'message' || action !== 'received') {
        return null;
    }
    
    const content = context?.content || context?.command || '';
    const userId = context?.from || context?.user_id || 'unknown';
    const channel = context?.channel || context?.channelId || 'unknown';
    
    if (!content || content.trim() === '') {
        return null;
    }

    try {
        const result = await checkSafety(content, userId);

        // 拦截
        if (result.blocked) {
            log(`🚫 阻止消息 from=${userId}, channel=${channel}, score=${result.risk_score}, method=${result.detection_method}`);
            return {
                block: true,
                reply: result.message || '您的消息触发了安全策略。',
            };
        }

        // 放行
        return null;

    } catch (err) {
        error(`错误：${err.message}`);
        // Fail-open: 出错时放行
        return null;
    }
};

module.exports = handler;
