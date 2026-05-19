// 在生成后为所有 HTML 文件添加 CSP HTTP 头
'use strict';

hexo.extend.filter.register('after_generate', function() {
  const fs = require('fs');
  const path = require('path');
  const publicDir = hexo.public_dir;

  // 从配置中读取 CSP 策略，如果未启用则不添加
  if (!hexo.config.csp || !hexo.config.csp.enable) {
    return;
  }

  let cspPolicy = '';
  if (hexo.config.csp.policy) {
    const policy = hexo.config.csp.policy;
    const directives = [];
    for (const [key, value] of Object.entries(policy)) {
      directives.push(`${key} ${value}`);
    }
    cspPolicy = directives.join('; ');
  } else {
    return;
  }

  // 递归处理所有 HTML 文件
  function processDir(dir) {
    try {
      const files = fs.readdirSync(dir);

      files.forEach(file => {
        try {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            processDir(filePath);
          } else if (file.endsWith('.html')) {
            let content = fs.readFileSync(filePath, 'utf8');
            const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${cspPolicy}">`;

            // 检查是否已有 CSP meta 标签，有则替换，没有则添加
            if (content.includes('Content-Security-Policy')) {
              // 替换现有的 CSP meta 标签
              content = content.replace(
                /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i,
                cspMetaTag
              );
            } else {
              // 在 <head> 后面添加 CSP meta 标签
              content = content.replace(
                /<head>/i,
                `<head>\n  ${cspMetaTag}`
              );
            }

            fs.writeFileSync(filePath, content, 'utf8');
          }
        } catch (err) {
          // 忽略单个文件的错误
        }
      });
    } catch (err) {
      // 忽略目录错误
    }
  }

  try {
    processDir(publicDir);
  } catch (err) {
    console.error('CSP header script error:', err);
  }
});

