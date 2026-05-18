// 在生成后为所有 HTML 文件添加 CSP HTTP 头
'use strict';

hexo.extend.filter.register('after_generate', function() {
  const fs = require('fs');
  const path = require('path');
  const publicDir = hexo.public_dir;

  // CSP 策略
  const cspPolicy = "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://v.api.aa1.cn; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https:; frame-ancestors 'self'";

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

            // 检查是否已有 CSP meta 标签
            if (!content.includes('Content-Security-Policy')) {
              // 在 <head> 后面添加 CSP meta 标签
              content = content.replace(
                /<head>/i,
                `<head>\n  <meta http-equiv="Content-Security-Policy" content="${cspPolicy}">`
              );

              fs.writeFileSync(filePath, content, 'utf8');
            }
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

