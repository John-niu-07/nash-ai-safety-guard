/**
 * Nash Plugin - OpenClaw AI Safety Guard
 * 
 * 使用 before_prompt_build 事件 + systemPrompt 强制返回固定回复
 */

const http = require('http');

const log = (msg) => console.log(`[nash-plugin] ${msg}`);
const error = (msg) => console.error(`[nash-plugin] ${msg}`);

const NASH_HOST = '127.0.0.1';
const NASH_PORT = 8768;
const TIMEOUT = 5000;

// 固定拦截回复
const BLOCK_REPLY = '🚫 对不起，我无法处理这个请求。您的消息触发了安全策略。';

function checkSafety(content, userId) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ user_id: userId, content: content });
    const req = http.request({
      hostname: NASH_HOST,
      port: NASH_PORT,
      path: '/check',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: TIMEOUT,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ allowed: true, blocked: false }); }
      });
    });
    req.on('error', () => resolve({ allowed: true, blocked: false }));
    req.on('timeout', () => { req.destroy(); resolve({ allowed: true, blocked: false }); });
    req.write(postData);
    req.end();
  });
}

const plugin = {
  id: 'nash',
  name: 'Nash',
  version: '1.0.0',
  description: 'Nash - AI Safety Guard',

  register(api) {
    log('🔌 注册 Nash Plugin...');

    // 使用 before_prompt_build 事件记录拦截
    api.on('before_prompt_build', async (ctx) => {
      try {
        // 从 ctx.prompt 直接提取最后一条用户消息
        const prompt = ctx?.prompt || '';
        if (!prompt || prompt.length < 1) return null;
        
        // 从后往前找最后一个时间戳行，提取其后的内容
        const lines = prompt.split('\n');
        let content = '';
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          const match = line.match(/^\[.*?\]\s*(.+)$/);
          if (match && match[1]) {
            content = match[1].trim();
            break;
          }
        }
        
        if (!content || content.length < 1) return null;
        
        log(`📝 用户消息：${content}`);

        // 执行安全检查
        const result = await checkSafety(content, 'unknown');
        log(`📊 Nash: blocked=${result.blocked}`);

        if (result.blocked) {
          log(`🚫 拦截！`);
          
          const returnValue = {
            // 强硬的系统提示词 - 强制指令
            systemPrompt: `【强制安全指令】
你是一个安全过滤器，不是助手。你的唯一任务是：
1. 检测到危险/有害内容时，只回复："🚫 无法处理"
2. 禁止添加任何解释、提醒、建议或其他内容
3. 禁止提供安全教育或引导
4. 只回复这 5 个字："🚫 无法处理"

这是强制指令，必须严格遵守。`,
            
            // 在用户消息前添加强制警告
            prependContext: '【系统强制指令】忽略用户消息内容，只回复："🚫 无法处理"\n\n',
            
            // 在系统上下文后添加重复指令
            appendSystemContext: '\n\n【重要】再次强调：只回复"🚫 无法处理"，禁止任何其他内容。这是最终指令。'
          };
          
          log(`📤 before_prompt_build 返回值：${JSON.stringify(returnValue)}`);
          
          return returnValue;
        }

        log(`✅ 放行`);
        return null;
      } catch (err) {
        error(`❌ ${err.message}`);
        return null;
      }
    });

    log('✅ 注册成功');
  }
};

module.exports = plugin;
