// 为 GitHub Trending 日报文章注入「仓库爱心标记」交互（localStorage 本地持久化，无需后端）
'use strict';

var ARTICLE_DIR = '_posts/github-trending-daily/';
var STORE_KEY = 'trending-repo-votes';

// 构建期：给每篇日报的每个仓库小节标题后追加爱心按钮，并在首个仓库小节前注入汇总条
hexo.extend.filter.register('after_post_render', function(data) {
  if (!data.source || data.source.indexOf(ARTICLE_DIR) !== 0) return data;

  var count = 0;
  data.content = data.content.replace(/<h2[^>]*>[\s\S]*?<\/h2>/g, function(h2) {
    var m = h2.match(/href="https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"/);
    if (!m) return h2;
    count++;
    return h2 + '\n<button class="repo-vote-btn" type="button" data-repo="' + m[1] + '" aria-pressed="false">' +
      '<span class="repo-vote-heart" aria-hidden="true">♡</span>' +
      '<span class="repo-vote-text">有价值</span></button>';
  });
  if (!count) return data;

  var date = data.date && typeof data.date.format === 'function' ? data.date.format('YYYY-MM-DD') : '';
  var summary = '<div class="repo-vote-summary" data-article="' + date + '" aria-live="polite"></div>\n';
  data.content = data.content.replace(/<h2/, summary + '<h2');
  return data;
});

var CSS = '<style>' +
  '.repo-vote-summary{margin:0 0 1em;padding:.6em .9em;font-size:.85em;line-height:1.8;background:rgba(128,128,128,.08);border-radius:6px}' +
  '.repo-vote-summary code{padding:0 .3em}' +
  '.repo-vote-btn{display:inline-flex;align-items:center;gap:.35em;margin:0 0 1em;padding:.1em .75em;font-size:.8em;line-height:1.8;cursor:pointer;background:transparent;border:1px solid rgba(128,128,128,.45);border-radius:999px;color:inherit;opacity:.85;transition:all .15s ease}' +
  '.repo-vote-btn:hover{border-color:#e0245e;color:#e0245e;opacity:1}' +
  '.repo-vote-btn.voted{border-color:#e0245e;color:#e0245e;opacity:1;background:rgba(224,36,94,.08)}' +
  '.repo-vote-btn .repo-vote-heart{font-size:1.15em}' +
  '</style>';

var JS = '<script>(function(){' +
  'var STORE_KEY="' + STORE_KEY + '";' +
  'function load(){try{return JSON.parse(localStorage.getItem(STORE_KEY))||{}}catch(e){return{}}}' +
  'function save(m){try{localStorage.setItem(STORE_KEY,JSON.stringify(m))}catch(e){}}' +
  'function render(){' +
  'var votes=load();' +
  'var btns=document.querySelectorAll(".repo-vote-btn");' +
  'var voted=[];' +
  'btns.forEach(function(b){' +
  'var repo=b.getAttribute("data-repo");' +
  'var v=!!votes[repo];' +
  'b.classList.toggle("voted",v);' +
  'b.setAttribute("aria-pressed",v?"true":"false");' +
  'b.querySelector(".repo-vote-heart").textContent=v?"♥":"♡";' +
  'b.querySelector(".repo-vote-text").textContent=v?"已标记":"有价值";' +
  'if(v)voted.push(repo);' +
  '});' +
  'var s=document.querySelector(".repo-vote-summary");' +
  'if(!s)return;' +
  'if(voted.length){' +
  's.innerHTML="♥ 本文你已标记 <b>"+voted.length+"</b> / "+btns.length+" 个有价值的仓库："+' +
  'voted.map(function(r){return "<code>"+r+"</code>"}).join("、");' +
  '}else{' +
  's.innerHTML="♡ 觉得哪个仓库有价值？点仓库标题下方的「有价值」标记，以后再看本文就能一眼找回。";' +
  '}' +
  '}' +
  'document.addEventListener("click",function(e){' +
  'var el=e.target&&e.target.closest?e.target.closest(".repo-vote-btn"):null;' +
  'if(!el)return;' +
  'var repo=el.getAttribute("data-repo");' +
  'var votes=load();' +
  'if(votes[repo]){delete votes[repo]}else{' +
  'var s=document.querySelector(".repo-vote-summary");' +
  'votes[repo]=s&&s.getAttribute("data-article")||new Date().toISOString().slice(0,10);' +
  '}' +
  'save(votes);render();' +
  '});' +
  'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",render)}else{render()}' +
  '})();</script>';

hexo.extend.injector.register('head_end', CSS, 'post');
hexo.extend.injector.register('body_end', JS, 'post');
